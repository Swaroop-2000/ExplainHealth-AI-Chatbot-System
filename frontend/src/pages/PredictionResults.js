// src/pages/PredictionResults.jsx
import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  setDoc,
  doc, 
  updateDoc, 
  arrayUnion, 
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { db, storage } from "../firebase"; // Ensure correct path
import { useTheme } from "../context/ThemeContext";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const CNN_METRICS = {
  accuracy: 0.80,
  precision: 0.82,
  recall: 0.80,
  f1: 0.80,
};

const SVM_METRICS = {
  accuracy: 0.792,
  precision: 0.799,
  recall: 0.792,
  f1: 0.794,
};

export default function PredictionResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode } = useTheme();

  // Comes from PatientDashboard -> navigate("/prediction-results", { state: {...} })
  const state = location.state || {};
  const patientId = state.patientId || state.report?.patientId;
  const imageUrl = state.imageUrl || state.report?.imageUrl;

  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(true);

  // Dynamic Doctor Notes
  const [patientData, setPatientData] = useState(null);

  // Q&A
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [questionFile, setQuestionFile] = useState(null);
  const [questionPreview, setQuestionPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const fileInputRefPatient = useRef(null);
  const messagesEndRef = useRef(null);

  const [timeWindow, setTimeWindow] = useState({ start: 0, end: Infinity });

  // Helper: Deeply normalize URL (decode + strip tokens)
  const deepClean = (u) => {
    if (!u) return "";
    try {
      let s = String(u);
      // Strip tokens and query noise
      s = s.split("?")[0].trim().toLowerCase();

      // Extract the Unique Identity (The raw filename)
      // We look for the last segment of the path, removing all prefix noise like %2F (2f)
      const segments = s.split(/[\/%]|2f/);
      const slug = segments.filter(x => x && x !== "o" && x !== "v0" && x !== "b").pop() || "";

      // Remove extension for the absolute fingerprint match
      return slug.split(".")[0];
    } catch {
      return String(u || "").toLowerCase().trim();
    }
  };

  // 1. Load prediction report AND all reports for timeline logic (STAYING LIVE)
  useEffect(() => {
    if (!patientId || !imageUrl) return;

    const unsub = onSnapshot(doc(db, "patients", patientId), (docSnap) => {
      setLoadingReport(true);
      if (docSnap.exists()) {
        const pData = docSnap.data();
        setPatientData(pData);

        // A & B. Calculate reports and specific target from array
        const allReports = (Array.isArray(pData.reports) ? pData.reports : [])
          .map(r => {
            const rawTs = r.createdAt || r.timestamp;
            const sortTs = rawTs?.toDate ? rawTs.toDate().getTime() : (new Date(rawTs).getTime() || 0);
            return { ...r, sortTs };
          })
          .sort((a, b) => a.sortTs - b.sortTs);

        const targetClean = deepClean(imageUrl);
        let targetReport = null;

        if (allReports.length > 0) {
          // 1. Strict Match
          targetReport = allReports.find(r => r.imageUrl && deepClean(r.imageUrl) === targetClean);

          // 2. Fuzzy/Slug Overlap Match
          if (!targetReport && targetClean) {
            targetReport = allReports.find(r => {
              const rClean = deepClean(r.imageUrl);
              return rClean && (rClean.includes(targetClean) || targetClean.includes(rClean));
            });
          }

          // 3. Last Resort Fallback (If no URL requested, show latest. If URL missing and match failed, show latest)
          if (!targetReport) {
            targetReport = allReports[allReports.length - 1];
          }
        }

        setReport(targetReport || null);

        // C. Calculate Time Window for Legacy Messages
        let wStart = 0;
        let wEnd = Infinity;

        if (targetReport) {
          wStart = targetReport.sortTs || 0;
          const idx = allReports.findIndex(r => deepClean(r.imageUrl) === targetClean);
          if (idx !== -1 && idx < allReports.length - 1) {
            wEnd = allReports[idx + 1].sortTs;
          }
        }
        setTimeWindow({ start: wStart, end: wEnd });
      }
      setLoadingReport(false);
    });

    return () => unsub();
  }, [patientId, imageUrl]);

  // 3. Load Questions (Chat) - Dual Lookup State
  const [chatDocs, setChatDocs] = useState([]);

  useEffect(() => {
    if (!patientId) return;

    // Standardize IDs for lookup
    const targetIds = [
      patientId,
      state.patientDisplayId,
      patientData?.patientId,
      patientData?.patientID,
      patientData?.uid,
      patientData?.id
    ].filter((id, idx, self) => id && self.indexOf(id) === idx);

    // Filter to merge incoming docs from different sources safely
    const mergeDocs = (prev, incoming) => {
      const combined = [...prev, ...incoming];
      return combined.filter((d, idx, self) =>
        d.id && self.findIndex(x => x.id === d.id) === idx
      );
    };

    // A. Query by 'patientId' field (Legacy & Standard)
    const qField = query(collection(db, "questions"), where("patientId", "in", targetIds));
    const unsubField = onSnapshot(qField, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChatDocs(prev => mergeDocs(prev, list));
    });

    // B. Query by Collection Document ID (For P10001 consolidation)
    const activeDisplayId = (patientData?.patientId || state.patientDisplayId || "").toString();
    let unsubDoc = () => { };
    if (activeDisplayId) {
      unsubDoc = onSnapshot(doc(db, "questions", activeDisplayId), (d) => {
        if (d.exists()) {
          setChatDocs(prev => mergeDocs(prev, [{ id: d.id, ...d.data() }]));
        }
      });
    }

    return () => { unsubField(); unsubDoc(); };
  }, [patientId, patientData, state.patientDisplayId]);

  // 4. Reactive Visibility & Sorting logic (Sets the "questions" state for the render loop)
  useEffect(() => {
    // We pass the RAW documents to the render loop, which handles the 
    // fine-grained report-level segregation filtering internally.
    // This allows the Dual-Lookup to feed the UI reliably.
    setQuestions(chatDocs);
  }, [chatDocs]);

  // Scroll to bottom -> Unchanged

  // Helper: Patient File Change
  const onPatientFileChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    setQuestionFile(file);
    if (file) {
      if (file.type.startsWith('image/')) {
        setQuestionPreview(URL.createObjectURL(file));
      } else if (file.type.startsWith('video/')) {
        setQuestionPreview("video-placeholder");
      } else {
        setQuestionPreview("file-placeholder");
      }
    } else {
      setQuestionPreview(null);
    }
  };

  // Helper: Submit Question
  const handleSendQuestion = async () => {
    if (!newQuestion.trim() && !questionFile) return;
    setSending(true);
    try {
      const threadId = (patientData?.patientId || patientId || "unknown_patient").toString().replace(/[^a-zA-Z0-9_\-]/g, "_");
      const threadRef = doc(db, "questions", threadId);
      const currentReportUrl = report?.imageUrl || imageUrl || null;
      const msgId = "msg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

      // 1. Upload File (if any)
      let uploadedUrl = "";
      if (questionFile) {
        const safeName = questionFile.name.replace(/\s+/g, "_");
        const path = `questions/${threadId}/patient_uploads/${msgId}/${safeName}`;
        const sRef = ref(storage, path);
        const snapshot = await uploadBytes(sRef, questionFile);
        uploadedUrl = await getDownloadURL(snapshot.ref);
      }

      const msgObj = {
        id: msgId,
        sender: "patient",
        text: newQuestion.trim(),
        images: uploadedUrl ? [uploadedUrl] : [],
        timestamp: Date.now(),
        reportContextUrl: currentReportUrl,
        viewed: false
      };

      await setDoc(threadRef, {
        patientId: patientData?.patientId || report?.patientId || patientId,
        name: patientData?.name || report?.patientName || "Patient",
        contextImageUrl: currentReportUrl,
        updatedAt: serverTimestamp(),
        messages: arrayUnion(msgObj)
      }, { merge: true });

      setNewQuestion("");
      setQuestionFile(null);
      setQuestionPreview(null);
      if (fileInputRefPatient.current) fileInputRefPatient.current.value = "";
    } catch (err) {
      console.error("Error sending question:", err);
      window.alert("Failed to send question. Please try again.");
    } finally {
      setSending(false);
    }
  };


  if (loadingReport)
    return (
      <div className="text-center py-20 bg-gray-900 text-white min-h-screen">Loading prediction results...</div>
    );

  if (!report)
    return (
      <div className="text-center py-20 bg-gray-900 text-white min-h-screen">
        No prediction report found.
        <button onClick={() => navigate(-1)} className="block mx-auto mt-4 text-blue-400">Go Back</button>
      </div>
    );

  // Extract fields
  const {
    prediction,
    confidence,
    cnn_top5,
    svm_top5,
  } = report;

  const finalCnn = cnn_top5?.[0]?.label || prediction;
  const finalSvm = svm_top5?.[0]?.label || prediction;

  // Format dates
  const predictionDate = report.timestamp
    ? new Date(report.timestamp.seconds * 1000).toLocaleDateString()
    : "Pending";

  const doctorReviewDate = patientData?.updatedAt
    ? new Date(patientData.updatedAt).toLocaleDateString()
    : "N/A";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0b1113] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* ---------------- NAV BAR ---------------- */}
      <header className={`w-full py-4 px-8 flex items-center justify-between border-b ${isDarkMode ? 'bg-[#0e1a2b] border-white/10' : 'bg-white border-gray-200 shadow-sm'}`}>
        {/* LEFT — LOGO + APP NAME */}
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-blue-500 rounded"></div>
          <h1
            className={`text-lg font-bold cursor-pointer ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
            onClick={() => navigate("/patient-dashboard")}
          >
            EyeCare Predict
          </h1>
        </div>

        {/* CENTER — NAVIGATION */}
        <nav className={`flex items-center gap-10 text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          <button className="hover:text-blue-500 transition" onClick={() => navigate("/patient-dashboard")}>Dashboard</button>
          <button className="hover:text-blue-500 transition" onClick={() => window.location.reload()}>New Scan</button>
          <button className="hover:text-blue-500 transition" onClick={() => navigate("/history", { state: { patientId } })}>History</button>
          <button className="hover:text-blue-500 transition">Profile</button>
        </nav>

        {/* RIGHT — ICONS */}
        <div className={`flex items-center gap-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          <button className="hover:text-blue-500 transition"><span className="material-symbols-outlined">notifications</span></button>
          <button className="hover:text-blue-500 transition"><span className="material-symbols-outlined">settings</span></button>
          <div className="h-8 w-8 rounded-full bg-gray-500"></div>
        </div>
      </header>

      {/* ---------------- PAGE TITLE ---------------- */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <div className="flex justify-between items-center">
          <h1 className={`text-3xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Prediction Results
          </h1>
          <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Patient ID: <span className="font-bold">{patientId}</span>
          </div>
        </div>
      </div>

      {/* ---------------- MAIN GRID ---------------- */}
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-10 pb-20">
        {/* LEFT — IMAGE */}
        <div className="lg:col-span-1">
          <h2 className={`text-xl font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Uploaded Retinal Scan</h2>
          <div className={`rounded-xl overflow-hidden border shadow-lg ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            <img src={imageUrl} className="w-full object-cover" alt="scan" />
          </div>
          <div className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <b>Disclaimer:</b> AI predictions are not a substitute for medical diagnosis.
          </div>
        </div>

        {/* RIGHT — MODELS & INFO */}
        <div className="lg:col-span-2 space-y-8">

          {/* AI PREDICTIONS */}
          <div>
            <h2 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>AI Model Predictions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CNN MODEL A */}
              <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? 'bg-[#13202e] border-white/10' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-lg font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>AI Model A (CNN)</h3>
                <p className="text-xl font-bold text-yellow-500">{finalCnn}</p>
                <ul className={`text-sm space-y-1 mt-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  <li>Accuracy: {CNN_METRICS.accuracy}</li>
                  <li>Precision: {CNN_METRICS.precision}</li>
                  <li>Recall: {CNN_METRICS.recall}</li>
                  <li>F1-Score: {CNN_METRICS.f1}</li>
                </ul>
              </div>

              {/* CNN + SVM MODEL */}
              <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? 'bg-[#13202e] border-white/10' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-lg font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>DeepScan V2 (CNN + SVM)</h3>
                <p className="text-xl font-bold text-red-400">{finalSvm}</p>
                <ul className={`text-sm space-y-1 mt-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  <li>Accuracy: {SVM_METRICS.accuracy}</li>
                  <li>Precision: {SVM_METRICS.precision}</li>
                  <li>Recall: {SVM_METRICS.recall}</li>
                  <li>F1-Score: {SVM_METRICS.f1}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* DOCTOR NOTES (DYNAMIC) */}
          <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? 'bg-[#13202e] border-white/10' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Doctor's Notes & Diagnosis</h3>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Last Updated: {doctorReviewDate}
              </p>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="h-12 w-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold text-xl">
                {patientData?.doctorName ? patientData.doctorName[0] : "D"}
              </div>
              <div>
                <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {report?.doctorName || patientData?.doctorName ? `Dr. ${report?.doctorName || patientData.doctorName}` : "Doctor Not Assigned"}
                </p>
                <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Ophthalmologist</p>
              </div>
            </div>

            <p className={`text-sm whitespace-pre-wrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {/* LOGIC: SCOPED NOTES vs LEGACY FALLBACK vs BLANK NEW REPORT */}
              {(() => {
                const normalize = (u) => {
                  if (!u) return "";
                  const parts = String(u).split("?")[0].split("/o/");
                  const fileName = parts.length > 1 ? parts[1].split("%2F").pop() : parts[0].split("/").pop();
                  return fileName.trim().toLowerCase();
                };
                
                const rawReports = Array.isArray(patientData?.reports) ? patientData.reports : (patientData?.reports ? Object.values(patientData.reports) : []);
                const arrayReport = rawReports.find(r => normalize(r.imageUrl) === normalize(report?.imageUrl));
                const arrayNotes = arrayReport?.doctorNotes;
                const collectionNotes = report?.doctorNotes;

                // Priority 1: Individualized Array/Map Notes (Surgical Match)
                if (arrayNotes) return arrayNotes;

                // Priority 2: Collection Doc Notes
                if (collectionNotes) return collectionNotes;

                // 3. Fallback: Check if Brand New
                if (!report?.timestamp) {
                  return "Once the doctor reviews this scan, their full notes will appear here.";
                }

                const reportTs = report.timestamp.toDate ? report.timestamp.toDate().getTime() : report.timestamp;
                const isBrandNew = (Date.now() - reportTs) < 600000; // 10 minutes

                if (isBrandNew) {
                  return "Once the doctor reviews this scan, their full notes will appear here.";
                }

                // 4. Default blank
                return "Once the doctor reviews this scan, their full notes will appear here.";
              })()}
            </p>
          </div>

          {/* Q&A / CHAT SECTION */}
          <div className={`rounded-xl border p-6 shadow-lg ${isDarkMode ? 'bg-[#13202e] border-white/10' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Ask the Doctor</h3>

            {/* Input (Top) */}
              <div className="flex flex-col gap-3 mb-6">
                <textarea
                  rows="3"
                  placeholder="Ask a follow-up question about your results..."
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  className={`w-full p-4 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDarkMode ? 'bg-[#0b1620] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900 shadow-inner'
                    }`}
                ></textarea>

                {/* Patient File Preview */}
                {questionPreview && (
                  <div className="relative group w-32 h-24 rounded-xl overflow-hidden border-2 border-blue-500/50 shadow-lg bg-black/20 flex items-center justify-center">
                    {questionPreview === "video-placeholder" ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-2xl">🎬</span>
                        <span className="text-[9px] text-white/70 uppercase font-black">Video</span>
                      </div>
                    ) : questionPreview === "file-placeholder" ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-2xl">📄</span>
                        <span className="text-[9px] text-white/70 uppercase font-black">Document</span>
                      </div>
                    ) : (
                      <img src={questionPreview} alt="preview" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => { setQuestionFile(null); setQuestionPreview(null); if (fileInputRefPatient.current) fileInputRefPatient.current.value = ""; }}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-[12px] shadow-md hover:scale-110 transition-all font-bold"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="flex justify-between items-center bg-transparent pt-2">
                   <label className={`cursor-pointer px-4 py-2 rounded-xl border text-xs font-black transition-all flex items-center gap-2 shadow-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}>
                      📎 Add Attachment
                      <input
                        ref={fileInputRefPatient}
                        type="file"
                        accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                        onChange={onPatientFileChange}
                        className="hidden"
                      />
                    </label>
                    {questionFile && <span className="text-[10px] text-blue-500 font-black truncate max-w-[150px]">{questionFile.name}</span>}

                  <button
                    onClick={handleSendQuestion}
                    disabled={sending || (!newQuestion.trim() && !questionFile)}
                    className="px-6 py-2 rounded-xl bg-blue-600 text-white font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {sending ? "Sending..." : "Submit Question"}
                  </button>
                </div>
              </div>

            {/* Chat History (Bottom) */}
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {questions.length === 0 && (
                <p className={`text-sm italic ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No questions asked yet.</p>
              )}

              {(() => {
                // 1. FLATTEN & HYDRATE (Omni-Support for all database schemas)
                let allMessages = [];
                questions.forEach(q => {
                  let msgs = q.messages || [];
                  
                  // Schema Safeguard: If this is a direct message object (not a thread)
                  if (msgs.length === 0 && (q.text || q.sender)) {
                    msgs = [q];
                  }

                  // Legacy Safeguard: Initial questions
                  if (msgs.length === 0 && q.question) {
                    msgs = [{ id: 'init-' + q.id, sender: 'patient', text: q.question, timestamp: q.timestamp, reportContextUrl: q.reportContextUrl }];
                  }

                  const parentContext = q.contextImageUrl || null;
                  const hydratedMsgs = msgs.map(m => ({ ...m, _parentContext: m._parentContext || parentContext }));
                  allMessages = allMessages.concat(hydratedMsgs);
                });

                // 2. SORT
                allMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                // 3. IDENTIFY REPORT CONTEXT
                const currentScanUrl = report?.imageUrl || imageUrl;
                const targetClean = deepClean(currentScanUrl);

                const reportsArray = Array.isArray(patientData?.reports) ? [...patientData.reports] : [];
                let activeReport = reportsArray.find(r => r.imageUrl && deepClean(r.imageUrl) === targetClean);
                if (!activeReport && targetClean) {
                  activeReport = reportsArray.find(r => {
                    const rClean = deepClean(r.imageUrl);
                    return rClean && (rClean.includes(targetClean) || targetClean.includes(rClean));
                  });
                }
                if (!activeReport) activeReport = reportsArray[reportsArray.length - 1];

                // 4. CALCULATE WINDOW
                const sortedReports = reportsArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

                // 5. FILTER (New 'Smart-Sequence' Method)
                const visibleMessages = allMessages.filter((msg) => {
                  const rawUrl = msg.reportContextUrl || msg._parentContext || (msg.images && !Array.isArray(msg.images) ? msg.images.reportContextUrl : null);
                  const msgUrl = deepClean(rawUrl);
                  const mTs = msg.timestamp?.toDate ? msg.timestamp.toDate().getTime() : (Number(msg.timestamp) || 0);
                  
                  // A. Identity Match (Immediate Pass)
                  if (msgUrl && targetClean && (msgUrl === targetClean || msgUrl.includes(targetClean))) return true;

                  // B. Smart-Sequence Match (Fallback)
                  // Find which report was the 'Active Medical Record' at the time of this message.
                  // It belongs to the report created most recently BEFORE the message.
                  const parentReport = sortedReports.slice().reverse().find(r => {
                      const rTs = r.sortTs || (r.createdAt?.toDate ? r.createdAt.toDate().getTime() : new Date(r.createdAt || 0).getTime());
                      return rTs <= mTs;
                  });

                  // If this report IS the active report for this message, show it.
                  if (parentReport && deepClean(parentReport.imageUrl) === targetClean) return true;
                  
                  return false;
                });

                // 6. RENDER
                return (
                  <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-[#0f2430] border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                    {visibleMessages.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-4">No messages for this report.</p>
                    ) : (
                      visibleMessages.map((msg, idx) => (
                        <div key={msg.id || idx} className={`flex flex-col mb-4 last:mb-0 ${msg.sender === 'doctor' ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[90%] p-4 rounded-2xl shadow-xl transition-all ${msg.sender === 'doctor'
                            ? 'bg-blue-600 text-white rounded-br-none shadow-blue-500/10'
                            : (isDarkMode ? 'bg-[#163041] text-gray-200 rounded-bl-none border border-white/5' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm')
                            }`}>
                            <div className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">
                              {msg.sender === "doctor" ? "Clinical Specialist" : "Patient Query"}
                            </div>
                            {msg.text && <p className="text-sm leading-relaxed font-medium">{msg.text}</p>}
                            
                            {msg.images && msg.images.length > 0 && (
                              <div className="mt-4 flex flex-col gap-3">
                                {msg.images.map((url, iidx) => {
                                  const cleanUrl = url.split('?')[0].toLowerCase();
                                  const isVideo = cleanUrl.match(/\.(mp4|webm|ogg|mov)$/) || url.includes("video");
                                  const isPdf = cleanUrl.endsWith('.pdf');
                                  const isWord = cleanUrl.match(/\.(doc|docx)$/);
                                  const isDoc = isPdf || isWord || cleanUrl.endsWith('.txt');

                                  if (isVideo) {
                                    return (
                                      <div key={iidx} className="relative group w-full max-w-[340px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/60 aspect-video flex items-center justify-center">
                                        <video src={url} controls className="w-full h-full object-cover" />
                                        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-black uppercase tracking-widest text-white/90 border border-white/10">Clinical Recording</div>
                                      </div>
                                    );
                                  }

                                  if (isDoc) {
                                    return (
                                      <div 
                                        key={iidx} 
                                        className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-95 shadow-xl w-full max-w-full ${
                                          msg.sender === "doctor" 
                                            ? "bg-white/10 border-white/20 hover:bg-white/15" 
                                            : (isDarkMode ? "bg-black/20 border-white/10 hover:bg-black/30" : "bg-white border-gray-100 hover:border-gray-200 shadow-gray-200/50")
                                        }`}
                                        onClick={() => window.open(url, "_blank")}
                                      >
                                        <div className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-3xl shadow-inner ${
                                          isPdf ? "bg-red-500/20 text-red-500" : (isWord ? "bg-blue-500/20 text-blue-500" : "bg-gray-500/20 text-gray-500")
                                        }`}>
                                          {isPdf ? "📄" : (isWord ? "📝" : "📎")}
                                        </div>
                                        <div className="flex flex-col flex-grow overflow-hidden text-left min-w-0">
                                          <span className={`text-[10px] font-black uppercase tracking-tight truncate block ${msg.sender === "doctor" ? "text-white" : (isDarkMode ? "text-gray-100" : "text-gray-900")}`}>
                                            {isPdf ? "Diagnostic_Report.pdf" : (isWord ? "Pathology_Notes.docx" : "Clinical_File.txt")}
                                          </span>
                                          <span className={`text-[9px] uppercase font-bold tracking-widest opacity-60 truncate block ${msg.sender === "doctor" ? "text-blue-100" : (isDarkMode ? "text-gray-400" : "text-gray-500")}`}>
                                            {isPdf ? "Adobe PDF Archive" : (isWord ? "Word Document" : "Medical Record")}
                                          </span>
                                        </div>
                                        <div className="w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center bg-black/10 hover:bg-black/20 text-xs opacity-60 hover:opacity-100 transition-all">⬇️</div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={iidx} className="relative group w-full max-w-[280px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-all hover:translate-y-[-2px] bg-white/5">
                                      <img src={url} alt="attachment" className="w-full h-auto cursor-pointer" onClick={() => window.open(url, "_blank")} />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <span className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {msg.sender === 'doctor' ? "Dr. Reply" : "You"} • {dayjs(msg.timestamp?.toDate ? msg.timestamp.toDate() : msg.timestamp).fromNow()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

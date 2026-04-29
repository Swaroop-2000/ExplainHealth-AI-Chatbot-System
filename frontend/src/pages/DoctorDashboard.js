// src/pages/DoctorDashboard.js
import React, { useEffect, useState, useCallback } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import PatientsSection from "./PatientsSection";
import QuestionsSection from "./QuestionsSection";
import AppointmentsSection from "./AppointmentsSection";

import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  where,
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";

import { useTheme } from "../context/ThemeContext";
import { db, auth } from "../firebase";

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


/* ────────────────────────────────────────────────────────────────
   NEW COMPONENTS FOR FEEDBACK WORKFLOW 
   (Added without changing ANY existing functionality)
───────────────────────────────────────────────────────────────── */

const FeedbackCard = ({ item, onConfirm, onResolve }) => {
  const { isDarkMode } = useTheme();
  const {
    id,
    imageUrl,
    heatmapUrl,
    prediction,
    confidence,
    cnn_top5 = [],
    svm_top5 = [],
    timestamp,
    patientId,
    patientName,
  } = item;

  return (
    <div className={`p-4 rounded-xl border transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-white border-gray-200 shadow-sm'}`}>
      <div className="flex gap-4">

        {/* Patient Image */}
        <div className={`w-40 h-32 rounded overflow-hidden border ${isDarkMode ? 'border-[#243447]' : 'border-gray-200'}`}>
          {imageUrl ? (
            <img src={imageUrl} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-xs ${isDarkMode ? 'bg-[#1e293b] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              No Image
            </div>
          )}
        </div>

        {/* Prediction Info */}
        <div className="flex-1">
          <p className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {patientName || "Unknown Patient"}
          </p>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>ID: {patientId || "N/A"}</p>

          {/* Top-5 sections converted to specific model predictions */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                CNN - <span className="text-blue-500 font-bold">{(cnn_top5 && cnn_top5.length > 0) ? cnn_top5[0].label : (prediction || "Unknown")}</span>
              </p>
              <ul className={`text-xs mt-1 space-y-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <li>Accuracy: {CNN_METRICS.accuracy}</li>
                <li>Precision: {CNN_METRICS.precision}</li>
                <li>Recall: {CNN_METRICS.recall}</li>
                <li>F1-Score: {CNN_METRICS.f1}</li>
              </ul>
            </div>

            <div>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                SVM - <span className="text-blue-500 font-bold">{(svm_top5 && svm_top5.length > 0) ? svm_top5[0].label : (prediction || "Unknown")}</span>
              </p>
              <ul className={`text-xs mt-1 space-y-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <li>Accuracy: {SVM_METRICS.accuracy}</li>
                <li>Precision: {SVM_METRICS.precision}</li>
                <li>Recall: {SVM_METRICS.recall}</li>
                <li>F1-Score: {SVM_METRICS.f1}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className={`w-40 h-32 rounded overflow-hidden border ${isDarkMode ? 'border-[#243447]' : 'border-gray-200'}`}>
          {heatmapUrl ? (
            <img src={heatmapUrl} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-xs ${isDarkMode ? 'bg-[#1e293b] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              No Heatmap
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-4">
        <button
          onClick={() => onConfirm(id)}
          className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-500 text-white"
        >
          Confirm
        </button>

        <button
          onClick={() => onResolve(id)}
          className="px-4 py-2 bg-amber-500 rounded-lg hover:bg-amber-400 text-white"
        >
          Incorrect
        </button>
      </div>
    </div>
  );
};

const FeedbackResolveModal = ({ open, onClose, onSubmit, item }) => {
  const { isDarkMode } = useTheme();
  const [correctLabel, setCorrectLabel] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open || !item) return null;

  const handleSubmit = async () => {
    setLoading(true);
    await onSubmit(item, correctLabel);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className={`p-6 rounded-lg w-full max-w-md border shadow-xl ${isDarkMode ? 'bg-[#0f172a] border-[#243447]' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Correct Prediction</h3>
        <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          Enter the correct disease label exactly as in label_map.json
        </p>

        <input
          type="text"
          value={correctLabel}
          onChange={(e) => setCorrectLabel(e.target.value)}
          className={`w-full p-3 rounded border focus:outline-none ${isDarkMode ? 'bg-[#1e293b] border-[#374151] text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
          placeholder="Correct label..."
        />

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className={`px-4 py-2 rounded-lg ${isDarkMode ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !correctLabel}
            className="px-4 py-2 bg-amber-500 rounded-lg text-white"
          >
            {loading ? "Submitting..." : "Submit Correction"}
          </button>
        </div>
      </div>
    </div>
  );
};

const FeedbackReviewPanel = ({ doctorId }) => {
  const { isDarkMode } = useTheme();
  const [pending, setPending] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelected] = useState(null);

  /* 📌 Load ONLY feedback assigned to this doctor and sync with Patient Ground Truth */
  useEffect(() => {
    if (!doctorId) return;

    const q = query(
      collection(db, "pendingFeedback"),
      where("assignedDoctorId", "==", doctorId)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const baseItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Hydration: Fetch ground truth from patients table for each item
      const hydrated = await Promise.all(baseItems.map(async (item) => {
        if (!item.patientId || !item.imageUrl) return item;
        try {
          const pDoc = await getDoc(doc(db, "patients", item.patientId));
          if (pDoc.exists()) {
            const reports = pDoc.data().reports || [];
            const deepClean = (u) => String(u || "").split("?")[0].split("/o/").pop()?.split("&")[0].trim().toLowerCase();
            const targetUrl = deepClean(item.imageUrl);
            const truth = reports.find(r => deepClean(r.imageUrl) === targetUrl);

            if (truth) {
              return {
                ...item,
                prediction: truth.prediction || item.prediction,
                cnn_top5: truth.cnn_top5 || item.cnn_top5,
                svm_top5: truth.svm_top5 || item.svm_top5,
                confidence: truth.confidence || item.confidence
              };
            }
          }
        } catch (e) {
          console.warn("Feedback hydration failed:", e);
        }
        return item;
      })).catch(err => {
        console.error("Hydration batch failed:", err);
        return baseItems;
      });

      setPending(hydrated);
    });

    return () => unsub();
  }, [doctorId]);

  const handleConfirm = async (id) => {
    try {
      const ref = doc(db, "pendingFeedback", id);
      const originalItem = pending.find(p => p.id === id);

      // 1. Optimistic local update (card goes away instantly)
      setPending(prev => prev.filter(p => p.id !== id));

      const data = {
        status: "confirmed",
        resolvedAt: serverTimestamp(),
        patientId: originalItem?.patientId || "Unknown",
        imageUrl: originalItem?.imageUrl || "",
      };

      // 2. Perform Migration (Atomic Move)
      await addDoc(collection(db, "completedFeedback"), {
        ...originalItem,
        ...data,
        pendingId: id,
        resolvedBy: doctorId,
      });

      await deleteDoc(ref);
    } catch (err) {
      console.error("Cloud confirm failed:", err);
    }
  };

  const handleResolveOpen = (id) => {
    const item = pending.find((p) => p.id === id);
    setSelected(item);
    setModalOpen(true);
  };

  const handleResolveSubmit = async (item, correctedLabel) => {
    try {
      if (!item?.id) throw new Error("Missing item ID");
      if (!doctorId) throw new Error("Missing doctor ID");

      const ref = doc(db, "pendingFeedback", item.id);
      
      // 1. Optimistic UI update (Remove card immediately)
      setPending(prev => prev.filter(p => p.id !== item.id));

      const correctionData = {
        status: "resolved",
        correctedLabel,
        resolvedAt: serverTimestamp(),
        patientId: item.patientId || "Unknown",
        patientName: item.patientName || "Unknown",
        imageUrl: item.imageUrl || ""
      };

      // 2. Archive Feedback
      await addDoc(collection(db, "completedFeedback"), {
        ...item,
        ...correctionData,
        pendingId: item.id,
        resolvedBy: doctorId,
      });

      // 3. Clear Pending Record
      await deleteDoc(ref);
      
      // 4. Background Backend Sync
      fetch("http://127.0.0.1:5000/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: item.imageUrl,
          correct_label: correctedLabel,
        }),
      }).catch(e => console.warn("Background backend sync failed:", e));

    } catch (err) {
      console.error("Resolution failed:", err);
    }
  };

  return (
    <section className="mt-8">
      <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Pending AI Feedback</h2>

      {pending.length === 0 && (
        <p className={`text-gray-400 ${isDarkMode ? '' : 'text-gray-500'}`}>No pending model feedback.</p>
      )}

      <div className="grid gap-4">
        {pending.map((item) => (
          <FeedbackCard
            key={item.id}
            item={item}
            onConfirm={handleConfirm}
            onResolve={handleResolveOpen}
          />
        ))}
      </div>

      <FeedbackResolveModal
        open={modalOpen}
        item={selectedItem}
        onClose={() => setModalOpen(false)}
        onSubmit={handleResolveSubmit}
      />
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────── */
/* ORIGINAL DOCTOR DASHBOARD (UNCHANGED LOGIC) + NEW PANEL ADDED   */
/* ──────────────────────────────────────────────────────────────── */

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [allApptsForMetrics, setAllApptsForMetrics] = useState([]);

  const [currentDoctor, setCurrentDoctor] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedPatientId, setHighlightedPatientId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [searchParams] = useSearchParams();
  const focusedPatientId = searchParams.get("patientId");



  useEffect(() => {
    if (!currentDoctor) return;

    const q = query(
      collection(db, "notifications"),
      where("doctorId", "==", currentDoctor.employeeId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Keep notifications short
      list.forEach(n => {
        if (n.message.length > 50) {
          n.message = n.message.substring(0, 50) + "...";
        }
      });

      setNotifications(list);
    });

    return () => unsub();
  }, [currentDoctor]);


  /* 🔥 Load doctor details */
  useEffect(() => {
    const loadDoctor = async () => {
      const email = auth?.currentUser?.email;
      if (!email) return;

      const q = query(collection(db, "doctors"), where("email", "==", email));
      const snap = await getDocs(q);

      if (!snap.empty) {
        setCurrentDoctor({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    };

    loadDoctor();
  }, []);

  /* LIVE PATIENTS */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "patients"), (snap) => {
      setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingPatients(false);
    });
    return () => unsub();
  }, []);

  /* LIVE QUESTIONS */
  useEffect(() => {
    const q = query(collection(db, "questions"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingQuestions(false);
    });
    return () => unsub();
  }, []);

  /* LIVE APPOINTMENTS FOR TOP METRICS */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "appointments"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllApptsForMetrics(list);
      setAppointmentsCount(snap.size);
    });
    return () => unsub();
  }, []);

  /* REQUEST NEW IMAGE (unchanged) */
  const requestNewImage = async (patientId, patientName) => {
    try {
      await addDoc(collection(db, "notifications"), {
        targetUserId: patientId,     // 🔥 Must match PatientDashboard listener
        doctorId: currentDoctor?.employeeId || null,
        patientName: patientName || "Patient",
        message: "Your doctor requested a new retinal scan. Please upload it.",
        type: "new-image-request",
        read: false,
        createdAt: serverTimestamp(),
      });

      // Optional system question entry
      await addDoc(collection(db, "questions"), {
        patientId,
        name: "System",
        question:
          "Your doctor requested a new retinal image. Please upload when ready.",
        timestamp: serverTimestamp(),
        isSystemMessage: true,
      });

      alert("Reupload request sent to patient.");
    } catch (err) {
      console.error("Reupload request failed:", err);
      alert("Failed to send reupload request.");
    }
  };

  /* SAVE DOCTOR NOTES (unchanged) */
  const saveDoctorNotes = async (patientId, notes, patientName) => {
    if (!currentDoctor) {
      alert("Doctor not loaded yet!");
      return;
    }

    try {
      // Update patient document
      const pRef = doc(db, "patients", patientId);
      await updateDoc(pRef, {
        doctorNotes: notes,
        doctorEmployeeId: currentDoctor.employeeId,
        doctorName: currentDoctor.name,
        updatedAt: Date.now(),
      });

      // Create NOTIFICATION for patient
      await addDoc(collection(db, "notifications"), {
        targetUserId: patientId,               // 🔥 PatientDashboard listens to THIS
        doctorId: currentDoctor.employeeId,
        patientName: patientName || "Patient",
        message: `Dr. ${currentDoctor.name} updated your medical notes.`,
        type: "doctor-notes",
        read: false,
        createdAt: serverTimestamp(),
      });

      alert("Notes updated successfully.");
    } catch (err) {
      console.error("Failed to update notes:", err);
      alert("Failed to save notes.");
    }
  };


  // SORT + HIGHLIGHT: Search patients
  const filteredPatients = React.useMemo(() => {
    if (!searchTerm.trim()) return patients;

    const term = searchTerm.toLowerCase();

    const matched = patients.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.patientId?.toLowerCase().includes(term)
    );

    const unmatched = patients.filter(p =>
      !p.name?.toLowerCase().includes(term) &&
      !p.patientId?.toLowerCase().includes(term)
    );

    return [...matched, ...unmatched];
  }, [patients, searchTerm]);

  const metrics = React.useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));

    // Filter patients for THIS doctor
    const myPatients = patients.filter(p => !currentDoctor || p.doctorEmployeeId === currentDoctor.employeeId);

    // Total & New Counts (Current 30d vs Previous 30d for Trends)
    const currentTotal = patients.length;
    const previousTotal = patients.filter(p => {
      let created = p.createdAt;
      if (created?.seconds) created = new Date(created.seconds * 1000);
      else if (created) created = new Date(created);
      return created && created <= thirtyDaysAgo;
    }).length;

    const currentNew = patients.filter(p => {
      let created = p.createdAt;
      if (created?.seconds) created = new Date(created.seconds * 1000);
      else if (created) created = new Date(created);
      return created && created > thirtyDaysAgo;
    }).length;

    const previousNew = patients.filter(p => {
      let created = p.createdAt;
      if (created?.seconds) created = new Date(created.seconds * 1000);
      else if (created) created = new Date(created);
      return created && created > sixtyDaysAgo && created <= thirtyDaysAgo;
    }).length;

    const currentOld = currentTotal - currentNew;
    const previousOld = previousTotal - previousNew;

    // Appts for THIS doctor
    const myAppts = allApptsForMetrics.filter(a => !currentDoctor || a.doctorEmployeeId === currentDoctor.employeeId);
    const currentAppts = myAppts.filter(a => {
      let booked = a.bookedAt || a.scheduledAt || a.createdAt;
      if (booked?.seconds) booked = new Date(booked.seconds * 1000);
      else if (booked) booked = new Date(booked);
      return booked && booked > thirtyDaysAgo;
    }).length;

    const previousAppts = myAppts.filter(a => {
      let booked = a.bookedAt || a.scheduledAt || a.createdAt;
      if (booked?.seconds) booked = new Date(booked.seconds * 1000);
      else if (booked) booked = new Date(booked);
      return booked && booked > sixtyDaysAgo && booked <= thirtyDaysAgo;
    }).length;

    // Calculate Trends (Helper)
    const calcTrend = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? "+100%" : "0%";
      const diff = ((curr - prev) / prev) * 100;
      return `${diff >= 0 ? "+" : ""}${Math.round(diff)}%`;
    };

    return {
      totalPatients: currentTotal,
      newPatients: currentNew,
      oldPatients: currentOld,
      totalAppointments: myAppts.length,
      trends: {
        total: calcTrend(currentTotal, previousTotal),
        new: calcTrend(currentNew, previousNew),
        old: calcTrend(currentOld, previousOld),
        appts: calcTrend(currentAppts, previousAppts)
      }
    };
  }, [patients, allApptsForMetrics, currentDoctor]);


  useEffect(() => {
    if (!searchTerm.trim()) {
      setHighlightedPatientId(null);
      return;
    }

    const term = searchTerm.toLowerCase();

    const matched = patients.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.patientId?.toLowerCase().includes(term)
    );

    if (matched.length > 0) {
      setHighlightedPatientId(matched[0].patientId);
    }
  }, [searchTerm, patients]);




  /* ------------------- UI ------------------- */
  const { isDarkMode } = useTheme();

  const specialistContext = React.useMemo(() => {
    if (!currentDoctor) return null;
    return {
      ids: [currentDoctor.id, currentDoctor.employeeId].filter(Boolean),
      name: currentDoctor.name
    };
  }, [currentDoctor]);

  return (
    <div className={`flex w-full min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Header
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          doctorId={currentDoctor?.employeeId || currentDoctor?.id || null}
          notifications={notifications}
        />


        <main className="p-6 max-w-[1280px] mx-auto w-full">

          {/* Header Row moved to TOP */}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className={`text-4xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Doctor Dashboard</h1>
              <p className={`text-sm font-bold uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>Live patients, chat & appointments</p>
            </div>

            <div className={`text-[10px] font-black uppercase tracking-tighter px-3 py-1.5 rounded-full border ${isDarkMode ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/10' : 'border-emerald-200 text-emerald-600 bg-emerald-50'}`}>
              Live Statistics • Synchronized
            </div>
          </div>

          {/* Top Metrics Cards Row - Redesigned like Screenshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { title: "Total Patients", val: metrics.totalPatients, icon: "groups", color: "bg-blue-500/10 text-blue-500", trend: metrics.trends.total },
              { title: "Old Patients", val: metrics.oldPatients, icon: "person", color: "bg-rose-500/10 text-rose-500", trend: metrics.trends.old },
              { title: "New Patients", val: metrics.newPatients, icon: "person_add", color: "bg-emerald-500/10 text-emerald-500", trend: metrics.trends.new },
              { title: "Appointments", val: metrics.totalAppointments, icon: "calendar_month", color: "bg-amber-500/10 text-amber-500", trend: metrics.trends.appts }
            ].map((card, idx) => (
              <div 
                key={idx} 
                className={`p-6 rounded-3xl border flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:border-[#22D3EE] ${
                  isDarkMode 
                    ? "bg-[#111827] border-[rgba(148,163,184,0.15)]" 
                    : "bg-white border-gray-100 shadow-sm"
                }`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={`size-12 rounded-2xl flex items-center justify-center ${card.color}`}>
                    <span className="material-symbols-outlined text-2xl">{card.icon}</span>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-1 rounded-full ${card.trend.includes('-') ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{card.trend}</span>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>{card.title}</p>
                  <h2 className={`text-4xl font-black mt-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    {card.val > 1 ? (card.val - 1).toLocaleString() : card.val.toLocaleString()}
                    {card.val > 1 && <span className="text-lg opacity-40 ml-1">+</span>}
                  </h2>
                </div>
              </div>
            ))}
          </div>

          {/* GRID LAYOUT: Patients (Left) & Chat (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 xl:col-span-8">
              <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Patient Cases</h2>
              <PatientsSection
                patients={filteredPatients}
                searchTerm={searchTerm}
                highlightedPatientId={highlightedPatientId}
                focusedPatientId={focusedPatientId}
                onRequestNewImage={requestNewImage}
                onSaveDoctorNotes={saveDoctorNotes}
              />
            </section>
            
            <aside className="lg:col-span-5 xl:col-span-4">
              <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>User Questions (Chat)</h2>
              <QuestionsSection questions={questions} />
            </aside>
          </div>

          <div className="mt-8">
            <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Appointments</h2>
            <AppointmentsSection 
              doctorId={specialistContext?.ids} 
              doctorName={specialistContext?.name} 
            />
          </div>

          {/* NEW FEEDBACK PANEL */}
          {currentDoctor && (
            <FeedbackReviewPanel doctorId={currentDoctor.employeeId} />
          )}
        </main>
      </div>
    </div>
  );
}


// FINAL PatientsSection.js — Highlighting + NO duplicate patient loading + full existing functionality
import React, { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  getDocs,
  setDoc,
  arrayUnion,
  deleteField
} from "firebase/firestore";
import { getDoc } from "firebase/firestore";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

export default function PatientsSection({
  patients = [],
  searchTerm = "",
  focusedPatientId,
  highlightedPatientId = null,
  onRequestNewImage,
  onSaveDoctorNotes, // Kept for prop compatibility, though we use internal saveNotes
}) {
  const { isDarkMode } = useTheme();
  const [toast, setToast] = useState(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const [isFocusActive, setIsFocusActive] = useState(false);
  
  // Temporal Highlight Decay Logic (5s)
  useEffect(() => {
    if (!focusedPatientId) {
      setIsFocusActive(false);
      return;
    }

    setIsFocusActive(true);
    const timer = setTimeout(() => {
      setIsFocusActive(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [focusedPatientId]);

  // Scroll into view logic
  useEffect(() => {
    if (!focusedPatientId) return;
    if (!patients || patients.length === 0) return;

    const timeout = setTimeout(() => {
      const el = document.getElementById(
        `patient-${focusedPatientId}`
      );

      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [focusedPatientId, patients]);


  const [notes, setNotes] = useState({});
  const [locked, setLocked] = useState({});
  const [status, setStatus] = useState({});

  // Changed images state to store { url, ts } instead of just url string
  const [images, setImages] = useState({});

  /* 
  ──────────────────────────────────────────────────────────
  LOAD IMAGES ONLY — NOT PATIENTS  
  Patients are already loaded & sorted in DoctorDashboard.
  ──────────────────────────────────────────────────────────
  */
  useEffect(() => {
    if (!patients || patients.length === 0) return;

    // 1. Initialize with static retinalScan (if any) as fallback
    const imgsFromPatient = {};
    patients.forEach((p) => {
      if (p.patientId && p.retinalScan) {
        imgsFromPatient[p.patientId] = { url: p.retinalScan, ts: 0 };
      }
    });

    setImages((prev) => ({ ...prev, ...imgsFromPatient }));

    // 2. ALWAYS load latest image from uploads for ALL patients
    // This allows new uploads to override the static retinalScan
    patients.forEach((p) => {
      if (p.patientId) {
        loadLatestImage(p.patientId);
      }
    });
  }, [patients]);


  // Initialize Notes/Status/Locked from the Latest Report in the array
  useEffect(() => {
    if (!patients?.length) return;

    const lockMap = {};
    const statusMap = {};
    const notesMap = {};

    patients.forEach((p) => {

      // PROPER WAY: Link directly to the Latest Report in the array (High-Fidelity Sync)
      const rawReports = Array.isArray(p.reports) ? p.reports : (p.reports ? Object.values(p.reports) : []);
      
      const getTs = (obj) => {
        if (!obj) return 0;
        if (obj.createdAt?.toMillis) return obj.createdAt.toMillis();
        if (obj.createdAt?.seconds) return obj.createdAt.seconds * 1000;
        if (typeof obj.createdAt === 'number') return obj.createdAt;
        if (obj.createdAt instanceof Date) return obj.createdAt.getTime();
        return 0;
      };

      const sorted = [...rawReports].sort((a,b) => getTs(b) - getTs(a));
      const latestReport = sorted[0];

      // Root-level status fallback (for cross-page parity)
      const rootStatus = p.reviewStatus || "pending";

      if (latestReport) {
        notesMap[p.id] = latestReport.doctorNotes || "";
        lockMap[p.id] = !!latestReport.doctorNotes; 
        
        // Priority: If either the report has notes OR the doc is marked completed at root
        statusMap[p.id] = (latestReport.doctorNotes || rootStatus === "completed") ? "completed" : "pending";
      } else {
        notesMap[p.id] = "";
        lockMap[p.id] = false;
        statusMap[p.id] = rootStatus; // Fallback to root status
      }
    });

    setNotes(notesMap);
    setLocked(lockMap);
    setStatus(statusMap);
  }, [patients, images]);
  // Added 'images' dependency so when a new image loads (with new TS), it triggers re-eval


  // Load latest image from uploads
  const loadLatestImage = (patientId) => {
    const q = query(
      collection(db, "uploads"),
      where("patientId", "==", patientId),
      orderBy("timestamp", "desc"),
      limit(1)
    );

    onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0].data();
        const url = d.imageUrl;
        const ts = d.timestamp || 0;

        setImages((prev) => {
          // Avoid loop if same
          if (prev[patientId]?.url === url && prev[patientId]?.ts === ts) return prev;

          return { ...prev, [patientId]: { url, ts } };
        });
      }
    });
  };

  const formatTs = (ts) => {
    try {
      if (!ts) return "just now";
      if (ts.toDate) return dayjs(ts.toDate()).fromNow();
      return dayjs(ts).fromNow();
    } catch {
      return "just now";
    }
  };

  // Save doctor notes
  const saveNotes = async (pid) => {
    try {
      const user = auth.currentUser;

      let doctorName = "Doctor";
      let doctorId = user?.uid || null;

      if (user?.email) {
        const q = query(
          collection(db, "doctors"),
          where("email", "==", user.email)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          const d = snap.docs[0].data();
          doctorName = d.name || "Doctor";
          doctorId = snap.docs[0].id;
        }
      }

      // 1. Fetch Patient Data for array update
      const pRef = doc(db, "patients", pid);
      const pSnap = await getDoc(pRef);
      if (!pSnap.exists()) return;
      const pData = pSnap.data();

      // 2. Identify and Update the LATEST report (Proper Linkage)
      const rawReports = Array.isArray(pData.reports) ? pData.reports : (pData.reports ? Object.values(pData.reports) : []);
      
      const getTs = (obj) => {
        if (!obj) return 0;
        if (obj.createdAt?.toMillis) return obj.createdAt.toMillis();
        if (obj.createdAt?.seconds) return obj.createdAt.seconds * 1000;
        if (typeof obj.createdAt === 'number') return obj.createdAt;
        if (obj.createdAt instanceof Date) return obj.createdAt.getTime();
        return 0;
      };

      const sorted = [...rawReports].sort((a,b) => getTs(b) - getTs(a));
      const latestId = sorted[0]?.id;

      const updatedReports = rawReports.map(r => {
        if (r.id === latestId) {
          return { ...r, doctorNotes: notes[pid] || "" };
        }
        return r;
      });

      // 3. Update Patient Profile (Abolish Global Fields + Scoped Reports)
      await updateDoc(pRef, {
        reports: updatedReports,
        doctorNotes: deleteField(), // PERMANENTLY PURGE GLOBAL FIELD
        updatedAt: Date.now(),
        doctorNotesUpdatedAt: Date.now(),
        doctorId,
        doctorName,
        reviewStatus: "completed",
      });

      // 4. IMMEDIATE UI FEEDBACK (No delay for Snapshot)
      setStatus(prev => ({ ...prev, [pid]: "completed" }));
      setLocked(prev => ({ ...prev, [pid]: true }));
      setNotes(prev => ({ ...prev, [pid]: notes[pid] }));

      const currentUrl = images[pid]?.url;

      // 4. Update Specific Prediction Report (Historical Record in separate collection)
      if (currentUrl) {
        try {
          const qReport = query(
            collection(db, "predictionReports"),
            where("patientId", "==", pid),
            where("imageUrl", "==", currentUrl),
            limit(1)
          );
          const reportSnap = await getDocs(qReport);

          if (!reportSnap.empty) {
            const reportId = reportSnap.docs[0].id;
            await updateDoc(doc(db, "predictionReports", reportId), {
              doctorNotes: notes[pid] || "",
              doctorName: doctorName,
              doctorEmployeeId: doctorId,
              reviewedAt: serverTimestamp()
            });
          }
        } catch (reportErr) {
          console.warn("Archival to predictionReports failed:", reportErr);
          // Non-critical: the patient document is already saved correctly.
        }
      }

      setToast({ message: "Clinical notes synchronized and record finalized successfully.", type: "success" });
    } catch (err) {
      console.error("Save failure:", err);
      setToast({ message: "Failed to save notes. Please try again.", type: "error" });
    }
  };

  const handleNoteChange = (id, text) => {
    setNotes((prev) => ({ ...prev, [id]: text }));
  };

  const enableEdit = async (pid) => {
    try {
      // When unlocking, we might want to update timestamp so it doesn't auto-clear again?
      // Actually, if we unlock, we are editing. When we save, it will update timestamp.
      await updateDoc(doc(db, "patients", pid), {
        notesLocked: false,
      });

      setLocked((prev) => ({ ...prev, [pid]: false }));
    } catch (err) {
      console.error(err);
    }
  };

  // Request new retinal scan (unchanged)
  const requestNewImage = async (patientId, patientName) => {
    try {
      await addDoc(collection(db, "notifications"), {
        patientId,
        type: "new-image-request",
        message: "Your doctor requested a new retinal scan. Please upload it.",
        timestamp: serverTimestamp(),
        read: false,
      });

      const qRef = doc(db, "questions", patientId);
      const qSnap = await getDoc(qRef);

      const messageObj = {
        id: `msg-${Date.now()}`,
        sender: "doctor",
        text: "Doctor has requested you to upload a new retinal scan image.",
        images: [],
        timestamp: Date.now(),
        type: "system",
      };

      if (!qSnap.exists()) {
        await setDoc(qRef, {
          patientId,
          name: patientName,
          messages: [messageObj],
          userImages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } else {
        const existing = qSnap.data();

        if (!Array.isArray(existing.messages)) {
          await updateDoc(qRef, {
            messages: [messageObj],
            updatedAt: Date.now(),
          });
        } else {
          await updateDoc(qRef, {
            messages: arrayUnion(messageObj),
            updatedAt: Date.now(),
          });
        }
      }

      alert("Patient notified to upload a new image!");
    } catch (err) {
      console.error("requestNewImage error:", err);
      alert("Failed to send request.");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      {patients.map((p) => {
        const isFocused =
          focusedPatientId && focusedPatientId === p.patientId;

        const isSearchMatch =
          searchTerm &&
          (
            p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.patientId?.toLowerCase().includes(searchTerm.toLowerCase())
          );

        const shouldHighlight = (isFocused && isFocusActive) || isSearchMatch;
        const imgInfo = images[p.patientId];

        return (
          <article
            key={p.id}
            id={`patient-${p.patientId}`}
            className={`group rounded-[32px] p-8 transition-all duration-500 shadow-xl relative overflow-hidden flex flex-col min-h-[420px] border-2
            ${shouldHighlight
                ? (isDarkMode ? "bg-amber-500/10 border-[#f59e0b] scale-[1.02]" : "bg-amber-50 border-[#f59e0b] scale-[1.02]")
                : (isDarkMode ? "bg-[#0f172a]/60 border-white/5 backdrop-blur-xl" : "bg-white border-gray-100 shadow-gray-200/50")
              }
          `}
          >
            {/* Header Strategy */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className={`text-2xl font-black tracking-tight leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {p.name}
                </h3>
                <div className="flex items-center gap-3 mt-1.5 mr-1">
                  <div className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                    PX-Ref: {p.patientId?.slice(0, 12).toUpperCase() || "N/A"}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                 <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 border shadow-sm transition-all duration-500 ${
                  status[p.id] === "completed"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                }`}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status[p.id] === "completed" ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${status[p.id] === "completed" ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                    {status[p.id] === "completed" ? "Completed" : "Pending Review"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                  {formatTs(p.updatedAt)}
                </div>
              </div>
            </div>

            {/* Diagnostic Image Component */}
            {imgInfo?.url && (
              <div className="relative group/img mb-6">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity rounded-[24px] z-10"></div>
                <img
                  src={imgInfo.url}
                  alt="User retinal scan"
                  className={`w-full h-52 object-cover rounded-[24px] border-2 transition-all duration-700 shadow-inner group-hover/img:scale-[1.01] ${
                    isDarkMode ? 'border-white/5 bg-black/20' : 'border-gray-100 bg-gray-50'
                  }`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            )}

            {/* Specialist Feedback Section */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <label className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <span className="material-symbols-outlined text-sm">clinical_notes</span>
                  Doctor Notes
                </label>
                {locked[p.id] && (
                   <span className="material-symbols-outlined text-sm text-[#007aff] opacity-50">verified</span>
                )}
              </div>

              <textarea
                rows={3}
                disabled={locked[p.id] || !imgInfo?.url}
                value={notes[p.id] || ""}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
                className={`w-full p-4 rounded-[20px] text-sm font-medium leading-relaxed transition-all duration-500 resize-none border-2
                  ${(locked[p.id] || !imgInfo?.url)
                    ? (isDarkMode ? "bg-white/[0.02] text-gray-400 border-white/5 cursor-default" : "bg-gray-50 text-gray-500 border-gray-100")
                    : (isDarkMode ? "bg-white/[0.05] text-white border-white/10 hover:border-[#007aff]/30 focus:border-[#007aff] shadow-inner" : "bg-gray-50 text-gray-900 border-gray-200 focus:border-blue-500 focus:bg-white pb-3")
                  }
                `}
                placeholder={!imgInfo?.url ? "Pending retinal scan upload..." : "Diagnostic signature required..."}
              />

              {/* Action Grid */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button
                  onClick={() => requestNewImage(p.patientId, p.name)}
                  className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border
                    ${isDarkMode 
                      ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white hover:border-white/20' 
                      : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100'
                    }
                  `}
                >
                  <span className="material-symbols-outlined text-base">add_a_photo</span>
                  Request Scan
                </button>

                {!locked[p.id] ? (
                  <button
                    onClick={() => saveNotes(p.id)}
                    disabled={!imgInfo?.url}
                    className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-30 disabled:grayscale disabled:hover:scale-100
                      ${imgInfo?.url 
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/20' 
                        : 'bg-white/5 border border-white/10 text-gray-500 shadow-none'
                      }
                    `}
                  >
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    Commit Entry
                  </button>
                ) : (
                  <button
                    onClick={() => enableEdit(p.id)}
                    className="flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-[18px] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                    Modify Notes
                  </button>
                )}
              </div>
            </div>
          </article>
        );

      })}

      {/* PREMIUM SUCCESS TOAST */}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[99999] animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl border shadow-2xl backdrop-blur-xl ${
            toast.type === "success" 
              ? (isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white border-emerald-100 text-emerald-600')
              : (isDarkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-white border-rose-100 text-rose-600')
          }`}>
            <div className={`size-8 rounded-full flex items-center justify-center ${
              toast.type === "success" ? 'bg-emerald-500/20' : 'bg-rose-500/20'
            }`}>
              <span className="material-symbols-outlined text-[20px]">
                {toast.type === "success" ? 'check_circle' : 'error'}
              </span>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-0.5">System Update</p>
              <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="ml-4 opacity-40 hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

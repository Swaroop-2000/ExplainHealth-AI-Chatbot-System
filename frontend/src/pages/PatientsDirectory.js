// src/pages/PatientsDirectory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import Header from "../pages/Header";
import { db, auth } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  deleteDoc,
  doc,
  writeBatch
} from "firebase/firestore";

const STATUS_UI = {
  pending: {
    label: "Pending Review",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    action: "open"
  },
  completed: {
    label: "Completed",
    badge: "bg-green-500/10 text-green-400 border-green-500/30",
    action: "view"
  }
};

export default function PatientsDirectory() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  const [patients, setPatients] = useState([]);
  const [reportsMap, setReportsMap] = useState({});

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [lastScanMap, setLastScanMap] = useState({});
  const [currentDoctor, setCurrentDoctor] = useState(null); // Local state for doctor info
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);

  /* 🔥 LOAD PATIENTS */
  useEffect(() => {
    const unsubPatients = onSnapshot(
      collection(db, "patients"),
      (snap) => {
        setPatients(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data()
          }))
        );
      }
    );

    /* 🔥 LOAD PREDICTION REPORTS & UPLOADS (Merged Sync) */
    const unsubReports = onSnapshot(
      collection(db, "predictionReports"),
      (snap) => {
        const scanTimeMap = { ...lastScanMap }; // Preserve current map

        snap.docs.forEach((d) => {
          const data = d.data();
          if (!data.patientId || !data.timestamp) return;

          const ts = typeof data.timestamp === "number" ? data.timestamp : (data.timestamp.seconds * 1000 || 0);

          if (!scanTimeMap[data.patientId] || ts > scanTimeMap[data.patientId]) {
            scanTimeMap[data.patientId] = ts;
          }
        });
        setLastScanMap(scanTimeMap);
      }
    );

    /* 🔥 LIVE UPLOADS CHANNEL (For instantaneous status flip) */
    const unsubUploads = onSnapshot(
      collection(db, "uploads"),
      (snap) => {
        const freshUploadMap = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (!data.patientId || !data.timestamp) return;
          const ts = typeof data.timestamp === "number" ? data.timestamp : (data.timestamp.seconds * 1000 || 0);
          
          if (!freshUploadMap[data.patientId] || ts > freshUploadMap[data.patientId]) {
            freshUploadMap[data.patientId] = ts;
          }
        });

        // Merge uploads into scanMap
        setLastScanMap(prev => {
          const newMap = { ...prev };
          Object.keys(freshUploadMap).forEach(pid => {
            if (!newMap[pid] || freshUploadMap[pid] > newMap[pid]) {
              newMap[pid] = freshUploadMap[pid];
            }
          });
          return newMap;
        });
      }
    );

    return () => {
      unsubPatients();
      unsubReports();
      unsubUploads();
    };
  }, []);

  /* 🔥 LOAD CURRENT DOCTOR (For Header Notifications) */
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        try {
          // Find the doctor doc by email to get their "employeeId"
          const q = query(
            collection(db, "doctors"),
            where("email", "==", user.email)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            // Found the doctor profile
            setCurrentDoctor({ id: snap.docs[0].id, ...snap.docs[0].data() });
          }
        } catch (err) {
          console.error("Error fetching doctor profile in directory:", err);
        }
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      const t1 =
        a.updatedAt?.seconds
          ? a.updatedAt.seconds * 1000
          : a.updatedAt || 0;

      const t2 =
        b.updatedAt?.seconds
          ? b.updatedAt.seconds * 1000
          : b.updatedAt || 0;

      return t2 - t1; // newest first
    });
  }, [patients]);


  /* 🔎 SEARCH + FILTER + DERIVED STATUS */
  const visiblePatients = useMemo(() => {
    return sortedPatients.filter((p) => {
      const matchesSearch =
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.patientId?.toLowerCase().includes(searchTerm.toLowerCase());

      // ✅ HIGH-FIDELITY CLINICAL STATUS ENGINE
      let statusKey = "completed";
      
      const pReports = Array.isArray(p.reports) ? p.reports : [];
      // A patient is pending if they have ANY scan without doctor notes
      const hasUnreviewedScan = pReports.length > 0 && pReports.some(r => !r.doctorNotes || r.doctorNotes.trim() === "");
      
      const lastScan = lastScanMap[p.patientId] || 0;
      const lastReview = p.updatedAt?.seconds 
        ? p.updatedAt.seconds * 1000 
        : (typeof p.updatedAt === "number" ? p.updatedAt : new Date(p.updatedAt || 0).getTime());

      // Clinical Priority Rule: 
      // 1. Missing notes on any scan = Pending
      // 2. New scan since last review = Pending
      // 3. No scans yet = Pending
      if (hasUnreviewedScan || (lastScan > (lastReview + 1000)) || pReports.length === 0) {
        statusKey = "pending";
      }

      if (filter === "all") return matchesSearch;
      if (filter === "pending") return matchesSearch && statusKey === "pending";
      if (filter === "completed") return matchesSearch && statusKey === "completed";

      return matchesSearch;
    });
  }, [sortedPatients, searchTerm, filter, reportsMap]);

  /* ACTION HANDLERS (UNCHANGED) */
  const openCase = (patient) => {
    navigate(`/doctor-dashboard?patientId=${patient.patientId}`);
  };

  const viewProfile = (patient) => {
    navigate(`/patient-profile/${patient.patientId}`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === visiblePatients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visiblePatients.map(p => p.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const deleteSelected = async () => {
    setShowPurgeModal(false);
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, "patients", id));
      });
      await batch.commit();
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (err) {
      console.error("Bulk delete failure:", err);
      alert("Failed to delete records.");
    } finally {
      setIsDeleting(false);
    }
  };

  const initiatePurge = () => {
    if (selectedIds.length === 0) return;
    setShowPurgeModal(true);
  };

  return (
    <div className={`flex min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar />

      <div className="flex-1 flex flex-col">
        {/* Pass doctorId so Header can fetch notifications */}
        <Header
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          doctorId={currentDoctor?.employeeId || null}
        />

        <main className="p-8 max-w-[1400px] mx-auto w-full">
          {/* HEADER */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-black">Patients Directory</h1>
              <p className={`text-sm ${isDarkMode ? 'text-muted-dark' : 'text-gray-500'}`}>
                Manage and monitor all assigned patients
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  if (isSelectionMode) setSelectedIds([]);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all active:scale-95 ${
                  isSelectionMode 
                  ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" 
                  : isDarkMode 
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20" 
                    : "bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100"
                }`}
              >
                <span className="material-symbols-outlined">{isSelectionMode ? 'close' : 'delete'}</span>
                {isSelectionMode ? 'Cancel Selection' : 'Delete Patient'}
              </button>
              
              <button
                onClick={() => navigate("/add-patient")}
                className="flex items-center gap-2 bg-primary px-4 py-2 rounded-lg font-semibold hover:bg-primary/90 text-white shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined">person_add</span>
                Add New Patient
              </button>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className={`flex gap-3 mb-6 border-b pb-4 ${isDarkMode ? 'border-[#233648]' : 'border-gray-200'}`}>
            {[
              { id: "all", label: "All Patients" },
              { id: "pending", label: "Pending Review" },
              { id: "completed", label: "Completed" }
            ].map((f) => {
              const count = sortedPatients.filter(p => {
                const pReports = Array.isArray(p.reports) ? p.reports : [];
                const lastScanTime = lastScanMap[p.patientId] || 0;
                const lastRevTime = p.updatedAt?.seconds 
                  ? p.updatedAt.seconds * 1000 
                  : (typeof p.updatedAt === "number" ? p.updatedAt : new Date(p.updatedAt || 0).getTime());

                const hasUnreviewed = pReports.length > 0 && pReports.some(r => !r.doctorNotes || r.doctorNotes.trim() === "");
                const isStale = lastScanTime > (lastRevTime + 1000);

                // Patient is Pending if they have unreviewed scans, a new upload, or no scans at all
                const status = (hasUnreviewed || isStale || pReports.length === 0) ? "pending" : "completed";
                return status === f.id;
              }).length;

              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-black transition-all flex items-center gap-2 ${filter === f.id
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : isDarkMode 
                      ? "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white" 
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {f.label}
                  {f.id === "pending" && count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      filter === "pending" 
                        ? "bg-white text-primary" 
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          
          {/* BULK ACTION BAR */}
          {isSelectionMode && (
            <div className={`mb-8 p-5 rounded-[1.5rem] flex items-center justify-between transition-all duration-500 animate-in fade-in slide-in-from-top-4 ${
              isDarkMode 
                ? 'bg-white/[0.03] border border-white/5 backdrop-blur-md shadow-2xl shadow-black/20' 
                : 'bg-white border border-slate-100 shadow-xl shadow-slate-200/50'
            }`}>
              <div className="flex items-center gap-6">
                <button 
                  onClick={toggleSelectAll}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 ${
                    selectedIds.length === visiblePatients.length 
                      ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                      : isDarkMode 
                        ? 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white' 
                        : 'bg-white text-slate-600 border border-slate-100 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {selectedIds.length === visiblePatients.length ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  {selectedIds.length === visiblePatients.length ? 'Deselect All Entries' : 'Select All Records'}
                </button>
                
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Bulk Management Active</span>
                  <span className={isDarkMode ? 'text-slate-500 text-xs font-bold' : 'text-slate-400 text-xs font-bold'}>
                    {selectedIds.length} of {visiblePatients.length} patient records flagged for purge
                  </span>
                </div>
              </div>
              
              <button
                onClick={initiatePurge}
                disabled={selectedIds.length === 0 || isDeleting}
                className={`flex items-center gap-3 px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                  selectedIds.length > 0 
                    ? 'bg-rose-500 text-white shadow-2xl shadow-rose-500/40 hover:bg-rose-600 active:scale-95' 
                    : 'opacity-20 grayscale pointer-events-none'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{isDeleting ? 'sync' : 'delete_sweep'}</span>
                {isDeleting ? 'Executing Purge...' : `Purge ${selectedIds.length} Records`}
              </button>
            </div>
          )}

          {/* BENTO CARD GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visiblePatients.map((p) => {
              // STRICT Specialist Activity Logic
              const pReports = Array.isArray(p.reports) ? p.reports : [];
              const lastScanTime = lastScanMap[p.patientId] || 0;
              const lastRevTime = p.updatedAt?.seconds 
                ? p.updatedAt.seconds * 1000 
                : (typeof p.updatedAt === "number" ? p.updatedAt : new Date(p.updatedAt || 0).getTime());

              const hasUnreviewed = pReports.length > 0 && pReports.some(r => !r.doctorNotes || r.doctorNotes.trim() === "");
              const isStale = lastScanTime > (lastRevTime + 2000);
              const statusKey = (hasUnreviewed || isStale || pReports.length === 0) ? "pending" : "completed";
              const ui = STATUS_UI[statusKey];
              const specialistActivity = (statusKey === "completed") ? lastRevTime : 0;
              const isSelected = selectedIds.includes(p.id);

              return (
                <div 
                  key={p.id}
                  className={`group relative rounded-2xl p-6 border transition-all duration-500 overflow-hidden ${
                    isSelected
                      ? "bg-[#007aff]/5 border-[#007aff]/30 shadow-lg shadow-[#007aff]/10"
                      : isDarkMode 
                        ? "bg-[#111a22]/80 border-white/5 hover:bg-white/[0.04] hover:border-white/10" 
                        : "bg-white border-gray-100 hover:shadow-xl hover:shadow-slate-200/50"
                  }`}
                >
                  {/* SELECTION OVERLAY */}
                  {isSelectionMode && (
                    <div 
                      onClick={() => toggleSelect(p.id)}
                      className="absolute top-4 right-4 z-20 cursor-pointer"
                    >
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isSelected 
                          ? "bg-[#007aff] border-[#007aff]" 
                          : "bg-transparent border-white/20"
                      }`}>
                        {isSelected && <span className="material-symbols-outlined text-white text-[16px] font-bold">check</span>}
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4 mb-6">
                    <div className="relative shrink-0">
                      <img
                        src={p.photoUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
                        className={`w-14 h-14 rounded-2xl object-cover border-2 transition-transform group-hover:scale-105 ${isDarkMode ? 'border-white/10' : 'border-white shadow-sm'}`}
                        alt="patient"
                      />
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 ${isDarkMode ? 'border-[#111a22]' : 'border-white'} ${statusKey === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    </div>
                    
                    <div className="flex flex-col">
                      <h3 className={`font-black text-lg tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        {p.name || "Unnamed Patient"}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-black uppercase tracking-widest opacity-40 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {p.patientId}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-white/20" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${ui.badge.split(' ')[1]}`}>
                          {ui.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 gap-4 pt-4 border-t ${isDarkMode ? 'border-white/5' : 'border-gray-50'}`}>
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-[0.1em] mb-1 opacity-40 ${isDarkMode ? 'text-white' : 'text-slate-500'}`}>
                        Last Clinical Entry
                      </p>
                      <p className={`text-xs font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {specialistActivity > 0 ? new Date(specialistActivity).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-[0.1em] mb-1 opacity-40 ${isDarkMode ? 'text-white' : 'text-slate-500'}`}>
                        Diagnostic Case
                      </p>
                      <p className={`text-xs font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Standard Registry
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={() => viewProfile(p)}
                      className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isDarkMode ? 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                    >
                      Patient Profile
                    </button>
                    <button
                      onClick={() => openCase(p)}
                      className="flex-1 bg-[#007aff] py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-[#0062cc] shadow-[0_4px_12px_rgba(0,122,255,0.2)] hover:shadow-[0_4px_20px_rgba(0,122,255,0.3)] transition-all active:scale-95"
                    >
                      Open Case
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {visiblePatients.length === 0 && (
            <div className={`mt-12 text-center text-sm ${isDarkMode ? 'text-muted-dark' : 'text-gray-500'}`}>
              No patients matched your current clinical filter.
            </div>
          )}

          {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
          {selectedIds.length > 0 && (
            <div className="fixed bottom-8 left-[50%] -translate-x-[50%] z-50 animate-in fade-in slide-in-from-bottom-10 h-16 flex items-center gap-6 px-8 rounded-2xl border bg-slate-900/80 border-white/10 text-white shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="bg-primary px-3 py-1 rounded-lg text-xs font-black">
                  {selectedIds.length}
                </div>
                <p className="text-sm font-bold tracking-tight">Records Selected</p>
              </div>

              <div className="h-4 w-px bg-white/20" />

              <div className="flex items-center gap-3">
                <button 
                  onClick={initiatePurge}
                  disabled={isDeleting}
                  className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isDeleting ? 'progress_activity' : 'delete'}
                  </span>
                  {isDeleting ? 'Purging...' : 'Delete Selected'}
                </button>
                <button 
                  onClick={() => setSelectedIds([])}
                  className="px-4 py-2 rounded-lg text-xs font-bold hover:bg-white/10 transition-all"
                >
                  Deselect
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* PREMIUM PURGE MODAL */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-[#0b1219]/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className={`w-full max-w-sm rounded-[32px] border shadow-2xl overflow-hidden animate-in zoom-in slide-in-from-bottom-8 duration-500 ${isDarkMode ? "bg-[#0f172a] border-white/10" : "bg-white border-gray-100"}`}>
            <div className="p-10 text-center">
              <div className="size-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-8 transition-transform duration-700 hover:rotate-[360deg]">
                <span className="material-symbols-outlined text-rose-500 text-3xl">warning</span>
              </div>
              
              <h3 className={`text-2xl font-black tracking-tight mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Purge Records?
              </h3>
              
              <p className={`text-sm font-medium leading-relaxed mb-2 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                This action will permanently remove the clinical diagnostic records for 
                <span className="text-[#007aff] font-black mx-1">{selectedIds.length} patients</span>.
              </p>
              
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500/60 font-mono">
                Terminal Action: Irreversible
              </p>
            </div>

            <div className={`flex items-center border-t ${isDarkMode ? "border-white/5" : "border-gray-50"}`}>
              <button
                onClick={() => setShowPurgeModal(false)}
                className={`flex-1 px-8 py-5 text-[11px] font-black uppercase tracking-[0.25em] transition-all hover:tracking-[0.3em] ${isDarkMode ? "text-slate-500 hover:text-white" : "text-gray-400 hover:text-gray-900"}`}
              >
                Retain
              </button>
              <div className={`w-px h-16 ${isDarkMode ? "bg-white/5" : "bg-gray-50"}`} />
              <button
                onClick={deleteSelected}
                className="flex-1 px-8 py-5 text-[11px] font-black uppercase tracking-[0.25em] bg-rose-600 hover:bg-rose-500 text-white transition-all hover:tracking-[0.3em] active:scale-95 shadow-inner"
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

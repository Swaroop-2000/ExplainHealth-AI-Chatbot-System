// src/components/AppointmentsSection.js
import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useSearchParams } from "react-router-dom";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  addDoc,
  getDoc,
  getDocs,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export default function AppointmentsSection({ doctorId, doctorName }) {
  const { isDarkMode } = useTheme();
  const [appointments, setAppointments] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");

  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [newDateTime, setNewDateTime] = useState("");

  const [detailsTarget, setDetailsTarget] = useState(null);
  const [detailsPatientData, setDetailsPatientData] = useState(null);
  const [detailsReports, setDetailsReports] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [searchParams] = useSearchParams();
  const focusedApptId = searchParams.get("appointmentId");
  const appointmentRefs = useRef({});

  const [secondTableFilter, setSecondTableFilter] = useState("all");

  // Robust Millisecond Conversion for real-time UI rendering & filtering
  const getSafeMillis = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (val.toMillis) return val.toMillis();
    if (val.seconds) return val.seconds * 1000;
    const d = new Date(val);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  useEffect(() => {
    // If we have neither IDs nor Name, we can't query reliably
    if ((!doctorId || (Array.isArray(doctorId) && doctorId.length === 0)) && !doctorName) return;

    const queryIds = Array.isArray(doctorId) ? doctorId : (doctorId ? [doctorId] : []);

    // FETCH PLAN:
    // 1. Fetch by doctorEmployeeId (IDs list)
    // 2. We can't do multiple where queries in one snapshot easily if fields are different
    // So we fetch by collection and filter in JS if the count isn't massive, 
    // OR we just perform a broad search.

    const q = query(collection(db, "appointments"), orderBy("bookedAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Clinical Reconciliation: Match by ID list OR by Name string
      const filtered = all.filter(a => {
        // Match by ID
        if (a.doctorEmployeeId && queryIds.includes(a.doctorEmployeeId)) return true;

        // Match by Name (strip Dr. prefix for resilience)
        if (doctorName && a.doctor) {
          const cleanSearch = doctorName.replace(/^Dr\.?\s*/i, "").trim().toLowerCase();
          const cleanTarget = a.doctor.replace(/^Dr\.?\s*/i, "").trim().toLowerCase();
          if (cleanSearch === cleanTarget) return true;
        }

        return false;
      });

      setAppointments(filtered);
    });

    return () => unsub();
  }, [doctorId, doctorName]);

  // Clinical Focus: Scroll to and highlight targeted appointment
  useEffect(() => {
    if (focusedApptId && appointments.length > 0) {
      // 1. Identify where the appointment is (Pending vs Archive)
      const targetAppt = appointments.find(a => a.id === focusedApptId);
      if (targetAppt) {
        // 2. If it's in the archive, ensure the filter allows it to be seen
        if (targetAppt.status === "accepted") setSecondTableFilter("accepted");
        else if (targetAppt.status === "cancelled") setSecondTableFilter("rejected");
      }

      // 3. Scroll to the element after potential filter update
      setTimeout(() => {
        const targetEl = appointmentRefs.current[focusedApptId];
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, [focusedApptId, appointments]);

  const pushNotification = async ({ doctorId = null, targetUserId = null, message = "", meta = {} }) => {
    try {
      await addDoc(collection(db, "notifications"), {
        doctorId,
        targetUserId,
        message,
        meta,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("pushNotification failed:", err);
    }
  };

  const formatApptTime = (a) => {
    const ts = a.scheduledAt || a.bookedAt || null;
    if (!ts) return "Not scheduled";
    return new Date(ts).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const acceptAppointment = async (ap) => {
    try {
      const ref = doc(db, "appointments", ap.id);
      await updateDoc(ref, {
        status: "accepted",
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        targetUserId: ap.patientId,
        doctorId: ap.doctorEmployeeId,
        doctorName: ap.doctor,
        patientName: ap.patientName,
        message: `Your appointment with ${ap.doctor} has been accepted.`,
        type: "appointment_accepted",
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("acceptAppointment error:", err);
    }
  };

  const openReschedule = (ap) => {
    setRescheduleTarget(ap);
    const baseTs = ap.scheduledAt || ap.bookedAt || null;
    if (baseTs) {
      const dt = new Date(baseTs);
      const iso = dt.toISOString().slice(0, 16);
      setNewDateTime(iso);
    } else {
      setNewDateTime("");
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleTarget || !newDateTime) return;

    try {
      const scheduledAt = new Date(newDateTime).getTime();
      const ref = doc(db, "appointments", rescheduleTarget.id);

      await updateDoc(ref, {
        scheduledAt,
        status: "rescheduled",
        updatedAt: serverTimestamp(),
      });

      await pushNotification({
        doctorId: rescheduleTarget.doctorEmployeeId || null,
        targetUserId: rescheduleTarget.patientId || null,
        message: `Your appointment with ${rescheduleTarget.doctor || "Doctor"} was rescheduled.`,
        meta: { appointmentId: rescheduleTarget.id, type: "appointment_rescheduled", scheduledAt },
      });

      setRescheduleTarget(null);
      setNewDateTime("");
    } catch (err) {
      console.error("submitReschedule error:", err);
    }
  };

  const cancelAppointment = async (ap) => {
    try {
      const ref = doc(db, "appointments", ap.id);
      await updateDoc(ref, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        targetUserId: ap.patientId,
        doctorName: ap.doctor,
        patientName: ap.patientName,
        message: `Your appointment with ${ap.doctor} has been cancelled.`,
        type: "appointment_cancelled",
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("cancelAppointment error:", err);
    }
  };

  const [activeReport, setActiveReport] = useState(null);

  const openDetails = async (a) => {
    setDetailsTarget(a);
    setLoadingDetails(true);
    try {
      const pDoc = await getDoc(doc(db, "patients", a.patientId));
      if (pDoc.exists()) {
        const d = pDoc.data();
        setDetailsPatientData(d);

        // 1. Sort all reports for baseline (Latest first)
        const reports = (Array.isArray(d.reports) ? d.reports : (d.reports ? Object.values(d.reports) : []))
          .map(r => {
            const rawTs = r.createdAt || r.timestamp;
            let sortTs = 0;
            if (rawTs?.toMillis) sortTs = rawTs.toMillis();
            else if (rawTs?.seconds) sortTs = rawTs.seconds * 1000;
            else if (rawTs instanceof Date) sortTs = rawTs.getTime();
            else sortTs = new Date(rawTs).getTime() || 0;
            return { ...r, sortTs };
          })
          .sort((x, y) => y.sortTs - x.sortTs);

        setDetailsReports(reports);
        setActiveReport(reports[0] || null); // DEFAULT TO LATEST
      }
    } catch (err) {
      console.error("fetch details error:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const jumpToReport = (report) => {
    setActiveReport(report);
  };

  const pending = appointments.filter((a) => {
    // Treat 'upcoming' as a pending state that needs doctor approval (intake)
    if (a.status === "accepted" || a.status === "cancelled") return false;

    const ts = getSafeMillis(a.scheduledAt || a.bookedAt || 0);
    const now = Date.now();
    if (filterStatus === "upcoming") return ts > now;
    if (filterStatus === "past") return ts <= now;
    return true;
  });

  const acceptedList = appointments.filter((a) => a.status === "accepted");
  const rejectedList = appointments.filter((a) => a.status === "cancelled");

  const secondAreaVisible = (() => {
    // Determine which archived items to show based on the second HUD filter
    let base = [];
    if (secondTableFilter === "accepted") base = acceptedList;
    else if (secondTableFilter === "rejected") base = rejectedList;
    else base = [...acceptedList, ...rejectedList];

    // Also apply the time-based filter (Upcoming/Past) if the doctor is in a specific view
    return base.filter(a => {
      const ts = getSafeMillis(a.scheduledAt || a.bookedAt || 0);
      const now = Date.now();
      if (filterStatus === "upcoming") return ts > now;
      if (filterStatus === "past") return ts <= now;
      return true;
    });
  })();

  const StatusBadge = ({ status }) => {
    const config = {
      accepted: { bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", label: "Accepted Case" },
      cancelled: { bg: "bg-rose-500/10 text-rose-500 border-rose-500/20", label: "Rejected" },
      rescheduled: { bg: "bg-amber-500/10 text-amber-500 border-amber-500/20", label: "Revision Requested" },
      pending: { bg: "bg-blue-500/10 text-blue-500 border-blue-500/20", label: "Pending Intake" }
    };
    const s = config[status] || config.pending;
    return (
      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${s.bg}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="space-y-12">
      <section className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className={`text-2xl font-black tracking-tight flex items-center gap-3 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              <span className="material-symbols-outlined text-blue-500 text-3xl">medical_information</span>
              Consultation Requests
            </h2>
            <p className={`text-sm font-bold uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Patients awaiting clinical approval
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`p-1 rounded-xl flex items-center gap-1 ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
              {['all', 'upcoming', 'past'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === st
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:bg-white')
                    }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {pending.map((a) => (
            <div
              key={a.id}
              ref={el => appointmentRefs.current[a.id] = el}
              className={`p-6 rounded-[2.5rem] border-2 transition-all duration-500 group hover:-translate-y-1.5 ${
                focusedApptId === a.id ? 'ring-4 ring-blue-500/50 border-blue-500' : ''
              } ${isDarkMode
                ? 'bg-gradient-to-br from-[#111827] to-[#0f172a] border-white/10 hover:border-blue-500/50 shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:shadow-blue-500/10'
                : 'bg-white border-slate-200/60 shadow-[0_10px_30px_rgba(0,0,0,0.04)] hover:shadow-2xl hover:shadow-slate-200/80 hover:border-blue-500/30'
                }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4">
                  <div className={`size-14 rounded-2xl flex items-center justify-center text-2xl font-black ${isDarkMode ? 'bg-blue-500/10 text-blue-500' : 'bg-blue-50 text-blue-600'}`}>
                    {a.patientName ? a.patientName[0] : 'P'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-lg font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{a.patientName}</h4>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className={`text-[10px] font-black uppercase tracking-widest opacity-40 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>REF: {a.patientId}</p>
                    <div className="flex items-center gap-4 mt-12">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500 text-[20px]">schedule</span>
                        <span className={`text-[12px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formatApptTime(a)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-x-4 group-hover:translate-x-0">
                  <button onClick={() => acceptAppointment(a)} className="size-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-emerald-500/20" title="Accept Case">
                    <span className="material-symbols-outlined text-lg">check</span>
                  </button>
                  <button onClick={() => openReschedule(a)} className="size-10 rounded-xl bg-amber-500 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20" title="Reschedule">
                    <span className="material-symbols-outlined text-lg">edit_calendar</span>
                  </button>
                  <button onClick={() => cancelAppointment(a)} className="size-10 rounded-xl bg-rose-500 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-rose-500/20" title="Reject Intake">
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                  <button onClick={() => openDetails(a)} className={`size-10 rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`} title="Case Details">
                    <span className="material-symbols-outlined text-lg">visibility</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <div className={`col-span-full p-12 rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-800/10 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
              <span className="material-symbols-outlined text-4xl text-slate-500 mb-4 opacity-30">clinical_notes</span>
              <p className={`text-xs font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>All clinical requests handled</p>
            </div>
          )}
        </div>
      </section>

      <section className="animate-fade-in delay-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h2 className={`text-xl font-black tracking-tight flex items-center gap-3 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              <span className="material-symbols-outlined text-emerald-500 text-3xl">history</span>
              Case Archive
            </h2>
            <p className={`text-sm font-bold uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Resolved & Scheduled Engagements
            </p>
          </div>

          <div className="flex gap-2 p-1 rounded-2xl bg-white/5 border border-white/5">
            {['all', 'accepted', 'rejected'].map(f => (
              <button
                key={f}
                onClick={() => setSecondTableFilter(f)}
                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${secondTableFilter === f
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/30'
                  : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {secondAreaVisible.map((a) => (
            <div
              key={a.id}
              ref={el => appointmentRefs.current[a.id] = el}
              className={`p-5 rounded-3xl border-2 flex items-center justify-between transition-all duration-300 hover:scale-[1.005] ${
                focusedApptId === a.id ? 'ring-4 ring-blue-500/50 border-blue-500' : ''
              } ${isDarkMode
                ? 'bg-white/5 border-white/5 hover:bg-white/[0.08] hover:border-white/10'
                : 'bg-white border-slate-100 hover:border-blue-500/20 hover:shadow-xl hover:shadow-slate-200/40'
                }`}
            >
              <div className="flex items-center gap-6">
                <StatusBadge status={a.status} />
                <div className="size-1 w-1 bg-white/10 rounded-full"></div>
                <div>
                  <h4 className={`text-sm font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{a.patientName}</h4>
                  <p className="text-[9px] font-extrabold text-blue-500 uppercase tracking-widest mt-0.5">{formatApptTime(a)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => openDetails(a)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${isDarkMode ? 'bg-transparent border-white/10 text-slate-400 hover:text-white hover:border-white/30' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                  Review Case
                </button>
                <button onClick={() => cancelAppointment(a)} className="text-rose-500/50 hover:text-rose-500 transition-colors p-2">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </div>
          ))}
          {secondAreaVisible.length === 0 && (
            <div className={`p-8 text-center text-[10px] font-black uppercase tracking-[0.2em] opacity-30 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Archive Environment Empty</div>
          )}
        </div>
      </section>

      {rescheduleTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`relative w-full max-w-md p-8 rounded-[2.5rem] border shadow-2xl animate-in zoom-in-95 duration-300 ${isDarkMode ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'}`}>
            <h4 className="text-2xl font-black tracking-tight mb-2">Revision Request</h4>
            <p className="text-sm text-slate-500 mb-8 font-medium">Coordinate a new clinical intake slot for <span className="text-blue-500 font-bold">{rescheduleTarget.patientName}</span>.</p>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-blue-500 block mb-3">Target Slot</label>
                <input
                  type="datetime-local"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(e.target.value)}
                  className={`w-full h-14 px-5 rounded-2xl border outline-none font-bold transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4">
                <button onClick={() => setRescheduleTarget(null)} className={`h-14 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${isDarkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-100 text-slate-600'}`}>Dismiss</button>
                <button onClick={submitReschedule} className="h-14 rounded-2xl bg-blue-600 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all">Authorize Slot</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailsTarget && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 md:p-10 md:pl-64 pt-[76px] bg-transparent backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto">
          <div className={`relative w-full max-w-4xl max-h-[85vh] rounded-[3rem] border shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-y-auto overscroll-contain flex flex-col md:flex-row animate-in zoom-in-95 duration-500 shadow-blue-900/10 ${isDarkMode ? 'bg-[#0f172a] border-white/10' : 'bg-white border-slate-200'}`}>

            {/* Left Sidebar: Clinical Visuals */}
            <div className={`w-full md:w-80 flex-shrink-0 p-8 pb-24 border-r overflow-y-auto ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
              <div className="size-full flex flex-col">
                <div className="relative group rounded-[2.5rem] overflow-hidden border border-white/5 mb-8 bg-black flex items-center justify-center h-[280px] p-2 shadow-inner flex-shrink-0">
                  <img
                    src={activeReport?.imageUrl || activeReport?.heatmapUrl || "/mnt/data/fc34b385-0a8d-4e73-b809-6c176b31d29b.png"}
                    alt="Clinical Scan"
                    className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/90 to-transparent pointer-events-none"></div>
                  <div className="absolute bottom-4 left-6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">Clinical Intake View</p>
                    <p className="text-xs font-black text-white/90">Retinal Fundus (Full Scan)</p>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Historical Archives</p>
                  {detailsReports.slice(0, 3).map(r => (
                    <div
                      key={r.id}
                      onClick={() => jumpToReport(r)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 ${activeReport?.id === r.id ? (isDarkMode ? 'bg-blue-500/20 border-blue-500/40 ring-1 ring-blue-500/30' : 'bg-blue-50 border-blue-200 ring-1 ring-blue-100') : (isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200')}`}
                    >
                      <p className="text-xs font-black">{r.name || "Retinal Analysis"}</p>
                      <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">
                        Processed: {new Date(getSafeMillis(r.createdAt || r.timestamp)).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-16 mt-16 border-t border-white/5 flex-shrink-0">
                  <div className="grid grid-cols-2 gap-3">
                    {detailsTarget?.status === 'accepted' ? (
                      <button onClick={() => { openReschedule(detailsTarget); setDetailsTarget(null); }} className="h-14 rounded-2xl bg-amber-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-amber-500/20" title="Reschedule">
                        <span className="material-symbols-outlined text-xl">edit_calendar</span>
                      </button>
                    ) : (
                      <button onClick={() => { acceptAppointment(detailsTarget); setDetailsTarget(null); }} className="h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-500/20" title="Accept Case">
                        <span className="material-symbols-outlined text-xl">check</span>
                      </button>
                    )}

                    {detailsTarget?.status === 'cancelled' ? (
                      <button onClick={() => { openReschedule(detailsTarget); setDetailsTarget(null); }} className="h-14 rounded-2xl bg-amber-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-amber-500/20" title="Reschedule">
                        <span className="material-symbols-outlined text-xl">edit_calendar</span>
                      </button>
                    ) : (
                      <button onClick={() => { cancelAppointment(detailsTarget); setDetailsTarget(null); }} className="h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-rose-500/20" title="Reject Intake">
                        <span className="material-symbols-outlined text-xl">close</span>
                      </button>
                    )}
                  </div>
                </div>
                {/* Spacer to force distance from bottom border */}
                <div className="h-10 flex-shrink-0"></div>
              </div>
            </div>

            {/* Right: Clinical Data Hub */}
            <div className="flex-1 p-12">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="px-3 py-1 bg-blue-600 rounded-lg text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">Active Intake Case</div>
                    <StatusBadge status={detailsTarget.status} />
                  </div>
                  <h2 className="text-4xl font-black tracking-tight mb-2">{detailsTarget.patientName}</h2>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em]">{detailsTarget.patientId}</p>
                </div>
                <button onClick={() => setDetailsTarget(null)} className="size-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-500 transition-all">
                  <span className="material-symbols-outlined font-black">close</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-10">
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-4 pb-2 border-b border-white/5">Physiological Metrics</h5>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Age Profile</p>
                        <p className="text-lg font-black">{detailsPatientData?.age || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Gender</p>
                        <p className="text-lg font-black">{detailsPatientData?.gender || "Global"}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-4 pb-2 border-b border-white/5">Primary Specialist</h5>
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                        <span className="material-symbols-outlined">medical_services</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black">{detailsTarget.doctor}</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Lead Clinical Consultant</p>
                      </div>
                    </div>

                    {/* ENHANCED AI PREDICTIONS IN SPECIALIST PANEL */}
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-blue-500/5 border-blue-500/10' : 'bg-blue-50 border-blue-100'}`}>
                        <p className="text-[8px] font-black text-blue-500 uppercase tracking-wider mb-1.5">CNN Classification</p>
                        <p className={`text-xs font-black leading-tight ${isDarkMode ? 'text-white' : 'text-blue-900'}`}>
                          {activeReport?.cnn_top5?.[0]?.label || activeReport?.prediction || "Pending"}
                        </p>
                      </div>
                      <div className={`p-4 rounded-2xl border ${isDarkMode ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-50 border-emerald-100'}`}>
                        <p className="text-[8px] font-black text-emerald-500 uppercase tracking-wider mb-1.5">SVM Reference</p>
                        <p className={`text-xs font-black leading-tight ${isDarkMode ? 'text-white' : 'text-emerald-900'}`}>
                          {activeReport?.svm_top5?.[0]?.label || activeReport?.prediction || "Verified"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-10">
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-4 pb-2 border-b border-white/5">Specialist Impressions</h5>
                    <div className={`p-6 rounded-3xl border italic text-sm leading-relaxed ${isDarkMode ? 'bg-white/5 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                      "{activeReport?.doctorNotes || activeReport?.doctorFeedback || detailsPatientData?.doctorNotes || "Baseline established. Intake awaiting primary specialist review of standard retinal fundus imagery."}"
                    </div>
                  </div>

                  <div className={`p-6 rounded-3xl border flex items-center justify-between ${isDarkMode ? 'bg-blue-600/5 border-blue-600/20' : 'bg-blue-50 border-blue-100'}`}>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Clinical Intake Slot</p>
                      <p className="text-sm font-black">{formatApptTime(detailsTarget)}</p>
                    </div>
                    <span className="material-symbols-outlined text-blue-500">help</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

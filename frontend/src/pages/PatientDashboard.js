// src/pages/PatientDashboard.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

import { db, storage } from "../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* FullCalendar imports */
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

/**
 * PatientDashboard
 *
 * - Layout variant B (calendar emphasized, doctor card to the right)
 * - Keeps all existing functionality and integrates:
 *    - Accept appointment (status -> "accepted") with notification
 *    - Rejected displayed as cancelled
 *    - Two quick buttons to show Accepted / Rejected appointments in place of main list
 *    - No other logic changed
 */

export default function PatientDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const patient = location.state || {};
  const isDarkMode = true; // Dashboard uses fixed Dark Medical Theme

  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [latestReportUrl, setLatestReportUrl] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [hospital, setHospital] = useState("City General Hospital");
  const [doctor, setDoctor] = useState("Dr. Evelyn Reed");
  const [bookingLoading, setBookingLoading] = useState(false);

  // NEW STATES (date + time)
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");

  // APPOINTMENTS
  const [appointments, setAppointments] = useState([]);
  const [apptFilter, setApptFilter] = useState("upcoming");

  // VIEW MODE: 'default' (uses apptFilter), 'accepted', 'rejected'
  const [viewMode, setViewMode] = useState("default");

  const [rescheduleModal, setRescheduleModal] = useState({ open: false, appt: null });
  const [rescheduleDate, setRescheduleDate] = useState("");

  // CALENDAR HOVER INTERACTIVITY
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // DOCTOR NOTES (DYNAMIC)
  const [doctorNotes, setDoctorNotes] = useState("");
  const [doctorNotesUpdatedAt, setDoctorNotesUpdatedAt] = useState("");
  const [doctorName, setDoctorName] = useState("");

  // Next upcoming appointment's doctor details shown in the Doctor Info card
  const [nextDoctorInfo, setNextDoctorInfo] = useState(null);

  // 🔔 Patient Notifications
  const [notifications, setNotifications] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(false);


  // fallback image path (developer provided local file or remote link)
  const FALLBACK_DOCTOR_IMAGE = "https://img.freepik.com/free-photo/doctor-offering-medical-tele-consultation-patient_23-2149329007.jpg";

// ---------------------------------------------------------
// REUSABLE PREMIUM DROPDOWN COMPONENT
// ---------------------------------------------------------
const PremiumDropdown = ({ value, onChange, options, icon, isDarkMode, placeholder = "Select Option", className="" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || { label: value || placeholder };

  return (
    <div className={`relative group ${className}`} ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-full min-h-[44px] bg-white/5 border border-white/10 rounded-2xl flex items-center px-4 cursor-pointer transition-all duration-300 ${isOpen ? 'border-blue-500/50 ring-4 ring-blue-500/10 bg-white/10' : 'hover:bg-white/10 hover:border-white/20'}`}
      >
        {icon && <span className="material-symbols-outlined text-xl text-gray-500 mr-3 group-hover:text-blue-500 transition-colors">{icon}</span>}
        <span className="text-sm font-bold text-white truncate flex-1">{selectedOption.label}</span>
        <span className="material-symbols-outlined text-xl text-gray-500 ml-2 transition-transform duration-300" style={{ transform: `rotate(${isOpen ? 180 : 0}deg)` }}>expand_more</span>
      </div>

      {isOpen && (
        <div className={`absolute top-[110%] left-0 right-0 z-[100] rounded-2xl border border-white/10 overflow-hidden backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-top-2 duration-300 ${isDarkMode ? 'bg-[#0f2430]/95' : 'bg-white/95'}`}>
          <div className="max-h-64 overflow-y-auto py-1 scrollbar-hide">
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`px-5 py-3.5 text-sm font-bold cursor-pointer transition-all flex items-center gap-3 ${value === opt.value ? 'bg-blue-600/90 text-white shadow-inner' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}
              >
                {opt.icon && <span className="material-symbols-outlined text-lg opacity-70">{opt.icon}</span>}
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

  const findDoctorByName = async (doctorNameToFind) => {
    try {
      // Normalize: Strip "Dr." prefix and whitespace to match Firestore raw data
      const cleaned = doctorNameToFind.replace(/^Dr\.\s*/i, "").trim();

      const q = query(collection(db, "doctors"));
      const snap = await getDocs(q);

      // Local normalization for maximum matching stability
      const match = snap.docs.find(d => {
        const dName = (d.data().name || "").replace(/^Dr\.\s*/i, "").trim();
        return dName === cleaned;
      });

      if (match) {
        return { id: match.id, data: match.data() };
      }
      return null;
    } catch (err) {
      console.error("findDoctorByName error:", err);
      return null;
    }
  };

  // ------------------------------------------
  // pushNotification helper: write to notifications collection
  // ------------------------------------------

  const pushNotification = async ({ doctorId = null, targetUserId = null, message = "", meta = {} }) => {
    try {
      await addDoc(collection(db, "notifications"), {
        doctorId: doctorId || null,   // doctor employee id (filters for doctor view)
        targetUserId: targetUserId || null, // patient id for patient-facing notifications
        patientName: (patient && patient.name) || (meta.patientName || "") || null,
        message,
        meta,
        read: false,
        createdAt: serverTimestamp(), // use Firestore ts so Header can use .toDate()
      });
    } catch (err) {
      console.warn("pushNotification failed:", err);
    }
  };


  // ------------------------------------------
  // LOAD MOST RECENT REPORT
  // ------------------------------------------
  const loadLatestReport = async () => {
    if (!patient?.patientId) return;

    const q = query(
      collection(db, "uploads"),
      where("patientId", "==", patient.patientId),
      orderBy("timestamp", "desc")
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      setLatestReportUrl(snapshot.docs[0].data().imageUrl);
    }
  };

  useEffect(() => {
    loadLatestReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ------------------------------------------
  // LOAD DOCTOR FEEDBACK (REALTIME) and sync doctor name
  // ------------------------------------------
  useEffect(() => {
    if (!patient?.patientId) return;

    const pRef = doc(db, "patients", patient.patientId);
    const unsub = onSnapshot(pRef, async (snap) => {
      if (!snap.exists()) {
        setDoctorNotes("");
        setDoctorNotesUpdatedAt("");
        setDoctorName("Doctor");
        return;
      }

      const d = snap.data();

      // SCOPED SYNC: Pull notes from the Latest Report in the array (Global field abolished)
      const reports = Array.isArray(d.reports) ? d.reports : (d.reports ? Object.values(d.reports) : []);
      const sorted = [...reports].sort((a, b) => {
        const getTs = (obj) => {
          if (!obj) return 0;
          if (obj.createdAt?.toMillis) return obj.createdAt.toMillis();
          if (obj.createdAt?.seconds) return obj.createdAt.seconds * 1000;
          if (typeof obj.createdAt === 'number') return obj.createdAt;
          if (obj.createdAt instanceof Date) return obj.createdAt.getTime();
          return 0;
        };
        return getTs(b) - getTs(a);
      });
      const latestReport = sorted[0];

      // Robust Millisecond Conversion for real-time UI rendering
      const getSafeMillis = (val) => {
        if (!val) return 0;
        if (val.toMillis) return val.toMillis();
        if (val.seconds) return val.seconds * 1000;
        const d = new Date(val);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };

      setDoctorNotes(latestReport?.doctorNotes || "");
      setDoctorNotesUpdatedAt(getSafeMillis(latestReport?.createdAt) || getSafeMillis(d.updatedAt) || 0);

      // Doctor name comes directly from doctor when saving notes
      setDoctorName(d.doctorName || "Doctor");

      // OPTIONAL: If doctorEmployeeId exists but doctorName missing → fetch once
      if (d.doctorEmployeeId && !d.doctorName) {
        try {
          const docRef = doc(db, "doctors", d.doctorEmployeeId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const dd = docSnap.data();
            await updateDoc(pRef, { doctorName: dd.name });
            setDoctorName(dd.name);
          }
        } catch (err) {
          console.error("Doctor name fetch error:", err);
        }
      }
    });

    return () => unsub();
  }, [patient?.patientId]);

  // ------------------------------------------
  // UPLOAD IMAGE + RUN AI PREDICTION + SAVE TO FIRESTORE + REDIRECT
  // ------------------------------------------
  const handleUploadImage = async () => {
    if (!imageFile) return alert("Please select an image first.");

    try {
      setUploading(true);

      // Upload to Firebase Storage
      const fileName = `${patient.patientId}_${Date.now()}_${imageFile.name}`;
      const storageRef = ref(storage, `patient_uploads/${fileName}`);
      await uploadBytes(storageRef, imageFile);
      const url = await getDownloadURL(storageRef);

      // Save in Firestore (Uploads Collection - KEEP REST AS IS)
      await addDoc(collection(db, "uploads"), {
        patientId: patient.patientId,
        name: patient.name,
        imageUrl: url,
        timestamp: Date.now(),
      });

      // Call backend prediction
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("patientId", patient.patientId);
      formData.append("patientName", patient.name);

      const response = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        body: formData,
      });

      let result = null;
      try {
        result = await response.json();
      } catch (_) {
        /* backend didn't return JSON, ignore safely */
      }

      if (!response.ok) {
        throw new Error("Prediction API returned error");
      }

      console.log("Prediction success:", result);

      // ---------------------------------------------------------
      // ✅ NEW: Save Report to Patients Collection (Array)
      // ---------------------------------------------------------
      if (result) {
        try {
          const newReport = {
            id: `${Date.now()}`,
            imageUrl: url,
            createdAt: new Date(), // Storing as object/string often safer for arrays than serverTimestamp if reading strictly in JS
            ...result,             // cnn_top5, svm_top5, prediction, confidence, etc.
            doctorFeedback: "",
          };

          const pRef = doc(db, "patients", patient.patientId);
          await updateDoc(pRef, {
            reports: arrayUnion(newReport)
          });
          console.log("Report saved to patient profile.");
        } catch (saveErr) {
          console.error("Failed to save report to patient doc:", saveErr);
          // Don't block the UI flow, just log it
        }
      }
      // ---------------------------------------------------------

      // ---- SEND NOTIFICATION TO ASSIGNED DOCTOR ----

      // Notify assigned doctor (only if patient has one)
      const pSnap = await getDoc(doc(db, "patients", patient.patientId));
      if (pSnap.exists()) {
        const d = pSnap.data();
        const docId = d.doctorEmployeeId || null;   // doctor assigned to patient

        if (docId) {
          await addDoc(collection(db, "notifications"), {
            doctorId: docId,                          // 🔥 doctor-specific notification
            targetUserId: null,                       // not for patient
            patientName: patient.name,
            message: `${patient.name} uploaded a new retinal image.`,
            meta: {
              type: "image_upload",
              patientId: patient.patientId,
            },
            read: false,
            createdAt: serverTimestamp(),
          });

          console.log("Doctor notified about new retinal image.");
        }
      }

      setShowSuccessModal(true);
      setLatestReportUrl(url);
      setImageFile(null);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  };



  // ------------------------------------------
  // BOOK APPOINTMENT (WITH DATE + TIME) + sync doctorEmployeeId into appointments and patient doc
  // ------------------------------------------
  const bookAppointment = async () => {
    if (!appointmentDate || !appointmentTime) {
      alert("Please choose date AND time for your appointment.");
      return;
    }

    const combinedDateTime = new Date(`${appointmentDate}T${appointmentTime}`).getTime();

    try {
      setBookingLoading(true);

      const foundDoctor = await findDoctorByName(doctor);

      const appointmentPayload = {
        patientId: patient.patientId,
        patientName: patient.name || "",
        hospital,
        doctor,
        bookedAt: combinedDateTime,
        status: "upcoming",
        createdAt: Date.now(),
      };

      if (foundDoctor) {
        appointmentPayload.doctorEmployeeId = foundDoctor.id;
        appointmentPayload.doctorOfficialName = foundDoctor.data.name;
      } else {
        console.warn("Resilience Mode: Specialist record not found in database. Using name-only booking.");
        appointmentPayload.doctorEmployeeId = null;
        appointmentPayload.doctorOfficialName = doctor;
      }
      const doctorEmployeeId = foundDoctor ? foundDoctor.id : null;
      await addDoc(collection(db, "appointments"), appointmentPayload);
      // Notify the doctor → doctor-specific
      await pushNotification({
        doctorId: doctorEmployeeId,
        targetUserId: null,
        message: `${patient.name || "A patient"} booked an appointment for ${appointmentDate} ${appointmentTime}`,
        meta: { type: "appointment_booked", patientId: patient.patientId },
      });


      try {
        const pRef = doc(db, "patients", patient.patientId);
        const updatePayload = {};
        if (foundDoctor) {
          updatePayload.doctorEmployeeId = foundDoctor.id;
          updatePayload.doctorName = foundDoctor.data.name;
        } else {
          updatePayload.doctorName = doctor;
        }
        updatePayload.updatedAt = Date.now();
        await updateDoc(pRef, updatePayload);
      } catch (err) {
        console.warn("could not update patient doc with doctor info:", err);
      }

      alert("Appointment booked successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to book appointment.");
    } finally {
      setBookingLoading(false);
    }
  };


  // ------------------------------------------
  // LOAD USER APPOINTMENTS (REALTIME LISTENER)
  // ------------------------------------------
  useEffect(() => {
    if (!patient?.patientId) return;

    const q = query(
      collection(db, "appointments"),
      where("patientId", "==", patient.patientId),

    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAppointments(arr);
    });

    return () => unsub();
  }, [patient?.patientId]);

  useEffect(() => {
    if (!patient?.patientId) return;

    const q = query(
      collection(db, "notifications"),
      where("targetUserId", "==", patient.patientId),  // 🔥 only their notifications
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      console.log("NOTIFICATION SNAP:", snap.docs.map(d => d.data()));
      setNotifications(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });

    return () => unsub();
  }, [patient?.patientId]);

  // Handle auto-clear on open
  useEffect(() => {
    if (openDropdown && notifications.some(n => n.read === false)) {
      markAllAsRead();
    }
  }, [openDropdown, notifications]);


  // ------------------------------------------
  // ACCEPT APPOINTMENT (adds status 'accepted' and notification)
  // ------------------------------------------
  const acceptAppointment = async (appt) => {
    if (!appt) return;
    const ok = window.confirm("Accept this appointment?");
    if (!ok) return;

    try {
      await updateDoc(doc(db, "appointments", appt.id), {
        status: "accepted",
        updatedAt: Date.now(),
      });

      // send notification to patient
      await pushNotification({
        targetUserId: appt.patientId || null,
        doctorId: appt.doctorEmployeeId || null,
        message: `Appointment accepted for patient: ${appt.patientName}.`,
        meta: { appointmentId: appt.id, type: "appointment_accepted" },
      });

      // keep UI in sync; onSnapshot will update appointments automatically
      alert("Appointment accepted.");
    } catch (err) {
      console.error("acceptAppointment error:", err);
      alert("Failed to accept appointment.");
    }
  };

  // ------------------------------------------
  // find next upcoming appointment and load its doctor data
  // ------------------------------------------
  useEffect(() => {
    const now = Date.now();
    const upcoming = appointments
      .filter((a) => a.status !== "cancelled" && a.bookedAt >= now)
      .sort((a, b) => a.bookedAt - b.bookedAt)[0];

    const loadDoctorForUpcoming = async () => {
      if (!upcoming) {
        setNextDoctorInfo(null);
        return;
      }

      if (upcoming.doctorEmployeeId) {
        try {
          const docRef = doc(db, "doctors", upcoming.doctorEmployeeId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const docData = snap.data();
            setNextDoctorInfo({
              name: docData.name || upcoming.doctor || "Doctor",
              email: docData.email || "",
              phone: docData['phone no'] || "",
              dept: docData.department || docData.dept || "",
              age: docData.age || null,
              photoURL: docData.photoURL || FALLBACK_DOCTOR_IMAGE,
              nextApptAt: upcoming.bookedAt,
            });
            return;
          }
        } catch (err) {
          console.error("error loading doctor doc:", err);
        }
      }

      const found = await findDoctorByName(upcoming.doctor);
      if (found) {
        setNextDoctorInfo({
          name: found.data.name || upcoming.doctor || "Doctor",
          email: found.data.email || "",
          phone: found.data['phone no'] || "",
          dept: found.data.department || found.data.dept || "",
          age: found.data.age || null,
          photoURL: found.data.photoURL || FALLBACK_DOCTOR_IMAGE,
          nextApptAt: upcoming.bookedAt,
        });
      } else {
        setNextDoctorInfo({
          name: upcoming.doctor || "Doctor",
          email: "",
          dept: "",
          age: null,
          photoURL: FALLBACK_DOCTOR_IMAGE,
          nextApptAt: upcoming.scheduledAt || upcoming.bookedAt,

        });
      }
    };

    loadDoctorForUpcoming();
  }, [appointments]);

  // ------------------------------------------
  // CANCEL / RESCHEDULE / DELETE
  // ------------------------------------------
  const cancelAppointment = async (appt) => {
    if (!appt) return;

    const ok = window.confirm("Cancel this appointment?");
    if (!ok) return;

    try {
      await updateDoc(doc(db, "appointments", appt.id), {
        status: "cancelled",
        updatedAt: Date.now(),
      });

      // -----------------------------
      // 🔔 Send Notification to Doctor
      // -----------------------------
      await pushNotification({
        doctorId: appt.doctorEmployeeId || null,  // doctor receives it
        targetUserId: null,                     // not for patient
        patientName: patient.name,
        message: `Patient ${patient.name} cancelled their appointment.`,
        meta: {
          type: "appointment_cancelled",
          appointmentId: appt.id,
          patientId: patient.patientId,
        },
      });

      alert("Appointment cancelled.");
    } catch (err) {
      console.error("cancelAppointment error:", err);
      alert("Failed to cancel appointment.");
    }
  };


  const openReschedule = (appt) => {
    setRescheduleModal({ open: true, appt });

    if (appt?.scheduledAt || appt?.bookedAt) {
      const ts = Number(appt.scheduledAt || appt.bookedAt);
      const iso = new Date(ts).toISOString().slice(0, 16); // <-- CORRECT FORMAT
      setRescheduleDate(iso);
    } else {
      setRescheduleDate("");
    }
  };


  const submitReschedule = async () => {
    const { appt } = rescheduleModal;
    if (!appt) return;

    try {
      const ts = new Date(rescheduleDate).getTime();

      // Update appointment for patient side
      await updateDoc(doc(db, "appointments", appt.id), {
        bookedAt: ts,
        scheduledAt: ts,
        status: "rescheduled",
        updatedAt: serverTimestamp(),
      });

      // Notify the DOCTOR (NOT the patient)
      await pushNotification({
        doctorId: appt.doctorEmployeeId,
        targetUserId: null,
        message: `${patient.name} rescheduled their appointment.`,
        meta: {
          appointmentId: appt.id,
          type: "appointment_rescheduled",
          scheduledAt: ts
        }
      });

      alert("Appointment rescheduled.");

      setRescheduleModal({ open: false, appt: null });
      setRescheduleDate("");

    } catch (err) {
      console.error(err);
      alert("Failed to reschedule appointment.");
    }
  };

  const deleteAppointment = async (appt) => {
    const ok = window.confirm("Permanently delete appointment?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "appointments", appt.id));
    } catch (err) {
      console.error(err);
    }
  };
  // ------------------------------------------
  // NOTIFICATION UTILS
  // ------------------------------------------
  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (err) {
      console.warn("markAsRead failed:", id, err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      const promises = unread.map((n) =>
        updateDoc(doc(db, "notifications", n.id), { read: true })
      );
      await Promise.all(promises);
    } catch (err) {
      console.warn("markAllAsRead failed:", err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (err) {
      console.warn("deleteNotification failed:", id, err);
    }
  };

  // ------------------------------------------
  // FILTER APPOINTMENTS - now respects viewMode
  // ------------------------------------------
  const filteredAppointments = appointments.filter((a) => {
    const apptDate = a.scheduledAt || a.bookedAt || a.createdAt;
    if (!apptDate) return false;

    const d = apptDate.seconds ? new Date(apptDate.seconds * 1000) : (typeof apptDate === 'number' ? new Date(apptDate) : new Date(apptDate));
    const todayAnchor = new Date();
    todayAnchor.setHours(0, 0, 0, 0);

    // 1. HUD ViewMode overrides (Status based)
    if (viewMode === "accepted") return a.status === "accepted";
    if (viewMode === "rejected") return a.status === "cancelled" || a.status === "rejected";

    // 2. Default Temporal Context (Time based)
    if (apptFilter === "upcoming") return d >= todayAnchor && a.status !== "cancelled";
    if (apptFilter === "past") return d < todayAnchor;

    return true;
  }).sort((a, b) => {
    const tA = a.scheduledAt || a.bookedAt || a.createdAt;
    const tB = b.scheduledAt || b.bookedAt || b.createdAt;
    const valA = tA?.seconds ? tA.seconds * 1000 : (typeof tA === 'number' ? tA : new Date(tA).getTime());
    const valB = tB?.seconds ? tB.seconds * 1000 : (typeof tB === 'number' ? tB : new Date(tB).getTime());
    return valB - valA; // Latest to Old (Reverse Chronological)
  });

  // ------------------------------------------
  // FullCalendar events mapping (memoized)
  // ------------------------------------------
  const calendarEvents = useMemo(() => {
    return appointments
      .filter((a) => a.bookedAt || a.scheduledAt) // skip missing dates
      .map((a) => {
        const ts = Number(a.scheduledAt || a.bookedAt); // 🔥 FIX: convert to number

        return {
          id: a.id,
          title: `${a.doctor || "Doctor"} — ${a.hospital}`,
          start: new Date(ts).toISOString(),    // 🔥 FIX: FullCalendar-compatible
          allDay: false,
          extendedProps: {
            status: a.status,
            doctor: a.doctor,
            hospital: a.hospital,
          },
          backgroundColor:
            a.status === "cancelled"
              ? "#ff6b6b"
              : a.status === "accepted"
                ? "#34d399"
                : "#60a5fa",
          borderColor:
            a.status === "cancelled"
              ? "#ff6b6b"
              : a.status === "accepted"
                ? "#059669"
                : "#3b82f6",
        };
      });
  }, [appointments]);

  // calendar click handler
  const handleEventClick = (clickInfo) => {
    const id = clickInfo.event.id;
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return;
    openReschedule(appt);
  };

  const handleEventMouseEnter = (mouseEnterInfo) => {
    const appt = appointments.find((a) => a.id === mouseEnterInfo.event.id);
    if (appt) {
      setHoveredEvent(appt);
      setTooltipPos({ x: mouseEnterInfo.jsEvent.clientX, y: mouseEnterInfo.jsEvent.clientY });
    }
  };

  const handleEventMouseLeave = () => {
    setHoveredEvent(null);
  };

  // helper to format appointment label with small tag
  const statusBadge = (status) => {
    if (!status) return null;
    let classes = "px-2 py-0.5 rounded text-xs ";
    if (status === "cancelled" || status === "rejected") classes += "bg-red-600";
    else if (status === "accepted") classes += "bg-emerald-600";
    else classes += "bg-green-600";
    return <span className={classes}>{status}</span>;
  };

  // ------------------------------------------
  // RENDER UI
  // ------------------------------------------
  return (
    <div className="w-full min-h-screen bg-[#0D1726] text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-4 bg-black/20 border-b border-white/10">
        <h1 className="text-xl font-bold text-blue-400">VisionCare AI</h1>

        <div className="flex items-center gap-4">

          {/* NOTIFICATION BUTTON + DROPDOWN */}
          <div className="relative">
            <button
              className="p-2 bg-white/10 rounded-lg relative transition-all active:scale-90"
              title="notifications"
              onClick={() => setOpenDropdown((prev) => !prev)}
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>

              {/* RED DOT FOR UNREAD - Strict Logic */}
              {notifications.some((n) => n.read === false) && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full border-2 border-[#0D1726] animate-pulse"></span>
              )}
            </button>

            {/* DROPDOWN - PREMIUM Upgrade */}
            {openDropdown && (
              <div className="absolute right-0 mt-4 w-96 bg-[#0f172a]/95 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 overflow-hidden animate-in fade-in zoom-in slide-in-from-top-4 duration-300">
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                  <h3 className="text-white text-base font-black tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-500">notifications_active</span>
                    Alert Center
                  </h3>
                  <button
                    onClick={markAllAsRead}
                    className="text-[10px] uppercase font-black tracking-widest text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    Mark all read
                  </button>
                </div>

                {/* List */}
                <div className="max-h-[450px] overflow-y-auto px-2 py-2">
                  {notifications.length === 0 ? (
                    <div className="py-20 text-center">
                      <span className="material-symbols-outlined text-gray-600 text-5xl mb-4">notifications_off</span>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">All caught up! No alerts found.</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const type = n.meta?.type || n.type || "update";
                      let icon = "notifications";
                      let iconColor = "text-blue-500";
                      let bgColor = "bg-blue-500/10";

                      if (type === "doctor-notes" || type === "doctor_notes") {
                        icon = "clinical_notes";
                        iconColor = "text-emerald-500";
                        bgColor = "bg-emerald-500/10";
                      } else if (type.includes("appointment")) {
                        icon = "event";
                        iconColor = "text-amber-500";
                        bgColor = "bg-amber-500/10";
                      } else if (type === "new-image-request") {
                        icon = "add_a_photo";
                        iconColor = "text-rose-500";
                        bgColor = "bg-rose-500/10";
                      }

                      return (
                        <div
                          key={n.id}
                          onClick={() => markAsRead(n.id)}
                          className={`group p-4 mb-1 rounded-[24px] hover:bg-white/5 transition-all duration-300 flex gap-4 cursor-pointer relative ${!n.read ? 'bg-white/[0.02]' : ''}`}
                        >
                          <div className={`size-10 rounded-2xl flex items-center justify-center shrink-0 ${bgColor} ${iconColor} group-hover:scale-110 transition-transform duration-500`}>
                            <span className="material-symbols-outlined text-xl">{icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs font-black text-white leading-none uppercase tracking-wider">
                                {type === "doctor-notes" || type === "doctor_notes"
                                  ? "Medical Update"
                                  : type === "appointment_accepted"
                                    ? "Consultation Confirmed"
                                    : type === "new-image-request"
                                      ? "Action Required"
                                      : "System alert"}
                              </p>
                              {!n.read && <span className="size-2 mt-1 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>}
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-medium">
                              {n.message}
                            </p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">schedule</span>
                              {n.createdAt?.toDate?.().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }) ??
                                new Date(n.createdAt).toLocaleString()}
                            </p>
                          </div>

                          {/* DELETE BUTTON */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(n.id);
                            }}
                            className="absolute top-4 right-4 p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-all duration-300"
                            title="Delete alert"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>


          {/* settings */}
          <button
            className="p-2 bg-white/10 rounded-lg"
            title="settings"
            onClick={() => { }}
          >
            <span className="material-symbols-outlined">settings</span>
          </button>

          <button
            onClick={() => navigate("/")}
            className="p-2 bg-red-600/20 border border-red-500 text-red-400 rounded-lg flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-[1280px] mx-auto px-6 py-10 flex flex-col gap-10">
        {/* GREETING */}
        <div>
          <h1 className="text-3xl font-black">Welcome, {patient.name || "Patient"}!</h1>
          <p className="text-gray-400 mt-1">
            Patient ID: {patient.patientId} &nbsp; | &nbsp; DOB: {patient.dob}
          </p>
        </div>

        {/* ===================== CONSULTATION & UPLOAD ===================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className={`p-8 rounded-[32px] border transition-all duration-500 shadow-2xl relative overflow-hidden ${isDarkMode ? 'bg-[#0f2430]/60 border-white/10 backdrop-blur-xl' : 'bg-white border-gray-100'}`}>
            {/* Background Decorative Element */}
            <div className="absolute -top-24 -right-24 size-48 bg-blue-600/10 rounded-full blur-3xl"></div>

            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Schedule a Consultation</h2>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Select your preferred doctor & hospital</p>
              </div>
              <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                High Availability
              </div>
            </div>

            <div className="space-y-6">
              {/* Hospital Custom Dropdown */}
              <PremiumDropdown
                value={hospital}
                onChange={setHospital}
                icon="account_balance"
                isDarkMode={isDarkMode}
                className="h-14"
                options={[
                  { label: "City General Hospital", value: "City General Hospital" },
                  { label: "VisionCare Eye Center", value: "VisionCare Eye Center" },
                  { label: "Central Medical Plaza", value: "Central Medical Plaza" }
                ]}
              />

              {/* Doctor Custom Dropdown */}
              <PremiumDropdown
                value={doctor}
                onChange={setDoctor}
                icon="medical_services"
                isDarkMode={isDarkMode}
                className="h-14"
                options={[
                  { label: "Dr. Evelyn Reed", value: "Dr. Evelyn Reed" },
                  { label: "Dr. Samuel Chen", value: "Dr. Samuel Chen" },
                  { label: "Dr. Maria Garcia", value: "Dr. Maria Garcia" }
                ]}
              />

              {/* Date & Time Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1 mb-2 block">Consultation Date</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors">
                      <span className="material-symbols-outlined text-xl">calendar_today</span>
                    </div>
                    <input
                      type="date"
                      value={appointmentDate}
                      onChange={(e) => setAppointmentDate(e.target.value)}
                      className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 text-sm font-bold text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="relative group">
                  <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-1 mb-2 block">Preferred Time</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors">
                      <span className="material-symbols-outlined text-xl">schedule</span>
                    </div>
                    <input
                      type="time"
                      value={appointmentTime}
                      onChange={(e) => setAppointmentTime(e.target.value)}
                      className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 text-sm font-bold text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={bookAppointment}
                disabled={bookingLoading}
                className={`w-full h-16 rounded-[20px] font-black uppercase tracking-widest text-xs relative overflow-hidden group/btn shadow-2xl transition-all active:scale-95 disabled:opacity-30 ${isDarkMode ? 'bg-blue-600 text-white shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-1' : 'bg-blue-600'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-white/20 to-blue-400/0 -translate-x-full group-hover/btn:animate-shimmer transition-transform"></div>
                <span className="flex items-center justify-center gap-2">
                  {bookingLoading ? (
                    <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-xl">verified_user</span>
                      {bookingLoading ? "Confirming..." : "Confirm Consultation"}
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>

          <div className={`p-8 rounded-[32px] border transition-all duration-500 shadow-2xl ${isDarkMode ? 'bg-[#0f172a]/60 border-white/10 backdrop-blur-xl shadow-black/40' : 'bg-white border-gray-100 shadow-gray-200/50'}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-500 text-3xl">biotech</span>
                  Retinal Health Analysis
                </h2>
                <p className="text-gray-400 text-sm font-medium mt-1">Upload a high-resolution retinal scan for instant AI processing.</p>
              </div>

              <button
                disabled={!latestReportUrl}
                onClick={() =>
                  navigate("/prediction-results", {
                    state: {
                      patientId: patient.patientId,
                      patientName: patient.name,
                      imageUrl: latestReportUrl,
                    }
                  })
                }
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-xs font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30 ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
              >
                <span className="material-symbols-outlined text-base">assessment</span>
                View Latest Report
              </button>
            </div>

            <div className={`relative group rounded-[28px] border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-12 ${imageFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 hover:border-blue-500/30 bg-white/5'}`}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0])}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />

              <div className={`w-20 h-20 rounded-[24px] flex items-center justify-center mb-6 transition-all duration-500 group-hover:scale-110 ${imageFile ? 'bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.4)]' : 'bg-blue-600 text-white shadow-[0_0_30px_rgba(37,99,235,0.3)]'}`}>
                <span className="material-symbols-outlined text-4xl">{imageFile ? 'check_circle' : 'add_a_photo'}</span>
              </div>

              <div className="text-center">
                <p className="text-lg font-black tracking-tight">{imageFile ? imageFile.name : 'Choose Retinal Image'}</p>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                  {imageFile ? `${(imageFile.size / 1024 / 1024).toFixed(2)} MB • Ready to process` : 'Drop scan here or browse files'}
                </p>
              </div>

              {imageFile && (
                <div className="flex items-center gap-6 mt-6 relative z-20">
                  <button
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      const fileInput = e.currentTarget.closest('.relative').querySelector('input[type="file"]');
                      if (fileInput) fileInput.click();
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
                  >
                    Replace Scan
                  </button>
                  <div className="w-px h-3 bg-white/10"></div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setImageFile(null); }}
                    className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
                  >
                    Delete Scan
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleUploadImage}
              disabled={uploading || !imageFile}
              className={`w-full h-14 mt-8 rounded-[20px] font-black uppercase tracking-widest text-sm shadow-2xl transition-all active:scale-95 disabled:opacity-30 disabled:hover:scale-100 flex items-center justify-center gap-3 ${imageFile
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-1'
                : 'bg-white/10 text-gray-500 cursor-not-allowed shadow-none'
                }`}
            >
              {uploading ? (
                <>
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Analyzing Scan...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl">cloud_upload</span>
                  Start AI Prediction
                </>
              )}
            </button>
          </div>
        </div>

        {/* ===================== CLINICAL TIMELINE & SPECIALIST HUB ===================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* PREMIUM CALENDAR */}
          <div className={`group p-8 rounded-[32px] border transition-all duration-500 shadow-2xl ${isDarkMode ? 'bg-[#0f172a]/60 border-white/10 backdrop-blur-xl shadow-black/40' : 'bg-white border-gray-100 shadow-gray-200/50'}`}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-3xl">calendar_month</span>
                  Clinical Timeline
                </h2>
                <p className="text-gray-400 text-sm font-medium mt-1">Manage your upcoming diagnostic consultations.</p>
              </div>
              <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                {appointments.length} Appointments
              </div>
            </div>

            <div className={`p-4 rounded-[24px] border border-white/5 transition-all duration-500 hover:border-white/20 shadow-inner ${isDarkMode ? 'bg-black/20' : 'bg-gray-50'}`}>
              <style>{`
                .fc { --fc-border-color: rgba(255,255,255,0.05); font-family: inherit; }
                .fc .fc-button-primary { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.3s ease; }
                .fc .fc-button-primary:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
                .fc .fc-toolbar-title { font-size: 14px; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; color: #60a5fa; }
                .fc-theme-standard td, .fc-theme-standard th { border: 1px solid rgba(255,255,255,0.03) !important; }
                .fc .fc-scrollgrid { border-radius: 16px; overflow: hidden; border: none !important; }
                .fc-daygrid-day-number { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); padding: 8px !important; }
                .fc-day-today { background: rgba(59,130,246,0.05) !important; }
                .fc-event { border-radius: 6px; padding: 2px 6px; font-size: 9px; font-weight: 800; border: none !important; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
              `}</style>
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek",
                }}
                height={320}
                events={calendarEvents}
                eventClick={handleEventClick}
                eventMouseEnter={handleEventMouseEnter}
                eventMouseLeave={handleEventMouseLeave}
                nowIndicator={true}
                dayMaxEventRows={2}
              />
            </div>
          </div>

          <div className={`p-8 rounded-[32px] border transition-all duration-500 shadow-2xl flex flex-col justify-between group ${isDarkMode ? 'bg-[#0f2430]/60 border-white/10 backdrop-blur-xl shadow-black/40' : 'bg-white border-gray-100 shadow-gray-200/50'}`}>
            <div>
              <div className="flex gap-6 items-center">
                <div className="relative">
                  <img
                    src={nextDoctorInfo?.photoURL || FALLBACK_DOCTOR_IMAGE}
                    alt="doctor"
                    className="h-20 w-20 rounded-full object-cover border-2 border-gray-600 transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute -bottom-1 -right-1 size-6 bg-blue-500 text-white rounded-full flex items-center justify-center border-2 border-[#0f2430] scale-90">
                    <span className="material-symbols-outlined text-[14px] font-black">verified</span>
                  </div>
                </div>

                <div>
                  <div className="text-2xl font-black text-white tracking-tight leading-tight">
                    {nextDoctorInfo?.name || "Assigned Specialist"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-blue-400 text-[9px] font-black uppercase tracking-widest bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[12px]">medical_services</span>
                      {nextDoctorInfo?.dept || "Lead Physician"}
                    </span>
                    {nextDoctorInfo?.age && (
                      <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[12px]">person</span>
                        {nextDoctorInfo.age} Years
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="my-8 border-t border-white/5"></div>

              <div className="grid grid-cols-1 gap-4">
                {/* Email Field */}
                <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-inner">
                    <span className="material-symbols-outlined text-xl">alternate_email</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Digital Channel</p>
                    <p className="text-sm font-black text-gray-300 truncate">{nextDoctorInfo?.email || "clinical.support@visioncare.com"}</p>
                  </div>
                </div>

                {/* Phone Field */}
                <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-inner">
                    <span className="material-symbols-outlined text-xl">call</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Direct Line</p>
                    <p className="text-sm font-black text-gray-300 truncate">{nextDoctorInfo?.phone || "+1 (415) 555-0199"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={`mt-8 p-5 rounded-[24px] flex items-center justify-between border transition-all duration-500 ${isDarkMode ? 'bg-black/20 border-white/5 group-hover:border-blue-500/30' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                  <span className="material-symbols-outlined text-xl">clinical_notes</span>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Next Consultation</p>
                  <p className="text-xs font-black text-blue-400 mt-0.5">
                    {nextDoctorInfo?.nextApptAt ? new Date(nextDoctorInfo.nextApptAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Standby Status"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="h-10 px-4 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl flex items-center justify-center transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  <span className="text-[10px] text-white font-mono tracking-widest group-hover:scale-105 transition-transform font-black">
                    #{patient.patientId?.slice(0, 8).toUpperCase() || "PX-990-CL"}
                  </span>
                </div>
                <p className="text-[8px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1.5 mr-1">Clinical Reference</p>
              </div>
            </div>
          </div>
        </div>

        {/* ===================== PREMIUM CLINICAL NOTES HUB ===================== */}
        <div className={`p-8 rounded-[32px] border transition-all duration-500 shadow-2xl relative overflow-hidden ${isDarkMode ? 'bg-[#0f2430]/60 border-white/10 backdrop-blur-xl' : 'bg-white border-gray-100'}`}>
          {/* Accent Blue Blur */}
          <div className="absolute -bottom-24 -left-24 size-48 bg-emerald-500/10 rounded-full blur-3xl"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-500 text-3xl">clinical_notes</span>
                Primary Specialist Feedback
              </h2>
              <p className="text-gray-400 text-sm font-medium mt-1">Latest clinical impressions and diagnostic follow-ups.</p>
            </div>
            {(doctorNotesUpdatedAt && doctorNotesUpdatedAt > 0) && (
              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 shadow-inner">
                <span className="material-symbols-outlined text-blue-400 text-lg">history</span>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  Updated {new Date(doctorNotesUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {doctorNotes ? (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
              {/* Specialist ID Column */}
              <div className={`p-6 rounded-[28px] border flex flex-col items-center text-center ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-gray-50'}`}>
                <div className="relative mb-4">
                  <div className="absolute -inset-1.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full blur-sm opacity-20"></div>
                  <img src={FALLBACK_DOCTOR_IMAGE} className="size-20 rounded-full object-cover border-2 border-white/10 relative z-10" alt="specialist" />
                </div>
                <h3 className="text-lg font-black tracking-tight">{doctorName || "Lead Consultant"}</h3>
                <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mt-1">Verified Ophthalmologist</p>

                <div className="mt-8 pt-8 border-t border-white/5 w-full flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 opacity-40">
                    <span className="material-symbols-outlined text-blue-500 text-xl">verified_user</span>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-[0.25em]">Digitally Verified</p>
                  </div>
                  <p className="text-[10px] text-gray-600 font-mono tracking-tighter opacity-30 mt-1 uppercase">Ref-Hash: {patient.patientId?.slice(0, 12) || "SIG-990-XC"}</p>
                </div>
              </div>

              {/* Note Content Column */}
              <div className="flex flex-col">
                <div className={`flex-1 p-8 rounded-[28px] border relative ${isDarkMode ? 'bg-white/5 border-white/5 shadow-inner' : 'bg-gray-50 border-gray-200'}`}>
                  <span className="material-symbols-outlined absolute top-6 right-6 text-gray-700 text-4xl select-none opacity-50">format_quote</span>

                  <div className="relative z-10">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="size-1.5 bg-blue-500 rounded-full"></span>
                      Latest Impression
                    </p>
                    <p className="text-md leading-relaxed text-gray-300 font-medium whitespace-pre-wrap italic">
                      "{doctorNotes}"
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3 px-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Clinical Authority Verified</p>
                  <span className="material-symbols-outlined text-emerald-500 text-lg">verified</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`p-16 rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
              <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center text-gray-600 mb-4">
                <span className="material-symbols-outlined text-3xl">hourglass_empty</span>
              </div>
              <p className="text-gray-500 text-sm font-black uppercase tracking-widest">Pending Specialist Revision</p>
              <p className="text-gray-600 text-xs font-medium mt-1">Your consultant has not drafted an impression yet.</p>
            </div>
          )}
        </div>

        {/* ===================== PREMIUM CLINICAL APPOINTMENT HUB ===================== */}
        <section className={`p-8 rounded-[32px] border transition-all duration-500 shadow-2xl relative overflow-hidden ${isDarkMode ? 'bg-[#0f2430]/60 border-white/10 backdrop-blur-xl' : 'bg-white border-gray-100'}`}>
          {/* Header & Filter HUD */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
            <div>
              <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-blue-500 text-3xl">event_upcoming</span>
                Scheduled Clinical Consultations
              </h2>
              <p className="text-gray-400 text-sm font-medium mt-1">Manage and track your upcoming specialist engagements.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* History Filter Custom Dropdown */}
              <PremiumDropdown
                value={apptFilter}
                onChange={(val) => { setApptFilter(val); setViewMode("default"); }}
                isDarkMode={isDarkMode}
                className="h-11 min-w-[150px]"
                options={[
                  { label: "Upcoming", value: "upcoming", icon: "event_upcoming" },
                  { label: "Past", value: "past", icon: "history" },
                  { label: "History", value: "all", icon: "account_tree" }
                ]}
              />

              {/* View State Chips */}
              <div className="flex items-center gap-2 p-1.5 bg-black/20 border border-white/5 rounded-[20px]">
                <button
                  onClick={() => setViewMode("accepted")}
                  className={`h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "accepted" ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'text-gray-500 hover:text-white'}`}
                >
                  Accepted
                </button>
                <button
                  onClick={() => setViewMode("rejected")}
                  className={`h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "rejected" ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'text-gray-500 hover:text-white'}`}
                >
                  Rescinded
                </button>
                <div className="w-px h-4 bg-white/10 mx-1"></div>
                <button
                  onClick={() => { setViewMode("default"); }}
                  className={`h-8 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "default" ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {filteredAppointments.length === 0 ? (
              <div className={`p-16 rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center text-gray-600 mb-4">
                  <span className="material-symbols-outlined text-3xl">calendar_today</span>
                </div>
                <p className="text-gray-500 text-sm font-black uppercase tracking-widest">No Consultations Found</p>
                <p className="text-gray-600 text-xs font-medium mt-1">Adjust your filters or book a new session above.</p>
              </div>
            ) : (
              filteredAppointments.map((a) => (
                <div key={a.id} className={`group p-6 rounded-[28px] border transition-all duration-500 flex flex-col md:flex-row md:items-center justify-between gap-6 ${isDarkMode ? 'bg-black/20 border-white/5 hover:border-blue-500/30 hover:bg-black/30' : 'bg-gray-50 border-gray-100 hover:bg-white'}`}>
                  <div className="flex items-start gap-5">
                    <div className="size-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                      <span className="material-symbols-outlined text-2xl">medical_services</span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-black tracking-tight">{a.hospital} — {a.doctor}</h3>
                        <div className="flex items-center">
                          {statusBadge(a.status)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-6 mt-3">
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="material-symbols-outlined text-base">schedule</span>
                          <span className="text-xs font-bold uppercase tracking-widest">
                            {new Date(a.scheduledAt || a.bookedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-500/80">
                          <span className="material-symbols-outlined text-base">verified</span>
                          <span className="text-[10px] font-black uppercase tracking-widest">Authorized Specialist</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {a.status !== "cancelled" && a.status !== "accepted" && (
                      <>
                        <button
                          onClick={() => openReschedule(a)}
                          className="h-10 px-5 bg-amber-500 text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all active:scale-95 flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-base font-black">event_repeat</span>
                          Reschedule
                        </button>

                        <button
                          onClick={() => cancelAppointment(a)}
                          className="h-10 px-5 bg-rose-600/10 hover:bg-rose-600 border border-rose-600/30 text-rose-500 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-base font-black">close</span>
                          Cancel
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => deleteAppointment(a)}
                      className="h-10 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all active:scale-95"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* LEARN MORE CARDS - unchanged */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Learn More About Eye Health</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-[#192633] rounded-xl overflow-hidden shadow-lg">
              <div
                className="aspect-video bg-cover bg-center"
                style={{
                  backgroundImage:
                    'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCnblqyGnwRktpW7wemJAShcx-SmJ6-XI17Lw4iW6xmkeg8XU8VKzgQBx1KZgrlP34DmVEe2zqDAh5_9Bp4trNleuxc_tE6gIBvsUmeQcJph0iaLQUk85q7B9P7MZyE-bxjsd--QmP9DDxV9QSZ0e4vBt7yn_3iZa3NpPvx8UlyJed-e4GF_p0YE9ejf2Zel9xJO6So4HEXjXnHxQK3umKJl6LVFwa7oamSYR3xMc1s5TNRZMF-3DBGC6OIMnOQbiLbv5njPIOCRSU")',
                }}
              ></div>

              <div className="p-5">
                <h3 className="text-lg font-bold">Understanding Glaucoma</h3>
                <p className="text-gray-400 text-sm">Learn about the causes, symptoms, and treatments for Glaucoma.</p>
              </div>
            </div>

            <div className="bg-[#192633] rounded-xl overflow-hidden shadow-lg">
              <div
                className="aspect-video bg-cover bg-center"
                style={{
                  backgroundImage:
                    'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDtjljKIsR3qgpjXf08zEDSUf1S8qYoEMyz8n9niBAVZm--Eb-_YSbR32MkkhnoEs8ttn7jUUvYtZCoGGaBciYyeLelJVojnz8ezq9PMAVwEoTehTKUXhWnleiAXDUcqdeScism781t85yhW_I9r28ayuszdrg13saf37tniKdnk1Xkf5ff11OWqmYxXsH6KNmWOD-muO64jIMk0UJb_aBJb8qouGQI8VrK4hgrQyHoyJ0gy9eIHxGXNfP0OccCFA0NKqhADmbJIC0")',
                }}
              ></div>

              <div className="p-5">
                <h3 className="text-lg font-bold">Tips for Healthy Vision</h3>
                <p className="text-gray-400 text-sm">Daily habits to protect your eyesight.</p>
              </div>
            </div>

            <div className="bg-[#192633] rounded-xl overflow-hidden shadow-lg">
              <div
                className="aspect-video bg-cover bg-center"
                style={{
                  backgroundImage:
                    'url("https://lh3.googleusercontent.com/aida-public/AB6AXuA6csOfifvXnu_ufXu46xrOedMfv3jMZlw7X0gMJh6nk8ZypPAOyeCx7C-Od0Tn09DNqkSyx_IzlC8ms4-Dsp07l0ZTsWvcEA42Vw2wPbMWAeqemzky3McPb-zVOj5yqy5owUyQqmKcbnLjjrDu_y5xO-WQDFMe9jLi-wAcY5r67MskVtPKKyQ5T_EwGXBcy5qC-4j0whGTFuPytXs56P2-gdscNTYQLtq5BHOuDFffEOrUMBz25VKvdl5-QlCVwh9Y6g4c0o2Q0x0")',
                }}
              ></div>

              <div className="p-5">
                <h3 className="text-lg font-bold">How Our AI Analysis Works</h3>
                <p className="text-gray-400 text-sm">A look at how VisionCare AI detects early diseases.</p>
              </div>
            </div>
          </div>
        </div>

        {/* RESCHEDULE MODAL */}
        {rescheduleModal.open && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60"
            onClick={() => setRescheduleModal({ open: false, appt: null })}
          >
            <div className="bg-white text-black p-6 rounded-lg w-[90%] max-w-md" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-2">Reschedule Appointment</h3>

              <input
                type="datetime-local"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full mb-4 p-2 bg-gray-100 border rounded"
              />

              <div className="flex justify-end gap-2">
                <button className="px-4 py-2 bg-gray-300 rounded" onClick={() => setRescheduleModal({ open: false, appt: null })}>
                  Cancel
                </button>

                <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={submitReschedule}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
        {/* PREMIUM CLINICAL TOOLTIP */}
        {hoveredEvent && (
          <div
            className="fixed z-[9999] pointer-events-none p-4 rounded-2xl bg-[#0f172a]/95 border border-white/20 backdrop-blur-xl shadow-2xl transition-opacity animate-in fade-in zoom-in duration-300"
            style={{
              left: `${tooltipPos.x + 15}px`,
              top: `${tooltipPos.y + 15}px`,
              maxWidth: '280px'
            }}
          >
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
              <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined text-xl">medical_services</span>
              </div>
              <div>
                <div className="text-[10px] font-black tracking-widest text-blue-400 uppercase">Consultation Hub</div>
                <div className="text-sm font-black text-white truncate max-w-[160px]">{hoveredEvent.doctor}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-300">
                <span className="material-symbols-outlined text-base text-gray-500">location_on</span>
                <span className="text-[11px] font-bold">{hoveredEvent.hospital}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <span className="material-symbols-outlined text-base text-gray-500">schedule</span>
                <span className="text-[11px] font-bold">
                  {new Date(hoveredEvent.scheduledAt || hoveredEvent.bookedAt).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                {statusBadge(hoveredEvent.status)}
                <span className="text-[9px] font-black text-gray-500 uppercase">Tracked Case</span>
              </div>
            </div>
          </div>
        )}

        {/* PREMIUM SUCCESS MODAL */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-md" onClick={() => setShowSuccessModal(false)}></div>
            <div className="relative bg-[#1e293b] border border-white/10 rounded-[2.5rem] p-10 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] transform animate-in zoom-in-95 duration-300">
              <div className="flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/5">
                  <span className="material-symbols-outlined text-5xl text-emerald-400">check_circle</span>
                </div>

                <h3 className="text-3xl font-black text-white tracking-tight mb-3">Analysis Complete</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-8">
                  Your retinal scan has been successfully processed. The high-fidelity AI prediction report is now ready for your review.
                </p>

                <div className="flex flex-col w-full gap-3">
                  <button
                    onClick={() => {
                      setShowSuccessModal(false);
                      // Locate the View Report button or scroll to it
                      const reportBtn = document.querySelector('button[title="View Report"], .view-report-btn');
                      if (reportBtn) reportBtn.click();
                      else navigate('/prediction-results', { state: patient }); // Fallback
                    }}
                    className="w-full bg-[#007aff] hover:bg-[#0062cc] text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/20"
                  >
                    View Prediction Report
                  </button>
                  <button
                    onClick={() => setShowSuccessModal(false)}
                    className="w-full bg-slate-800/50 hover:bg-slate-800 text-slate-300 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

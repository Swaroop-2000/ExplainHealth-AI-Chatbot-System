// src/components/Header.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  writeBatch,
  doc,
  deleteDoc,
} from "firebase/firestore";

const Header = ({ searchTerm, setSearchTerm, doctorId = null }) => {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  const [notifications, setNotifications] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(false);

  const truncate = (text, max = 80) =>
    text?.length > max ? text.substring(0, max) + "..." : text;

  // 🔔 Load doctor-specific notifications
  useEffect(() => {
    if (!doctorId) return;

    const q = query(
      collection(db, "notifications"),
      where("doctorId", "==", doctorId),
      where("targetUserId", "==", null),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();

        return {
          id: d.id,
          patientName: data.patientName || "Unnamed Patient",
          doctorId: data.doctorId,
          message: data.message || "",
          type: data.type || "general",
          read: data.read || false,
          createdAt: data.createdAt,
        };
      });

      setNotifications(list);
    });

    return () => unsub();
  }, [doctorId]);

  // 🗑️ Delete single notification
  const deleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  // ✅ Mark all as read
  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach((n) =>
        batch.update(doc(db, "notifications", n.id), { read: true })
      );
      await batch.commit();
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  }, [notifications]);

  const toggleDropdown = async () => {
    setOpenDropdown(!openDropdown);
  };

  const getNotificationTitle = (n) => {
    switch (n.type) {
      case "appointment_request": return `New Appointment Request`;
      case "appointment_accepted": return `Appointment Accepted`;
      case "appointment_cancelled": return `Appointment Cancelled`;
      case "image_upload": return `New Retinal Image Uploaded`;
      case "patient_message": return `New Patient Message`;
      default: return "System Alert";
    }
  };

  const formatCreatedAt = (ts) => {
    try {
      if (!ts) return "";
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return "Just now";
    }
  };

  return (
    <header className={`flex items-center justify-between border-b px-10 py-3 sticky top-0 z-50 transition-all duration-300 backdrop-blur-md
      ${isDarkMode ? 'bg-[#111a22]/80 border-[#233648]' : 'bg-white/80 border-gray-200 shadow-sm'}`}
      style={{ zIndex: 100001 }}
    >

      {/* LEFT LOGO */}
      <div className={`flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity ${isDarkMode ? 'text-white' : 'text-gray-900'}`} onClick={() => navigate("/dashboard")}>
        <div className="size-8 text-[#007aff] bg-[#007aff]/10 p-1.5 rounded-lg border border-[#007aff]/20">
          <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"></path>
          </svg>
        </div>
        <h2 className="text-xl font-black tracking-tight">EyeCare Predict</h2>
      </div>

      {/* RIGHT CONTROLS */}
      <div className="flex gap-4 items-center">
        {/* SEARCH */}
        <div className="relative group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] group-focus-within:text-[#007aff] transition-colors">search</span>
          <input
            type="text"
            placeholder="Search Patients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-[280px] pl-10 pr-4 py-2 text-sm rounded-xl border focus:ring-2 ring-[#007aff]/20 focus:border-[#007aff] outline-none transition-all
              ${isDarkMode ? 'bg-[#0f172a] border-[#1e293b] text-white' : 'bg-gray-100 border-gray-200 text-gray-900'}`}
          />
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2 border-l pl-4 border-gray-200 dark:border-gray-800">
          {/* HISTORY */}
          <button
            className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center transition-all active:scale-90
              ${isDarkMode ? 'bg-[#233648] text-white hover:bg-[#1e293b]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            onClick={() => navigate("/history")}
            title="History Log"
          >
            <span className="material-symbols-outlined text-[20px]">history</span>
          </button>

          {/* 🔔 NOTIFICATION BELL */}
          <div className="relative">
            <button
              onClick={toggleDropdown}
              className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center relative transition-all active:scale-95
                ${isDarkMode ? 'bg-[#233648] text-white hover:bg-[#1e293b]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              {notifications.some((n) => !n.read) && (
                <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-white dark:border-[#0f172a] animate-pulse"></span>
              )}
            </button>

            {openDropdown && (
              <div className={`absolute right-0 mt-3 w-[360px] border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-4 z-[100] max-h-[500px] overflow-y-auto animate-in fade-in zoom-in slide-in-from-top-4 duration-200
                ${isDarkMode ? 'bg-[#0f172a] border-[#243447]' : 'bg-white border-gray-100'}`}>

                <div className="flex items-center justify-between mb-4 px-1">
                  <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Notifications</h3>
                  <button 
                    onClick={markAllRead}
                    className="text-[10px] font-black uppercase tracking-widest text-[#007aff] hover:opacity-70 transition-opacity bg-[#007aff]/10 px-3 py-1.5 rounded-full"
                  >
                    Mark all read
                  </button>
                </div>

                {notifications.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center opacity-50">
                    <span className="material-symbols-outlined text-4xl mb-2">notifications_off</span>
                    <p className="text-xs font-semibold">All caught up! No alerts found.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`group p-4 rounded-xl text-sm border relative transition-all cursor-pointer hover:shadow-md
                          ${isDarkMode ? 'bg-[#1e293b]/50 hover:bg-[#1e293b] text-gray-200 border-transparent hover:border-[#334b61]' : 'bg-gray-50 hover:bg-white text-gray-700 border-gray-100 hover:border-gray-200'}`}
                      >
                        <div className="flex items-center justify-between mb-1.5 pr-6">
                          <p className={`text-xs font-bold uppercase tracking-wide ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            {getNotificationTitle(n)}
                          </p>
                          <p className="text-[10px] font-medium opacity-60 font-mono">{formatCreatedAt(n.createdAt)}</p>
                        </div>

                        <p className={`text-[13px] leading-relaxed mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {n.message}
                        </p>

                        <div className="flex items-center gap-1.5 opacity-60">
                          <span className="material-symbols-outlined text-[14px]">person</span>
                          <p className="text-[11px] font-semibold">{n.patientName}</p>
                        </div>

                        {/* DELETE BUTTON */}
                        <button
                          onClick={(e) => deleteNotification(e, n.id)}
                          className="absolute top-3 right-3 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 transition-all"
                          title="Delete Alert"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>

                        {!n.read && (
                          <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#007aff] rounded-full shadow-[0_0_10px_#007aff]"></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LOGOUT */}
          <button
            className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center transition-all bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white active:scale-90`}
            onClick={() => {
              signOut(auth);
              navigate("/");
            }}
            title="Secure Logout"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;

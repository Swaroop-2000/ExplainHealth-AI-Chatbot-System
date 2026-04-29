// src/pages/QuestionsSection.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { db, storage } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  getDoc,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getDocs } from "firebase/firestore"; // <-- ADD THIS at the top

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

// Send patient a single clean notification for doctor reply
const notifyPatientOfReply = async (
  questionId,
  patientId,
  previewText = "",
  isImage = false
) => {
  const message = isImage
    ? "Doctor sent an image reply."
    : `Doctor replied: "${previewText}..."`;

  await addDoc(collection(db, "notifications"), {
    targetUserId: patientId,
    doctorId: null,
    message,
    meta: {
      type: isImage ? "doctor_reply_image" : "doctor_reply",
      questionId
    },
    read: false,
    createdAt: serverTimestamp(),
  });
};


export default function QuestionsSection() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [questions, setQuestions] = useState([]); // each document becomes a merged-chat thread
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState(null);
  const [replyPreview, setReplyPreview] = useState(null);
  const [loadingReply, setLoadingReply] = useState(false);

  // modal & delete state
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  //const [forceRefresh, setForceRefresh] = useState(0);

  const fileInputRef = useRef(null);

  const deepClean = (u) => {
    if (!u) return "";
    try {
      let s = String(u);
      s = s.split("?")[0].trim().toLowerCase();
      const segments = s.split(/[\/%]|2f/); 
      const slug = segments.filter(x => x && x !== "o" && x !== "v0" && x !== "b").pop() || "";
      return slug.split(".")[0];
    } catch {
      return String(u || "").toLowerCase().trim();
    }
  };

  // -----------------------
  // Helper: safe timestamp
  // -----------------------
  const nowTs = () => Date.now();

  // -----------------------
  // Listen questions (threads)
  // - Group by patientId
  // - INTERNAL GROUPING: Partition messages by reportContextUrl to avoid mixed chats
  // -----------------------
  useEffect(() => {
    const q = query(collection(db, "questions"));
    const unsub = onSnapshot(q, (snap) => {

      const patientsMap = {};

      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const pid = data.patientId || d.id;

        // 1. Extract and Normalize Messages
        let docMessages = [];
        if (Array.isArray(data.messages)) {
          docMessages = data.messages.filter(m => m && typeof m === "object" && m.sender).map(m => ({
            ...m,
            _sourceId: d.id, // ID needed for deletion
            _sourceDocContext: data.contextImageUrl || null // Inherit doc context if specific msg context is missing
          }));
        }

        // Fallback for old schema
        if (docMessages.length === 0 && data.question) {
          docMessages.push({
            id: `q-${d.id}`,
            sender: "patient",
            text: data.question,
            images: Array.isArray(data.userImages) ? data.userImages : [],
            timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().getTime() : data.timestamp) : nowTs(),
            reportContextUrl: data.contextImageUrl || null,
            _sourceId: d.id
          });
        }

        // 2. Hydrate Patients Map
        if (!patientsMap[pid]) {
          patientsMap[pid] = {
            patientId: pid,
            name: data.name || "Unknown User",
            photoUrl: data.photoUrl || null,
            latestUpdate: 0,
            allMessages: [],
            reports: Array.isArray(data.reports) ? data.reports : []
          };
        }

        if (data.name) patientsMap[pid].name = data.name;
        if (data.photoUrl) patientsMap[pid].photoUrl = data.photoUrl;
        if (Array.isArray(data.reports)) patientsMap[pid].reports = data.reports;

        patientsMap[pid].allMessages = [...patientsMap[pid].allMessages, ...docMessages];

        const threadUpdate = data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().getTime() : data.updatedAt) : 0;
        if (threadUpdate > patientsMap[pid].latestUpdate) {
          patientsMap[pid].latestUpdate = threadUpdate;
        }
      });

      // 3. Process each patient: Sort and Group by Context
      const patientList = Object.values(patientsMap).map(p => {
        // Sort all patient messages GLOBALLY by timestamp
        // 1. Sort all messages chronologically
        const allSorted = [...p.allMessages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // 2. Group by Context using a Map for strict segregation
        const threadMap = new Map();

        allSorted.forEach(msg => {
          // Identify the context (message-tag > doc-context > null)
          const context = msg.reportContextUrl || msg._sourceDocContext || null;
          const key = context ? deepClean(context) : "general";

          if (!threadMap.has(key)) {
            threadMap.set(key, {
              docId: msg._sourceId,
              uiThreadId: `thread_${msg.id}`,
              contextImageUrl: context,
              messages: [],
              updatedAt: 0
            });
          }

          const thread = threadMap.get(key);
          thread.messages.push(msg);
          const mTs = Number(msg.timestamp) || 0;
          if (mTs > thread.updatedAt) thread.updatedAt = mTs;
        });

        // 3. Convert to array and sort threads by most recent activity
        const groupedThreads = Array.from(threadMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

        // Sort groups by newest message first
        p.threads = groupedThreads.reverse();
        return p;
      });

      // Sort patients by latest update
      patientList.sort((a, b) => b.latestUpdate - a.latestUpdate);
      setQuestions(patientList);
    });

    return () => unsub();
  }, []);


  const manualRefresh = async () => {
    // skipped for brevity - relying on subscription
  };

  // -----------------------
  // Format timestamp
  // -----------------------
  const formatTs = (ts) => {
    try {
      if (!ts) return "just now";
      if (typeof ts === "number") return dayjs(ts).fromNow();
      if (ts?.toDate) return dayjs(ts.toDate()).fromNow();
      return dayjs(ts).fromNow();
    } catch {
      return "just now";
    }
  };

  // -----------------------
  // Upload reply image to storage and return URL
  // -----------------------
  const uploadReplyImage = async (qid, msgId, file) => {
    if (!file) return "";
    const safeName = file.name.replace(/\s+/g, "_");
    const path = `questions/${qid}/messages/${msgId}/${safeName}`;
    const sRef = ref(storage, path);
    const snapshot = await uploadBytes(sRef, file);
    const url = await getDownloadURL(snapshot.ref);
    return url;
  };

  // -----------------------
  // Push Notification for doctor/patient
  // -----------------------
  const pushNotification = async ({ doctorId = null, targetUserId = null, message = "", meta = {} }) => {
    try {
      await addDoc(collection(db, "notifications"), {
        doctorId,         // 🔥 doctor-specific notifications
        targetUserId,     // patient-specific notifications
        message,
        meta,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("pushNotification error:", err);
    }
  };



  // -----------------------
  // Submit reply (doctor)
  // - Creates a message object and pushes into messages[] using arrayUnion
  // - Uses client timestamp (Date.now()) to avoid serverTimestamp-in-array issues
  // -----------------------
  const submitReply = async (qid, explicitContext = null) => {
    if (!replyText.trim() && !replyFile) {
      window.alert("Please type a reply or attach an image.");
      return;
    }

    setLoadingReply(true);
    const msgId = "msg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    const qRef = doc(db, "questions", qid);

    try {
      // 1. Fetch existing thread data
      const qSnap = await getDoc(qRef);
      const qData = qSnap.exists() ? qSnap.data() : {};
      const pid = qData.patientId || qData.patientID || null;
      const allMsgs = qData.messages || [];

      // 2. Resolve Context: 
      // PRIORITY: Explicit Context from UI > Most recent message context > Stale document-level context
      const lastContextMsg = [...allMsgs].reverse().find(m => m.reportContextUrl);
      let currentContext = explicitContext || lastContextMsg?.reportContextUrl || qData.contextImageUrl || null;

      // 3. Upload image first (if any)
      let imageUrl = "";
      if (replyFile) {
        imageUrl = await uploadReplyImage(qid, msgId, replyFile);
      }

      // 4. Auto-Upgrade if missing context
      const updatePayload = {
        updatedAt: nowTs()
      };

      if (!currentContext && pid) {
        try {
          const pSnap = await getDoc(doc(db, "patients", pid));
          if (pSnap.exists()) {
            const pReports = pSnap.data().reports || [];
            const latestReport = pReports.length > 0 ? pReports[pReports.length - 1] : null;
            if (latestReport?.imageUrl) {
              currentContext = latestReport.imageUrl;
              updatePayload.contextImageUrl = currentContext;
            }
          }
        } catch (uErr) {
          console.warn("Auto-upgrade failed:", uErr);
        }
      }

      // 5. Build and Add Reply
      const msgObj = {
        id: msgId,
        sender: "doctor",
        text: replyText.trim() || "",
        images: imageUrl ? [imageUrl] : [],
        timestamp: nowTs(),
        reportContextUrl: currentContext,
        viewed: false,
      };

      updatePayload.messages = arrayUnion(msgObj);
      await updateDoc(qRef, updatePayload);

      // 6. Notify Patient
      if (pid) {
        const preview = msgObj.text.substring(0, 50);
        await notifyPatientOfReply(qid, pid, preview, msgObj.images.length > 0);
      }

      // 7. Reset UI
      setReplyingId(null);
      setReplyText("");
      setReplyFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("submitReply error:", err);
      window.alert("Failed to send reply. See console.");
    } finally {
      setLoadingReply(false);
    }
  };

  // -----------------------
  // Delete a message (reply or patient message)
  // - read full doc, filter out message by id, update messages array
  // -----------------------
  const deleteMessage = async (qid, messageId) => {
    try {
      const qRef = doc(db, "questions", qid);
      const snap = await getDoc(qRef);
      if (!snap.exists()) return;
      const cur = snap.data() || {};
      const msgs = Array.isArray(cur.messages) ? cur.messages : [];
      const updated = msgs.filter((m) => m.id !== messageId);
      await updateDoc(qRef, { messages: updated, updatedAt: nowTs() });
    } catch (err) {
      console.error("deleteMessage error:", err);
      window.alert("Could not delete message.");
    }
  };

  // -----------------------
  // Delete message image (clear images array for message)
  // -----------------------
  const deleteMessageImage = async (qid, messageId) => {
    try {
      const qRef = doc(db, "questions", qid);
      const snap = await getDoc(qRef);
      if (!snap.exists()) return;
      const cur = snap.data() || {};
      const msgs = Array.isArray(cur.messages) ? cur.messages : [];
      const updated = msgs.map((m) =>
        m.id === messageId ? { ...m, images: [] } : m
      );
      await updateDoc(qRef, { messages: updated, updatedAt: nowTs() });

      // also clear local composer file if matches (best-effort)
      setReplyFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("deleteMessageImage error:", err);
      window.alert("Could not delete message image.");
    }
  };

  // -----------------------
  // Delete user-uploaded image from thread (userImages array)
  // -----------------------
  const deleteUserImage = async (qid, imageUrl) => {
    try {
      const qRef = doc(db, "questions", qid);
      const snap = await getDoc(qRef);
      if (!snap.exists()) return;
      const cur = snap.data() || {};
      const imgs = Array.isArray(cur.userImages) ? cur.userImages : [];
      const updated = imgs.filter((i) => i !== imageUrl);
      await updateDoc(qRef, { userImages: updated, updatedAt: nowTs() });
    } catch (err) {
      console.error("deleteUserImage error:", err);
      window.alert("Could not delete user image.");
    }
  };


  // --------------------------------------------------------
  // MODIFY MESSAGE  (<< New feature)
  // --------------------------------------------------------
  const modifyMessage = async (qid, message) => {
    const newText = prompt("Modify message text:", message.text);
    if (!newText) return;

    const qRef = doc(db, "questions", qid);
    const snap = await getDoc(qRef);
    if (!snap.exists()) return;

    const cur = snap.data();
    const updated = cur.messages.map((m) =>
      m.id === message.id ? { ...m, text: newText, edited: true } : m
    );

    await updateDoc(qRef, {
      messages: updated,
      updatedAt: nowTs()
    });
  };

  // -----------------------
  // Delete modal helpers
  // -----------------------
  const openDeleteModal = (target) => {
    setDeleteTarget(target);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      return;
    }

    try {
      const { type, qid, messageId, imageUrl } = deleteTarget;
      if (type === "message") await deleteMessage(qid, messageId);
      else if (type === "messageImage") await deleteMessageImage(qid, messageId);
      else if (type === "userImage") await deleteUserImage(qid, imageUrl);
    } catch (err) {
      console.error("confirmDelete error:", err);
      window.alert("Delete failed.");
    } finally {
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  // -----------------------
  // UI: open user images modal
  // -----------------------
  const openUserImagesModal = (arr) => {
    setSelectedImages(arr || []);
    setImageModalOpen(true);
  };

  // -----------------------
  // Composer file change (keeps replyFile state)
  // -----------------------
  const onFileChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    setReplyFile(file);
    if (file) {
      if (file.type.startsWith('image/')) {
        setReplyPreview(URL.createObjectURL(file));
      } else if (file.type.startsWith('video/')) {
        setReplyPreview("video-placeholder"); // Special flag for video icon
      } else {
        setReplyPreview("file-placeholder"); // Special flag for document icon
      }
    } else {
      setReplyPreview(null);
    }
  };

  // -----------------------
  // Render
  // -----------------------
  return (
    <div className={`rounded-xl p-6 shadow-md sticky top-24 transition-colors duration-300 ${isDarkMode ? 'bg-[#0e2430]' : 'bg-white border border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>User Questions (Chat)</h3>

        <button
          onClick={manualRefresh}
          // snapshot is live; this button kept for UI parity


          className="px-3 py-1 bg-blue-600 rounded text-white text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-4 max-h-[72vh] overflow-auto">
        {questions.length === 0 && <p className={`text-gray-400 ${isDarkMode ? '' : 'text-gray-500'}`}>No questions yet...</p>}

        {questions.map((p) => (
          <div key={p.patientId} className={`rounded-3xl p-8 border transition-all duration-500 mb-6 flex flex-col ${p.threads.length === 0 ? 'min-h-[280px]' : ''} ${isDarkMode ? 'bg-[#122b33] border-white/5 shadow-2xl shadow-black/40' : 'bg-gray-50 border-gray-200 shadow-xl shadow-gray-200/50 hover:shadow-2xl'}`}>
            
            {/* Patient Header (One per patient) */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200/20">
              <div
                className={`w-12 h-12 rounded-full bg-cover bg-center border shadow-sm ${isDarkMode ? 'border-slate-600' : 'border-gray-300'}`}
                style={{
                  backgroundImage: `url(${p.photoUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png"})`,
                }}
              />
              <div>
                <div className={`font-bold text-lg leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{p.name}</div>
                <div className={`text-xs ${isDarkMode ? 'text-muted-dark' : 'text-gray-500'}`}>Patient ID: {p.patientId}</div>
              </div>
              <div className={`ml-auto text-xs ${isDarkMode ? 'text-muted-dark' : 'text-gray-400'}`}>
                Last active: {formatTs(p.latestUpdate)}
              </div>
            </div>

            {/* Threads Loop */}
            <div className={`flex flex-col gap-6 flex-grow ${p.threads.length === 0 ? 'justify-center items-center opacity-40' : ''}`}>
              {p.threads.length === 0 && (
                <div className="flex flex-col items-center gap-2">
                   <div className="text-[20px]">💬</div>
                   <div className={`text-xs italic ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>No messages with this patient.</div>
                </div>
              )}
              {p.threads.map((thread) => (
                <div key={thread.docId} className={`pl-4 border-l-2 ${isDarkMode ? 'border-slate-600' : 'border-gray-300'}`}>

                  {/* Thread Header: Report Context Link */}
                  <div className="flex items-center gap-2 mb-3">
                    {thread.contextImageUrl ? (
                      <>
                        <div
                          className="relative group w-8 h-8 rounded border border-blue-500 overflow-hidden cursor-pointer shadow-sm transition-transform hover:scale-105"
                          onClick={() => navigate("/prediction-results", { state: { patientId: p.patientId, imageUrl: thread.contextImageUrl } })}
                          title="View Linked Eye Report"
                        >
                          <img src={thread.contextImageUrl} alt="Scan" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-all" />
                        </div>
                        <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">
                          Report Chat
                        </span>
                      </>
                    ) : (
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${isDarkMode ? 'bg-slate-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                        General Discussion
                      </span>
                    )}
                  </div>


                  {/* Message List for this Thread */}

                  {/* User uploaded images for this specific thread */}
                  {thread.userImages && thread.userImages.length > 0 && (
                    <div className="mb-3">
                      <div className="mb-1 text-xs text-gray-400">User Attachments:</div>
                      <div className="flex flex-wrap gap-2">
                        {thread.userImages.map((imgObj, idx) => (
                          <div key={idx} className="relative group rounded overflow-hidden w-16 h-16">
                            <img
                              src={imgObj.url}
                              alt={`user-${idx}`}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => window.open(imgObj.url, "_blank")}
                            />
                            <button
                              onClick={() =>
                                openDeleteModal({ type: "userImage", qid: imgObj._sourceId, imageUrl: imgObj.url })
                              }
                              className="absolute top-0 right-0 bg-red-600/80 text-white text-[10px] w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                  <div className="space-y-3 mb-4">
                    {thread.messages.length === 0 && <div className="text-xs text-gray-500 italic">No messages in this thread.</div>}
                    {thread.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.sender === "doctor" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`p-3 rounded-xl max-w-[90%] break-words ${m.sender === "doctor"
                            ? "bg-blue-600 text-white"
                            : isDarkMode ? "bg-[#163041] text-gray-200" : "bg-gray-200 text-gray-800"
                            }`}
                        >
                          <div className="text-[10px] font-bold mb-1 opacity-70">
                            {m.sender === "doctor" ? "Me" : p.name}
                          </div>
                          {m.text && <div className="text-sm">{m.text}</div>}

                          {m.images && m.images.length > 0 && (
                            <div className="mt-4 flex flex-col gap-3">
                              {m.images.map((url, iidx) => {
                                // Extract extension before Firebase query params
                                const cleanUrl = url.split('?')[0].toLowerCase();
                                const isVideo = cleanUrl.match(/\.(mp4|webm|ogg|mov)$/) || url.includes("video");
                                const isPdf = cleanUrl.endsWith('.pdf');
                                const isWord = cleanUrl.match(/\.(doc|docx)$/);
                                const isDoc = isPdf || isWord || cleanUrl.endsWith('.txt');

                                if (isVideo) {
                                  return (
                                    <div key={iidx} className="relative group w-full max-w-[340px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/60 aspect-video flex items-center justify-center">
                                      <video src={url} controls className="w-full h-full object-cover" />
                                      <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-black uppercase tracking-widest text-white/90 border border-white/10">Clinical Recording</div>
                                    </div>
                                  );
                                }

                                if (isDoc) {
                                  return (
                                    <div 
                                      key={iidx} 
                                      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-95 shadow-xl w-full max-w-full ${
                                        m.sender === "doctor" 
                                          ? "bg-white/10 border-white/20 hover:bg-white/15" 
                                          : (isDarkMode ? "bg-black/20 border-white/10 hover:bg-black/30" : "bg-white border-gray-200 hover:border-gray-300 shadow-gray-200/50")
                                      }`}
                                      onClick={() => window.open(url, "_blank")}
                                    >
                                      <div className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-2xl shadow-inner ${
                                        isPdf ? "bg-red-500/20 text-red-500" : (isWord ? "bg-blue-500/20 text-blue-500" : "bg-gray-500/20 text-gray-500")
                                      }`}>
                                        {isPdf ? "📄" : (isWord ? "📝" : "📎")}
                                      </div>
                                      <div className="flex flex-col flex-grow overflow-hidden text-left min-w-0">
                                        <span className={`text-[10px] font-black uppercase tracking-tight truncate block ${m.sender === "doctor" ? "text-white" : (isDarkMode ? "text-gray-100" : "text-gray-900")}`}>
                                          {isPdf ? "Diagnostic_Report.pdf" : (isWord ? "Pathology_Notes.docx" : "Clinical_File.txt")}
                                        </span>
                                        <span className={`text-[9px] uppercase font-bold tracking-widest opacity-60 truncate block ${m.sender === "doctor" ? "text-blue-100" : (isDarkMode ? "text-gray-400" : "text-gray-500")}`}>
                                          {isPdf ? "PDF Document" : (isWord ? "Word Document" : "Text Archive")}
                                        </span>
                                      </div>
                                      <div className="w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center bg-black/10 hover:bg-black/20 text-sm opacity-60 hover:opacity-100 transition-all">⬇️</div>
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

                          <div className="flex items-center justify-between gap-4 mt-1">
                            <span className="text-[10px] opacity-60">{formatTs(m.timestamp)}</span>
                            {m.sender === "doctor" && (
                              <div className="flex gap-2">
                                <button onClick={() => modifyMessage(thread.docId, m)} className="text-[10px] hover:underline opacity-80 decoration-white">Edit</button>
                                <button onClick={() => openDeleteModal({ type: "message", qid: thread.docId, messageId: m.id })} className="text-[10px] hover:underline opacity-80 text-red-200 decoration-red-200">Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reply Box (Specific to this thread) */}
                  <div className={`mt-2 ${isDarkMode ? 'bg-[#0f2430]/50' : 'bg-gray-100'} p-3 rounded-lg`}>
                    {replyingId === thread.uiThreadId ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          rows={2}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          className={`w-full p-3 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDarkMode ? 'bg-[#112d3b] text-white border-white/10' : 'bg-white text-gray-900 border-gray-200 shadow-sm'}`}
                          placeholder={`Reply to ${thread.contextImageUrl ? 'this report' : 'patient'}...`}
                          autoFocus
                        />

                        {/* Image/File Preview Area */}
                        {replyPreview && (
                          <div className="relative group w-32 h-24 rounded-lg overflow-hidden border-2 border-blue-500/50 my-2 shadow-lg bg-black/20 flex items-center justify-center">
                            {replyPreview === "video-placeholder" ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-2xl">🎬</span>
                                <span className="text-[9px] text-white/70 uppercase font-bold">Video Preview</span>
                              </div>
                            ) : replyPreview === "file-placeholder" ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-2xl">📄</span>
                                <span className="text-[9px] text-white/70 uppercase font-bold">Document</span>
                              </div>
                            ) : (
                               <img src={replyPreview} alt="preview" className="w-full h-full object-cover" />
                            )}
                            <button
                              onClick={() => { setReplyFile(null); setReplyPreview(null); }}
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-[12px] shadow-md hover:scale-110 transition-all font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        )}

                        <div className="flex flex-col gap-3 mt-1">
                          <div className="flex items-center gap-2">
                            <label className={`cursor-pointer px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shadow-sm ${isDarkMode ? 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                              📎 Add Attachment
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                                onChange={onFileChange}
                                className="hidden"
                              />
                            </label>
                            {replyFile && <span className="text-[10px] text-blue-500 font-bold truncate max-w-[150px]">{replyFile.name}</span>}
                          </div>

                          <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                            <button
                              onClick={() => { setReplyingId(null); setReplyText(""); setReplyFile(null); setReplyPreview(null); }}
                              className={`text-xs px-4 py-2 rounded-lg font-medium transition-all ${isDarkMode ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => submitReply(thread.docId, thread.contextImageUrl)}
                              disabled={loadingReply || (!replyText.trim() && !replyFile)}
                              className="text-xs px-6 py-2 rounded-lg bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                            >
                              {loadingReply ? "Sending..." : "Send Reply"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setReplyingId(thread.uiThreadId);
                          setReplyText("");
                        }}
                        className={`text-xs px-3 py-2 rounded w-full text-left flex justify-between items-center ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}
                      >
                        <span>Reply to this thread...</span>
                        <span className="opacity-50">↩</span>
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>

          </div>
        ))}
      </div>

      {/* Image Viewer Modal */}
      {imageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setImageModalOpen(false)}>
          <div className={`p-4 rounded-lg shadow-xl w-[90%] max-w-3xl ${isDarkMode ? 'bg-[#152630]' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <h2 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Patient Uploaded Images</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`modal-${idx}`}
                  className="w-full object-cover rounded cursor-pointer border border-gray-700"
                  onClick={() => window.open(img, "_blank")}
                />
              ))}
            </div>

            <div className="mt-4 text-right">
              <button onClick={() => setImageModalOpen(false)} className="px-4 py-2 rounded bg-red-600 text-white">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60" onClick={() => setDeleteModalOpen(false)}>
          <div className={`p-6 rounded-lg w-[90%] max-w-md ${isDarkMode ? 'bg-[#1e293b] text-white' : 'bg-white text-gray-900'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Confirm delete</h3>
            <p className={`text-sm mb-4 ${isDarkMode ? 'text-muted-dark' : 'text-gray-500'}`}>
              Are you sure you want to delete this{" "}
              {deleteTarget?.type === "message"
                ? "message"
                : deleteTarget?.type === "messageImage"
                  ? "attached image"
                  : "user image"}
              ?
            </p>

            <div className="flex justify-end gap-3">
              <button onClick={() => { setDeleteModalOpen(false); setDeleteTarget(null); }} className={`px-4 py-2 rounded ${isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-black'}`}>Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded bg-red-600 text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

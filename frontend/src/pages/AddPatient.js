import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import { useTheme } from "../context/ThemeContext";
import {
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

// Hide default number spinners globally for this component
const SpinnerStyle = () => (
  <style>{`
    input[type=number]::-webkit-inner-spin-button, 
    input[type=number]::-webkit-outer-spin-button { 
      -webkit-appearance: none; 
      margin: 0; 
    }
    input[type=number] {
      -moz-appearance: textfield;
    }
  `}</style>
);

export default function AddPatient() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [toast, setToast] = useState(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    patientId: "",
    name: "",
    email: "",
    Phno: "",
    dob: "",
    age: "",
    gender: "",
    bloodType: "",
    "last visit": "",
    medicalHistory: ""
  });

  const [errors, setErrors] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showPhotoActions, setShowPhotoActions] = useState(false);

  /* ---------------- REAL-TIME FETCH ---------------- */
  useEffect(() => {
    if (!form.patientId || form.patientId.length < 3) return;
    const unsub = onSnapshot(doc(db, "patients", form.patientId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setForm(prev => ({
          ...prev,
          name: data.name || "",
          email: data.email || "",
          Phno: data.Phno || "",
          dob: data.dob || "",
          age: data.age || "",
          gender: data.gender || "",
          bloodType: data.bloodType || "",
          "last visit": data["last visit"] || "",
          medicalHistory: data.medicalHistory || ""
        }));
        if (data.photoUrl) setPhotoPreview(data.photoUrl);
      }
    });
    return () => unsub();
  }, [form.patientId]);

  /* ---------------- VALIDATION ---------------- */
  const validate = () => {
    const newErrors = {};
    if (!form.patientId) newErrors.patientId = "ID REQUIRED";
    if (!form.name || form.name.trim().length < 3) newErrors.name = "MIN 3 CHARS";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (form.email && !emailRegex.test(form.email)) newErrors.email = "INVALID FORMAT";

    if (!form.Phno || !/^\d{10}$/.test(form.Phno)) newErrors.Phno = "10 DIGITS REQ";
    if (!form.dob) newErrors.dob = "REQUIRED";
    else if (new Date(form.dob) > new Date()) newErrors.dob = "INVALID DATE";

    if (!form.age || Number(form.age) <= 0 || Number(form.age) > 120) newErrors.age = "INVALID AGE";
    if (!form.gender) newErrors.gender = "REQUIRED";
    if (!form.bloodType) newErrors.bloodType = "REQUIRED";

    // Date validation for Last Visit (DD/MM/YYYY)
    if (form["last visit"]) {
      const dateParts = form["last visit"].split("/");
      if (dateParts.length === 3) {
        const d = parseInt(dateParts[0]), m = parseInt(dateParts[1]), y = parseInt(dateParts[2]);
        if (d > 31 || m > 12 || y < 1900 || y > 2100) newErrors["last visit"] = "INVALID DATE";
      } else {
        newErrors["last visit"] = "INVALID FORMAT";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const adjustAge = (amount) => {
    setForm(prev => {
      const current = parseInt(prev.age || 0);
      const next = Math.max(0, current + amount);
      return { ...prev, age: next.toString() };
    });
    if (errors.age) setErrors(prev => ({ ...prev, age: null }));
  };

  const handleChange = (e) => {
    let { name, value } = e.target;

    // Strict 10-digit numeric enforcement for Phone Number
    if (name === "Phno") {
      value = value.replace(/\D/g, "").slice(0, 10);
    }

    // Proactive auto-formatting for Last Visit date (DD/MM/YYYY)
    if (name === "last visit") {
      const cleaned = value.replace(/\D/g, "");
      let res = "";
      for (let i = 0; i < cleaned.length; i++) {
        if (i === 2 || i === 4) res += "/";
        res += cleaned[i];
      }
      // Immediate slash injection on completion of day/month segments
      if (value.length > form["last visit"].length) {
        if (cleaned.length === 2 || cleaned.length === 4) res += "/";
      }
      value = res.slice(0, 10);
    }

    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  /* ---------------- IMAGE UTILS ---------------- */
  const cropToSquare = (imageFile) => {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => (img.src = reader.result);
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2;
        const y = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, x, y, size, size, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      reader.readAsDataURL(imageFile);
    });
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const cropped = await cropToSquare(file);
    setPhotoPreview(cropped);
    setShowPhotoActions(false);
  };

  const handleDeletePhoto = () => {
    setPhotoPreview(null);
    setShowPhotoActions(false);
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const user = auth.currentUser;
      let doctorId = null, doctorEmployeeId = null, doctorName = "Doctor";

      if (user?.email) {
        const q = query(collection(db, "doctors"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const dData = snap.docs[0].data();
          doctorId = snap.docs[0].id;
          doctorEmployeeId = dData.employeeId;
          doctorName = dData.name;
        }
      }

      await setDoc(doc(db, "patients", form.patientId), {
        ...form,
        age: Number(form.age),
        photoUrl: photoPreview || null,
        doctorId, doctorEmployeeId, doctorName,
        createdAt: serverTimestamp(),
      }, { merge: true });

      setToast({ message: "Patient clinical profile initialized and securely archived.", type: "success" });
      setTimeout(() => navigate("/patients"), 2000);
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to initialize clinical profile. Please verify data.", type: "error" });
    }
  };

  return (
    <>
    <div className={`min-h-screen flex justify-center items-center p-6 transition-colors duration-300 overflow-hidden relative
      ${isDarkMode 
        ? "bg-[#0f172a] text-slate-200 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-slate-950" 
        : "bg-gray-50 text-slate-900"}`}>
      
      <SpinnerStyle />
      
      {/* Background Decorative Rings */}
      <div className={`absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none ${isDarkMode ? 'block' : 'hidden'}`}>
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] border-[50px] border-cyan-500/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] border-[40px] border-indigo-500/20 rounded-full blur-[80px]" />
      </div>

      <form
        onSubmit={handleSubmit}
        className={`backdrop-blur-3xl p-10 rounded-[2.5rem] w-full max-w-2xl relative space-y-6 transition-all duration-300 border
          ${isDarkMode 
            ? "bg-white/5 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" 
            : "bg-white border-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.08)]"}`}
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className={`text-3xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add New Patient</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500/70">Clinical Record Entry</p>
        </div>

        {/* PHOTO SECTION */}
        <div className="flex justify-center group relative">
          <div className={`relative w-28 h-28 rounded-[2rem] border overflow-hidden flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-2xl
            ${isDarkMode ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
            {photoPreview ? (
              <img src={photoPreview} alt="" className="w-full h-full object-cover rounded-[1.8rem]" />
            ) : (
              <span className={`material-symbols-outlined text-4xl ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>medical_information</span>
            )}
            <button 
              type="button" 
              onClick={() => setShowPhotoActions(!showPhotoActions)} 
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
            >
              <span className="material-symbols-outlined text-white">camera</span>
            </button>
          </div>
          {showPhotoActions && (
            <div className={`absolute top-full mt-3 rounded-[1.5rem] shadow-[0_20px_40px_-5px_rgba(0,0,0,0.1)] z-20 w-52 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 border
              ${isDarkMode ? 'bg-[#111827] border-white/10' : 'bg-white border-slate-100'}`}>
              
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className={`w-full px-6 py-4 text-left transition-colors flex items-center gap-4
                  ${isDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-slate-50 text-[#1e293b]'}`}
              >
                <span className={`material-symbols-outlined text-xl ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>upload</span> 
                <span className="text-sm font-bold tracking-tight">Upload</span>
              </button>

              {photoPreview && (
                <button 
                  type="button" 
                  onClick={handleDeletePhoto} 
                  className={`w-full px-6 py-4 text-left transition-colors flex items-center gap-4 border-t
                    ${isDarkMode ? 'hover:bg-red-500/10 text-red-500 border-white/5' : 'hover:bg-red-50/50 text-[#f04438] border-slate-50'}`}
                >
                  <span className="material-symbols-outlined text-xl">delete</span> 
                  <span className="text-sm font-bold tracking-tight">Remove</span>
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-6 mt-2">
          {/* FIELDS MAPPING */}
          {[
            { name: "patientId", label: "Patient ID", placeholder: "e.g. P10001", icon: "fingerprint", full: true },
            { name: "name", label: "Full Name", placeholder: "e.g. John Doe", icon: "person", full: true },
            { name: "email", label: "Email Address", placeholder: "e.g. john@example.com", icon: "mail" },
            { name: "Phno", label: "Phone Number", placeholder: "e.g. 9876543210", icon: "call" },
          ].map((field) => (
            <div key={field.name} className={`relative flex flex-col gap-2 ${field.full ? 'md:col-span-2' : ''}`}>
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">{field.label}</label>
              <div className="relative group">
                <span className={`absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined transition-colors 
                  ${errors[field.name] ? 'text-red-400' : isDarkMode ? 'text-slate-500 group-focus-within:text-cyan-400' : 'text-slate-400 group-focus-within:text-cyan-600'}`}>
                  {field.icon}
                </span>
                <input
                  name={field.name}
                  placeholder={field.placeholder}
                  value={form[field.name]}
                  onChange={handleChange}
                  className={`w-full border rounded-2xl p-4 pl-12 text-sm font-bold transition-all outline-none
                    ${isDarkMode 
                      ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                      : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}
                    ${errors[field.name] ? (isDarkMode ? 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-red-500/50 bg-red-50/10') : ''}`}
                />
                {errors[field.name] && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-red-400 tracking-widest animate-pulse">{errors[field.name]}</span>}
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">Date of Birth</label>
            <div className="relative group">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined transition-colors 
                ${errors.dob ? 'text-red-400' : isDarkMode ? 'text-slate-500 group-focus-within:text-cyan-400' : 'text-slate-400 group-focus-within:text-cyan-600'}`}>calendar_month</span>
              <input 
                name="dob" 
                type="date" 
                value={form.dob} 
                onChange={handleChange} 
                onClick={(e) => e.target.showPicker && e.target.showPicker()} 
                className={`w-full border rounded-2xl p-4 pl-12 pr-6 text-sm font-bold transition-all outline-none cursor-pointer
                  ${isDarkMode 
                    ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                    : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}
                  ${errors.dob ? (isDarkMode ? 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-red-500/50 bg-red-50/10') : ''}`}
              />
              {errors.dob && <span className="absolute right-14 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-red-400 tracking-widest">{errors.dob}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">Last Visit</label>
            <div className="relative group">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined transition-colors 
                ${isDarkMode ? 'text-slate-500 group-focus-within:text-cyan-400' : 'text-slate-400 group-focus-within:text-cyan-600'}`}>history</span>
              <input 
                name="last visit" 
                placeholder="e.g. 23/03/2024"
                type="text" 
                value={form["last visit"]} 
                onChange={handleChange} 
                className={`w-full border rounded-2xl p-4 pl-12 pr-6 text-sm font-bold transition-all outline-none
                  ${isDarkMode 
                    ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                    : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}
                  ${errors["last visit"] ? (isDarkMode ? 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-red-500/50 bg-red-50/10') : ''}`}
              />
              {errors["last visit"] && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-red-400 tracking-widest animate-pulse">{errors["last visit"]}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">Age</label>
            <div className="relative group">
              <input
                name="age"
                placeholder="e.g. 25"
                type="number"
                min="0"
                value={form.age}
                onChange={handleChange}
                className={`w-full border rounded-2xl p-4 px-6 text-sm font-bold transition-all outline-none pr-14
                  ${isDarkMode 
                    ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                    : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}
                  ${errors.age ? (isDarkMode ? 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-red-500/50 bg-red-50/10') : ''}`}
              />
              <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center h-[calc(100%-1rem)] border-l pl-1 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <button type="button" onClick={() => adjustAge(1)} className="text-slate-500 hover:text-cyan-500 transition-colors select-none p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px] leading-none">expand_less</span>
                </button>
                <button type="button" onClick={() => adjustAge(-1)} className="text-slate-500 hover:text-cyan-500 transition-colors select-none p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px] leading-none">expand_more</span>
                </button>
              </div>
              {errors.age && <span className="absolute right-14 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-red-400 tracking-widest">{errors.age}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">Biological Gender</label>
            <div className="relative group">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined transition-colors 
                ${errors.gender ? 'text-red-400' : isDarkMode ? 'text-slate-500 group-focus-within:text-cyan-400' : 'text-slate-400 group-focus-within:text-cyan-600'}`}>wc</span>
              <select 
                name="gender" 
                value={form.gender} 
                onChange={handleChange} 
                className={`w-full border rounded-2xl p-4 pl-12 text-sm font-bold transition-all outline-none appearance-none cursor-pointer
                  ${isDarkMode 
                    ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                    : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}
                  ${errors.gender ? (isDarkMode ? 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-red-500/50 bg-red-50/10') : ''}
                  ${!form.gender ? 'text-slate-500' : isDarkMode ? 'text-white' : 'text-slate-800'}`}
              >
                <option value="" disabled hidden>Select Gender</option>
                <option value="Male" className={isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}>Male</option>
                <option value="Female" className={isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}>Female</option>
                <option value="Other" className={isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}>Other</option>
              </select>
              {errors.gender && <span className="absolute right-10 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-red-400 tracking-widest">{errors.gender}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">Blood Type</label>
            <div className="relative group">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined transition-colors 
                ${errors.bloodType ? 'text-red-400' : isDarkMode ? 'text-slate-500 group-focus-within:text-cyan-400' : 'text-slate-400 group-focus-within:text-cyan-600'}`}>bloodtype</span>
              <select 
                name="bloodType" 
                value={form.bloodType} 
                onChange={handleChange} 
                className={`w-full border rounded-2xl p-4 pl-12 text-sm font-bold transition-all outline-none appearance-none cursor-pointer
                  ${isDarkMode 
                    ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                    : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}
                  ${errors.bloodType ? (isDarkMode ? 'border-red-400/50 shadow-[0_0_15px_rgba(248,113,113,0.1)]' : 'border-red-500/50 bg-red-50/10') : ''}
                  ${!form.bloodType ? 'text-slate-500' : isDarkMode ? 'text-white' : 'text-slate-800'}`}
              >
                <option value="" disabled hidden>Select Blood Type</option>
                {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bt => (
                  <option key={bt} value={bt} className={isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}>{bt}</option>
                ))}
              </select>
              {errors.bloodType && <span className="absolute right-10 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-red-400 tracking-widest">{errors.bloodType}</span>}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8B9BB4] ml-1">Medical History & Conditions</label>
            <div className="relative group">
              <textarea 
                name="medicalHistory" 
                placeholder="e.g. Chronic Hypertension, Seasonal Allergies..." 
                value={form.medicalHistory} 
                onChange={handleChange} 
                className={`w-full border rounded-[2rem] p-5 text-sm font-bold transition-all outline-none min-h-[100px] resize-none
                  ${isDarkMode 
                    ? "bg-slate-900/50 text-white border-white/5 hover:border-[#22D3EE]/40 focus:border-cyan-400/50 focus:bg-slate-900" 
                    : "bg-slate-100/50 text-slate-800 border-slate-200 hover:border-cyan-500/40 focus:border-cyan-500/50 focus:bg-white"}`}
              />
              <span className="absolute right-5 top-5 material-symbols-outlined text-slate-500 opacity-40">history_edu</span>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 py-4 rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-cyan-500/20"
          >
            Save Patient Record
          </button>
          <button
            type="button"
            onClick={() => navigate("/patients")}
            className={`flex-1 border py-4 rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3
              ${isDarkMode 
                ? "bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-800" 
                : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"}`}
          >
            Back
          </button>
        </div>
      </form>
    </div>

    {/* PREMIUM REGISTRY TOAST */}
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
            <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-0.5">Clinical Registry</p>
            <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className="ml-4 opacity-40 hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>
    )}
  </>
  );
}

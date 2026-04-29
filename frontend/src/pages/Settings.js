// src/pages/Settings.js
import React, { useState, useEffect, useRef } from "react";
import { auth, db, storage } from "../firebase";
import { doc, getDoc, updateDoc, query, collection, where, onSnapshot } from "firebase/firestore";
import { updatePassword, sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useTheme } from "../context/ThemeContext";
import Sidebar from "./Sidebar";
import Header from "./Header";

const Settings = () => {
    const { isDarkMode, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState("profile");
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const fileInputRef = useRef(null);

    // Doctor Data
    const [doctorData, setDoctorData] = useState({
        name: "",
        specialty: "",
        email: "",
        photoUrl: "",
        role: "",
        employeeId: ""
    });

    // Password Data
    const [passwords, setPasswords] = useState({
        current: "",
        new: "",
        confirm: ""
    });

    // Notification Preferences
    const [notifications, setNotifications] = useState({
        newScans: { email: true, push: true },
        userQuestions: { email: true, push: false },
    });

    // System Preferences
    // const [darkMode, setDarkMode] = useState(true); // Moved to Context

    // Fetch Doctor Data
    useEffect(() => {
        let unsubscribe;
        const fetchDoctorData = async () => {
            try {
                const user = auth.currentUser;
                if (!user) return;

                // Query the "doctors" collection by email
                const q = query(
                    collection(db, "doctors"),
                    where("email", "==", user.email)
                );

                // Real-time listener
                unsubscribe = onSnapshot(q, (snapshot) => {
                    if (!snapshot.empty) {
                        const docData = snapshot.docs[0].data();
                        const docId = snapshot.docs[0].id; // We need this to update later

                        setDoctorData({
                            id: docId, // Store doc ID
                            name: docData.name || "",
                            specialty: docData.dept || docData.specialty || "", // Handle 'dept' or 'specialty'
                            email: docData.email || user.email,
                            photoUrl: docData.photoURL || user.photoURL || "",
                            role: docData.role || "",
                            employeeId: docData.employeeId || ""
                        });
                    } else {
                        // Fallback if no doctor record found (use Auth data)
                        setDoctorData(prev => ({
                            ...prev,
                            email: user.email,
                            photoUrl: user.photoURL
                        }));
                    }
                    setLoading(false);
                });

            } catch (error) {
                console.error("Error setting up doctor listener:", error);
                setLoading(false);
            }
        };

        fetchDoctorData();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const handleImageClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingImg(true);
        try {
            const user = auth.currentUser;
            const storageRef = ref(storage, `profile_photos/${user.uid}_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // 1. Update Local State
            setDoctorData(prev => ({ ...prev, photoUrl: url }));

            // 2. Update Firestore
            if (doctorData.id) {
                const docRef = doc(db, "doctors", doctorData.id);
                await updateDoc(docRef, {
                    photoURL: url
                });
            }

            // 3. Update Auth Profile
            await updateProfile(user, { photoURL: url });

            alert("Profile photo updated successfully!");

        } catch (error) {
            console.error("Error uploading image:", error);
            alert("Failed to upload image. Please try again.");
        } finally {
            setUploadingImg(false);
        }
    };

    const handleUpdateProfile = async () => {
        if (!isEditing) {
            setIsEditing(true);
            return;
        }

        if (!doctorData.id) {
            alert("No doctor profile found in database to update.");
            return;
        }

        setUpdating(true);
        try {
            const docRef = doc(db, "doctors", doctorData.id);

            await updateDoc(docRef, {
                name: doctorData.name,
                dept: doctorData.specialty, // Map 'specialty' back to 'dept'
                email: doctorData.email,
            });

            alert("Profile updated successfully!");
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Failed to update profile.");
        } finally {
            setUpdating(false);
        }
    };

    const handlePasswordReset = async () => {
        if (passwords.new !== passwords.confirm) {
            alert("New passwords do not match.");
            return;
        }

        if (!passwords.current) {
            alert("Please enter your current password to confirm changes.");
            return;
        }

        setUpdating(true);
        try {
            const user = auth.currentUser;
            if (user && user.email) {
                // 1. Re-authenticate
                const credential = EmailAuthProvider.credential(user.email, passwords.current);
                await reauthenticateWithCredential(user, credential);

                // 2. Update Password
                await updatePassword(user, passwords.new);

                alert("Password updated successfully.");
                setPasswords({ current: "", new: "", confirm: "" });
            }
        } catch (error) {
            console.error("Error updating password:", error);
            if (error.code === 'auth/wrong-password') {
                alert("Incorrect current password.");
            } else if (error.code === 'auth/requires-recent-login') {
                alert("Please log out and log in again to change your password.");
            } else {
                alert("Failed to update password: " + error.message);
            }
        } finally {
            setUpdating(false);
        }
    };


    return (
        <div className={`flex w-full min-h-screen transition-colors duration-500 ${isDarkMode ? 'bg-[#0b1219] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <Sidebar />

            <div className="flex-1 flex flex-col">
                <Header searchTerm="" setSearchTerm={() => { }} doctorId={doctorData.employeeId} />

                <main className="p-8 max-w-6xl mx-auto w-full space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">

                    {/* Page Header */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-8 bg-[#007aff] rounded-full shadow-[0_0_15px_rgba(0,122,255,0.4)]" />
                            <h1 className="text-4xl font-black tracking-tight italic">Administrative Console</h1>
                        </div>
                        <p className={`text-sm ml-5 ${isDarkMode ? 'text-slate-400 font-medium' : 'text-gray-500 font-bold'}`}>
                            Configure your specialist profile, security protocols, and interface parameters.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* 1. Profile Settings (Large Bento) */}
                        <section className={`lg:col-span-2 rounded-[2.5rem] p-10 border transition-all duration-500 ${isDarkMode ? 'bg-white/[0.03] border-white/5 backdrop-blur-xl shadow-2xl' : 'bg-white border-gray-100 shadow-xl shadow-gray-200/50'}`}>
                            <div className="flex items-center gap-4 mb-10">
                                <div className="size-10 rounded-xl bg-[#007aff]/10 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[#007aff] text-2xl">account_circle</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-black tracking-tight">Specialist Profile</h2>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#007aff]">Identity Management</p>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-12 items-start">
                                {/* Enhanced Avatar */}
                                <div className="flex flex-col items-center gap-4 group/avatar relative">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleImageChange}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                    <div 
                                        className="relative cursor-pointer transition-transform duration-500 hover:scale-105 active:scale-95" 
                                        onClick={handleImageClick}
                                    >
                                        <div className={`size-40 rounded-[2.5rem] overflow-hidden border-[6px] shadow-2xl transition-all duration-500 ${uploadingImg ? "opacity-40" : ""} ${isDarkMode ? 'border-[#0b1219] bg-slate-900' : 'border-gray-50 bg-gray-100'}`}>
                                            <img
                                                src={doctorData.photoUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
                                                alt="Doctor Profile"
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 bg-[#007aff] size-12 rounded-2xl flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,122,255,0.4)] group-hover/avatar:scale-110 transition-transform duration-500">
                                            <span className="material-symbols-outlined text-xl">{uploadingImg ? "sync" : "photo_camera"}</span>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                                            {uploadingImg ? "Syncing Identity..." : "400x400 Clinical Standard"}
                                        </p>
                                    </div>
                                </div>

                                {/* Precision Fields */}
                                <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="space-y-3 group">
                                        <label className={`text-[10px] font-black uppercase tracking-[0.25em] ml-2 transition-colors duration-500 group-focus-within:text-[#007aff] ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Full Name / Clinical Alias</label>
                                        <div className={`relative flex items-center transition-all duration-500 rounded-[22px] border-2 ${!isEditing ? 'bg-white/[0.05] border-white/5 cursor-default' : 'hover:bg-white/[0.07] group-focus-within:bg-white/[0.08] group-focus-within:border-[#007aff]'} ${isDarkMode ? 'backdrop-blur-xl border-transparent' : 'bg-gray-50 border-transparent'}`}>
                                            <span className="material-symbols-outlined absolute left-4 text-lg opacity-30 group-focus-within:opacity-100 group-focus-within:text-[#007aff] transition-all">person</span>
                                            <input
                                                type="text"
                                                readOnly={!isEditing}
                                                value={doctorData.name}
                                                onChange={(e) => setDoctorData({ ...doctorData, name: e.target.value })}
                                                placeholder="Dr. Evelyn Reed"
                                                className={`w-full bg-transparent border-none pl-11 pr-3 py-4 font-bold text-[12px] tracking-tight outline-none focus:outline-none focus:ring-0 placeholder:opacity-20 ${!isEditing ? 'cursor-default' : ''}`}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3 group">
                                        <label className={`text-[10px] font-black uppercase tracking-[0.25em] ml-2 transition-colors duration-500 group-focus-within:text-[#007aff] ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Medical Specialty</label>
                                        <div className={`relative flex items-center transition-all duration-500 rounded-[22px] border-2 ${!isEditing ? 'bg-white/[0.05] border-white/5 cursor-default' : 'hover:bg-white/[0.07] group-focus-within:bg-white/[0.08] group-focus-within:border-[#007aff]'} ${isDarkMode ? 'backdrop-blur-xl border-transparent' : 'bg-gray-50 border-transparent'}`}>
                                            <span className="material-symbols-outlined absolute left-4 text-lg opacity-30 group-focus-within:opacity-100 group-focus-within:text-[#007aff] transition-all">stethoscope</span>
                                            <input
                                                type="text"
                                                readOnly={!isEditing}
                                                value={doctorData.specialty}
                                                onChange={(e) => setDoctorData({ ...doctorData, specialty: e.target.value })}
                                                placeholder="Ophthalmologist"
                                                className={`w-full bg-transparent border-none pl-11 pr-3 py-4 font-bold text-[12px] tracking-tight outline-none focus:outline-none focus:ring-0 placeholder:opacity-20 ${!isEditing ? 'cursor-default' : ''}`}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3 lg:col-span-2 group">
                                        <label className={`text-[10px] font-black uppercase tracking-[0.25em] ml-2 transition-colors duration-500 group-focus-within:text-[#007aff] ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>Registered Contact Channel</label>
                                        <div className={`relative flex items-center transition-all duration-500 rounded-[22px] border-2 ${!isEditing ? 'bg-white/[0.05] border-white/5 cursor-default' : 'hover:bg-white/[0.07] group-focus-within:bg-white/[0.08] group-focus-within:border-[#007aff]'} ${isDarkMode ? 'backdrop-blur-xl border-transparent' : 'bg-gray-50 border-transparent'}`}>
                                            <span className="material-symbols-outlined absolute left-4 text-lg opacity-30 group-focus-within:opacity-100 group-focus-within:text-[#007aff] transition-all">alternate_email</span>
                                            <input
                                                type="email"
                                                readOnly={!isEditing}
                                                value={doctorData.email}
                                                onChange={(e) => setDoctorData({ ...doctorData, email: e.target.value })}
                                                className={`w-full bg-transparent border-none pl-11 pr-3 py-4 font-bold text-[12px] tracking-tight outline-none focus:outline-none focus:ring-0 placeholder:opacity-20 ${!isEditing ? 'cursor-default' : ''}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-12 pt-8 border-t border-white/5 flex justify-end">
                                    <button
                                        onClick={handleUpdateProfile}
                                        disabled={updating}
                                        className={`${isEditing ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-[#007aff] hover:bg-[#0062cc] shadow-blue-500/20'} text-white px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-[0_10px_30px] active:scale-95 disabled:opacity-50`}
                                    >
                                        {updating ? "Committing..." : "Update Clinical Profile"}
                                    </button>
                            </div>
                        </section>

                        <div className="flex flex-col gap-8">
                            {/* 2. Account Security (Vertical Premium) */}
                            <section className={`rounded-[2.5rem] p-8 border transition-all duration-500 ${isDarkMode ? 'bg-white/[0.03] border-white/5 shadow-2xl' : 'bg-white border-gray-100 shadow-xl'}`}>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-amber-500 text-2xl">security</span>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black tracking-tight">Access Security</h2>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">Protection Protocol</p>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <div className="relative group">
                                        <input
                                            type="password"
                                            placeholder="Current Access Key"
                                            value={passwords.current}
                                            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                            className={`w-full px-5 py-3.5 rounded-xl border-none outline-none font-bold text-sm transition-all ${isDarkMode ? 'bg-white/5 focus:bg-white/[0.08]' : 'bg-gray-50 focus:bg-white'}`}
                                        />
                                    </div>
                                    <div className="relative group">
                                        <input
                                            type="password"
                                            placeholder="New Clinical Key"
                                            value={passwords.new}
                                            onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                            className={`w-full px-5 py-3.5 rounded-xl border-none outline-none font-bold text-sm transition-all ${isDarkMode ? 'bg-white/5 focus:bg-white/[0.08]' : 'bg-gray-50 focus:bg-white'}`}
                                        />
                                    </div>
                                    <button
                                        onClick={handlePasswordReset}
                                        className={`w-full py-4 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all border ${isDarkMode ? 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-300' : 'bg-gray-50 hover:bg-gray-100 border-gray-100 text-gray-700'}`}
                                    >
                                        Rotate Security Key
                                    </button>
                                </div>
                            </section>

                            {/* 3. System Preferences */}
                            <section className={`rounded-[2.5rem] p-8 border transition-all duration-500 ${isDarkMode ? 'bg-gradient-to-br from-[#007aff]/10 to-transparent border-[#007aff]/20 shadow-2xl' : 'bg-white border-gray-100 shadow-xl'}`}>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary text-2xl">palette</span>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black tracking-tight">Interface Suite</h2>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">UX Calibration</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-2 rounded-2xl bg-black/20 border border-white/5">
                                    <button
                                        onClick={() => !isDarkMode && toggleTheme()}
                                        className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl transition-all duration-500 ${isDarkMode ? 'bg-[#007aff] text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        <span className="material-symbols-outlined text-xl">dark_mode</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest italic">Obsidian</span>
                                    </button>
                                    <button
                                        onClick={() => isDarkMode && toggleTheme()}
                                        className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl transition-all duration-500 ${!isDarkMode ? 'bg-[#007aff] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        <span className="material-symbols-outlined text-xl">light_mode</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest italic">Clinical</span>
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>

                    {/* 4. Notification Toggles (Wide Glass) */}
                    <section className={`rounded-[2.5rem] p-10 border transition-all duration-500 ${isDarkMode ? 'bg-white/[0.03] border-white/5 backdrop-blur-xl' : 'bg-white border-gray-100'}`}>
                        <div className="flex items-center gap-4 mb-10">
                            <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-emerald-500 text-2xl">notifications_active</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-black tracking-tight">Diagnostic Alerts</h2>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Notification Channels</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            {[
                                { title: "Patient Diagnostic Payload", desc: "Alert me the instant a new ophthalmic scan is synchronized.", active: true },
                                { title: "Clinical Inquiries", desc: "Real-time notifications for patient-specialist dialogue.", active: true }
                            ].map((item, idx) => (
                                <div key={idx} className={`p-6 rounded-3xl border transition-all duration-500 flex items-center justify-between ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100 hover:bg-white hover:shadow-xl hover:shadow-gray-200/50'}`}>
                                    <div className="max-w-[70%]">
                                        <h3 className="font-bold text-md mb-1">{item.title}</h3>
                                        <p className="text-xs text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className={`size-10 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-500 ${item.active ? 'bg-[#007aff]/10 border-[#007aff]/30 text-[#007aff]' : 'border-white/10 opacity-30 grayscale'}`}>
                                            <span className="material-symbols-outlined text-xl">alternate_email</span>
                                        </div>
                                        <div className={`size-10 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-500 ${item.active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'border-white/10 opacity-30 grayscale'}`}>
                                            <span className="material-symbols-outlined text-xl">vibration</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Danger Zone */}
                    <div className="flex justify-center pt-10">
                        <button
                            onClick={() => alert("This terminal action requires administrative override.")}
                            className="group flex items-center gap-3 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500 active:scale-95"
                        >
                            <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">dangerous</span>
                            Deactivate Account Key
                        </button>
                    </div>

                </main>
            </div>
        </div>
    );
};

export default Settings;

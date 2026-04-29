import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";


// Firebase
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function LoginPage() {
  const [role, setRole] = useState("patient");
  const navigate = useNavigate();

  // PATIENT STATES
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");

  // DOCTOR STATES
  const [doctorEmployeeId, setDoctorEmployeeId] = useState("");
  const [doctorPassword, setDoctorPassword] = useState("");

  // Main handler
  const handleContinue = () => {
    if (role === "patient") loginPatient();
    else loginDoctor();
  };

  // PATIENT LOGIN
 // PATIENT LOGIN
const loginPatient = async () => {
  if (!patientName.trim() || !patientId.trim()) {
    alert("Please enter full name and patient ID.");
    return;
  }

  try {
    const ref = doc(db, "patients", patientId.trim());
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("Patient ID not found.");
      return;
    }

    const data = snap.data();

    if (!data.name || data.name.toLowerCase() !== patientName.toLowerCase()) {
      alert("Name does not match our records.");
      return;
    }

    await signInAnonymously(auth);

    navigate("/patient-dashboard", {
      state: {
        name: data.name,
        patientId: data.patientId,
        dob: data.dob,
      },
    });

  } catch (err) {
    console.error("Patient login error:", err);
    alert("Login failed.");
  }
};

  // DOCTOR LOGIN
  const loginDoctor = async () => {
  if (!doctorEmployeeId.trim() || !doctorPassword.trim()) {
    alert("Please enter Employee ID and Password.");
    return;
  }

  try {
    const employeeId = doctorEmployeeId.trim().toUpperCase();

    console.log("🔍 Looking up doctor:", employeeId);

    const ref = doc(db, "doctors", employeeId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("❌ Employee ID not found in Firestore");
      return;
    }

    const doctorData = snap.data();
    console.log("📌 Firestore doctor data:", doctorData);

    console.log("🔍 Trying login with email:", doctorData.email);

    await signInWithEmailAndPassword(auth, doctorData.email, doctorPassword);

    console.log("✅ Login SUCCESS");
    navigate("/doctor-dashboard");
  } catch (err) {
    console.error("❌ Doctor login error:", err.message);
    alert("Invalid doctor credentials.");
  }
};


  return (
    <div className="min-h-screen bg-[#0d1726] text-white flex flex-col">

      {/* HEADER */}
      <header className="flex items-center justify-between px-12 py-10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#3B82F6] text-4xl">
            visibility
          </span>
          <span className="text-white text-xl font-semibold tracking-wide">
            VisionGuard
          </span>
        </div>

        <nav className="flex items-center gap-10 text-gray-300 text-base">
          {/* ⭐ FIXED: Now About Us navigates to /about */}
          <button onClick={() => navigate("/about-us")} className="hover:text-white transition">
            About Us
          </button>

          <button onClick={() => navigate("/contact-us")} className="hover:text-white transition">
    Contact Us
  </button>
        </nav>
      </header>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 px-12 py-8 gap-10">

        {/* LEFT SECTION */}
        <div className="flex flex-col justify-center pr-10">
          <h2 className="text-4xl font-bold leading-snug mb-4">
            Welcome to Advanced Eye <br /> Disease Prediction
          </h2>
          <p className="text-gray-400 text-lg max-w-lg leading-relaxed">
            Providing early and accurate predictions for eye health using advanced
            technology to safeguard your vision.
          </p>
          <p className="text-gray-500 text-sm mt-16">
            © 2024 VisionGuard Inc. All rights reserved.
          </p>
        </div>

        {/* RIGHT SECTION */}
        <div className="flex flex-col justify-start mt-8 relative z-10">

          <h3 className="text-3xl font-bold mb-1">Get Started</h3>
          <p className="text-gray-400 mb-6">Select your role to continue.</p>

          {/* ROLE SWITCH */}
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-1 flex w-full max-w-xl shadow-[0_0_25px_rgba(0,0,0,0.3)]">
            <button
              onClick={() => setRole("patient")}
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                role === "patient"
                  ? "bg-blue-500 text-white shadow-[0_0_18px_rgba(56,133,255,0.35)]"
                  : "text-gray-300 hover:bg-white/10"
              }`}
            >
              Patient
            </button>

            <button
              onClick={() => setRole("doctor")}
              className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                role === "doctor"
                  ? "bg-blue-500 text-white shadow-[0_0_18px_rgba(56,133,255,0.35)]"
                  : "text-gray-300 hover:bg-white/10"
              }`}
            >
              Doctor
            </button>
          </div>

          {/* FORM */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleContinue(); }}
            className="mt-8 bg-white/5 p-8 rounded-2xl backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.25)] w-full max-w-xl"
          >

            {/* PATIENT FORM */}
            {role === "patient" && (
              <>
                <label className="text-gray-300 text-sm mb-1 block">Full Name</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full bg-white/10 text-white px-4 py-3 rounded-lg border border-white/10 focus:border-blue-400 outline-none"
                />

                <label className="text-gray-300 text-sm mt-6 mb-1 block">Patient ID</label>
                <input
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="Enter your patient ID"
                  className="w-full bg-white/10 text-white px-4 py-3 rounded-lg border border-white/10 focus:border-blue-400 outline-none"
                />

                <div className="mt-6 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 text-gray-300">
                  🔒 You will receive a one-time authentication code.
                </div>
              </>
            )}

            {/* DOCTOR FORM */}
            {role === "doctor" && (
              <>
                <label className="text-gray-300 text-sm mb-1 block">Employee ID</label>
                <input
                  type="text"
                  value={doctorEmployeeId}
                  onChange={(e) => setDoctorEmployeeId(e.target.value)}
                  placeholder="Enter EMP ID (e.g., EMP001)"
                  className="w-full bg-white/10 text-white px-4 py-3 rounded-lg border border-white/10 focus:border-blue-400 outline-none"
                />

                <label className="text-gray-300 text-sm mt-6 mb-1 block">Password</label>
                <input
                  type="password"
                  value={doctorPassword}
                  onChange={(e) => setDoctorPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-white/10 text-white px-4 py-3 rounded-lg border border-white/10 focus:border-blue-400 outline-none"
                />
              </>
            )}

            {/* BUTTON */}
            <button
              type="submit"
              className="mt-8 w-full py-3 bg-blue-500 text-white rounded-xl font-semibold shadow-[0_0_22px_rgba(56,133,255,0.35)] hover:bg-blue-400 transition-all"
            >
              Continue
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}




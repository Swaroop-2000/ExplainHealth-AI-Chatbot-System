// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorHistory from "./pages/DoctorHistory";
import PatientDashboard from "./pages/PatientDashboard";
import PredictionResults from "./pages/PredictionResults";
import ProtectedRoute from "./components/ProtectedRoute";
import FixAppointments from "./pages/FixAppointments";

// Public pages
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";

// Patients features
import PatientsDirectory from "./pages/PatientsDirectory";
import AddPatient from "./pages/AddPatient";

// 🆕 Patient Profile (Deep Dive)
import PatientProfile from "./pages/PatientProfile";

import Analytics from "./pages/Analytics";

// ⚙️ Settings
import Settings from "./pages/Settings";
import { ThemeProvider } from "./context/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>

          {/* ---------------- PUBLIC ROUTES ---------------- */}

          {/* Login Page */}
          <Route path="/" element={<LoginPage />} />

          {/* Public informational pages */}
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/contact-us" element={<ContactUs />} />
          <Route path="/fix-appointments" element={<FixAppointments />} />

          {/* ---------------- PROTECTED ROUTES ---------------- */}

          {/* Doctor Dashboard */}
          <Route
            path="/doctor-dashboard"
            element={
              <ProtectedRoute>
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />

          {/* Doctor History */}
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <DoctorHistory />
              </ProtectedRoute>
            }
          />

          {/* Patients Directory */}
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <PatientsDirectory />
              </ProtectedRoute>
            }
          />

          {/* ➕ Add New Patient */}
          <Route
            path="/add-patient"
            element={
              <ProtectedRoute>
                <AddPatient />
              </ProtectedRoute>
            }
          />

          {/* 🧠 Patient Profile (Deep Dive View) */}
          <Route
            path="/patient-profile/:patientId"
            element={
              <ProtectedRoute>
                <PatientProfile />
              </ProtectedRoute>
            }
          />

          {/* Patient Dashboard */}
          <Route
            path="/patient-dashboard"
            element={
              <ProtectedRoute>
                <PatientDashboard />
              </ProtectedRoute>
            }
          />

          {/* Prediction Results (with scanId) */}
          <Route
            path="/prediction-results/:scanId"
            element={
              <ProtectedRoute>
                <PredictionResults />
              </ProtectedRoute>
            }
          />

          {/* Prediction Results (fallback) */}
          <Route
            path="/prediction-results"
            element={
              <ProtectedRoute>
                <PredictionResults />
              </ProtectedRoute>
            }
          />

          {/* ⚙️ Settings */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Analytics */}
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />

        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

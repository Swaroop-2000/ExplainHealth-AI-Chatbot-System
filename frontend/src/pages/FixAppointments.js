import React, { useState } from "react";
import { db } from "../firebase";
import {
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";

export default function FixAppointments() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);

  const addLog = (msg) => setLog((prev) => [...prev, msg]);

  const fixAppointments = async () => {
    setRunning(true);
    setLog(["Starting migration..."]);

    try {
      const apptSnap = await getDocs(collection(db, "appointments"));

      if (apptSnap.empty) {
        addLog("No appointments found.");
        setRunning(false);
        return;
      }

      addLog(`Found ${apptSnap.size} appointments.`);

      for (const apptDoc of apptSnap.docs) {
        const appt = apptDoc.data();

        // Skip already fixed appointments
        if (appt.doctorEmployeeId) {
          addLog(`✔ Already fixed: ${apptDoc.id}`);
          continue;
        }

        addLog(`Processing appointment: ${apptDoc.id}`);

        // Find doctor
        const docQuery = query(
          collection(db, "doctors"),
          where("name", "==", appt.doctor)
        );

        const docSnap = await getDocs(docQuery);

        if (docSnap.empty) {
          addLog(`❌ Doctor not found for: ${appt.doctor} (appt ${apptDoc.id})`);
          continue;
        }

        const doctor = docSnap.docs[0];

        // Update appointment
        await updateDoc(doc(db, "appointments", apptDoc.id), {
          doctorEmployeeId: doctor.id,
          doctorOfficialName: doctor.data().name,
        });

        addLog(`✔ Updated appointment ${apptDoc.id} → doctorEmployeeId = ${doctor.id}`);
      }

      addLog("🎉 Migration completed successfully!");
    } catch (err) {
      addLog("❌ Error: " + err.message);
    }

    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6">
      <h1 className="text-3xl font-bold mb-4">Fix Appointments Migration</h1>

      <p className="text-gray-400 mb-6">
        This tool updates all appointments to include the missing
        <span className="text-blue-400 font-semibold"> doctorEmployeeId </span>
        and
        <span className="text-blue-400 font-semibold"> doctorOfficialName </span>
        fields.
      </p>

      <button
        onClick={fixAppointments}
        disabled={running}
        className="px-6 py-3 bg-blue-600 disabled:bg-gray-600 rounded-lg font-semibold"
      >
        {running ? "Running Migration..." : "Run Migration"}
      </button>

      <div className="mt-6 bg-[#132338] p-4 rounded-lg max-h-96 overflow-auto border border-gray-700">
        <h2 className="text-lg font-semibold mb-2">Logs</h2>
        {log.map((line, i) => (
          <p key={i} className="text-sm border-b border-gray-800 py-1">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

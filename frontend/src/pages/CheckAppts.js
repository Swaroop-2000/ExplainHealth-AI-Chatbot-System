
import { db } from "./firebase.js";
import { collection, getDocs } from "firebase/firestore";

async function checkAppts() {
  const snap = await getDocs(collection(db, "appointments"));
  console.log("Total Appointments:", snap.size);
  snap.docs.forEach(d => {
    console.log(d.id, d.data().patientName, d.data().status);
  });
}

checkAppts();

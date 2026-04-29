// src/firebaseClient.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Replace the following config object with your Firebase project's web config.
 * You can find it in Firebase console -> Project settings -> SDK setup and config.
 */
const firebaseConfig = {
  apiKey: "AIzaSyASPhYJM_iPfrSad_0g9cx-BgJsb_13RlI",
  authDomain: "eye-disease-prediction-5b87a.firebaseapp.com",
  databaseURL: "https://eye-disease-prediction-5b87a-default-rtdb.firebaseio.com",
  projectId: "eye-disease-prediction-5b87a",
  storageBucket: "eye-disease-prediction-5b87a.firebasestorage.app",
  messagingSenderId: "674297555728",
  appId: "1:674297555728:web:e6ad856920729c9fab5395",
  measurementId: "G-FM8WP515BB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;

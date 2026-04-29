// Import Firebase modules
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getFunctions } from "firebase/functions";

// Your Firebase config
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

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);
export const functions = getFunctions(app, "us-central1");

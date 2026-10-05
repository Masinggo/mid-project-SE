import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // Modul baru untuk Login

const firebaseConfig = {
  apiKey: "AIzaSyDwiXJ8DjV7-4ykvW5udEQP21WZ41kzLCo",
  authDomain: "pemantaugizimahasiswa.firebaseapp.com",
  projectId: "pemantaugizimahasiswa",
  storageBucket: "pemantaugizimahasiswa.firebasestorage.app",
  messagingSenderId: "52195013311",
  appId: "1:52195013311:web:5a693dfbc6adef23a4cc0a",
  measurementId: "G-R64WYWQPSF"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app); // Ekspor modul auth agar bisa dipakai
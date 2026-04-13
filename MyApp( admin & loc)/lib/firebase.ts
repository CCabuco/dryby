import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const requiredConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const missingKeys = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const FIREBASE_CONFIG_READY = missingKeys.length === 0;
export const FIREBASE_MISSING_KEYS = missingKeys;

const firebaseConfig = {
  apiKey: requiredConfig.apiKey || "demo-api-key",
  authDomain: requiredConfig.authDomain || "demo-project.firebaseapp.com",
  projectId: requiredConfig.projectId || "demo-project-id",
  storageBucket: requiredConfig.storageBucket || "demo-project.firebasestorage.app",
  messagingSenderId: requiredConfig.messagingSenderId || "000000000000",
  appId: requiredConfig.appId || "1:000000000000:web:demoappid",
};

if (!FIREBASE_CONFIG_READY) {
  console.warn(
    `Firebase config missing: ${FIREBASE_MISSING_KEYS.join(", ")}. Running with demo placeholders until EXPO_PUBLIC_FIREBASE_* values are set.`
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;

import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

// Import both standard Auth (for Web) and Initialize Auth (for Mobile)
import { getAuth, initializeAuth } from "firebase/auth";
// @ts-ignore - Firebase's TypeScript definitions are missing this, but it exists at runtime.
import { getReactNativePersistence } from "firebase/auth";

// Your NEW Driver config!
const firebaseConfig = {
  apiKey: "AIzaSyD6NhDKs-cHC7lcyZr8_6dyt6uLXx5yXVs",
  authDomain: "dryby-fi.firebaseapp.com",
  projectId: "dryby-fi",
  storageBucket: "dryby-fi.firebasestorage.app",
  messagingSenderId: "1015853400258",
  appId: "1:1015853400258:web:82a19558a976c9ab4a3b5b",
};

const app = initializeApp(firebaseConfig);

let auth: any;

// The "Shield": Tell Firebase to use Web rules on the Web, and Mobile rules on the phone
if (Platform.OS === "web") {
  auth = getAuth(app); // Standard Web Auth to prevent browser crashes
} else {
  // Initialize Auth with AsyncStorage so the driver stays logged in on their phone
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { auth };
export const db = getFirestore(app);

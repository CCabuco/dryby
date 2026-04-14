import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    if (!rawKey) {
      continue;
    }
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
      continue;
    }
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      parsed[rawKey] = "true";
      continue;
    }
    parsed[rawKey] = nextValue;
    index += 1;
  }
  return parsed;
}

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFromFile(path.join(projectRoot, ".env"));

const args = parseArgs(process.argv.slice(2));
const email = (args.email || "admin@dryby.local").trim().toLowerCase();
const password = (args.password || "").trim();
const fullName = (args.name || "admin").trim();

if (!password) {
  console.error("Missing password. Use --password <value>.");
  process.exit(1);
}

const requiredConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(requiredConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`Missing Firebase config: ${missing.join(", ")}`);
  process.exit(1);
}

const app = initializeApp(requiredConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function ensureAdmin() {
  let credential;
  let created = false;

  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
    created = true;
  } catch (error) {
    if (error?.code === "auth/email-already-in-use") {
      credential = await signInWithEmailAndPassword(auth, email, password);
    } else {
      throw error;
    }
  }

  const uid = credential.user.uid;
  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      email,
      fullName,
      role: "admin",
      authProvider: "password",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  console.log(created ? `Created admin user: ${email}` : `Updated existing user as admin: ${email}`);
  console.log(`UID: ${uid}`);
}

ensureAdmin().catch((error) => {
  console.error("Failed to bootstrap admin user.");
  console.error(error?.message || error);
  process.exit(1);
});

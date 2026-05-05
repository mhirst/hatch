import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

// Firebase config is read from build-time env vars. Set these via .env.local
// before running `npm run build`. Leaving them blank disables auth — the
// daemon will run in single-user dev mode (it only listens on 127.0.0.1).
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;

export function authEnabled() {
  return Boolean(config.apiKey && config.projectId);
}

function ensureAuth(): Auth {
  if (!_auth) {
    if (!authEnabled()) {
      throw new Error(
        "Firebase is not configured — set VITE_FIREBASE_* in .env.local",
      );
    }
    _app = initializeApp(config);
    _auth = getAuth(_app);
  }
  return _auth;
}

export function watchUser(cb: (u: User | null) => void) {
  if (!authEnabled()) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(ensureAuth(), cb);
}

export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(ensureAuth(), provider);
  return result.user;
}

export async function signOutUser() {
  if (authEnabled()) await signOut(ensureAuth());
}

export async function idToken(): Promise<string | null> {
  if (!authEnabled()) return null;
  const u = ensureAuth().currentUser;
  if (!u) return null;
  return u.getIdToken();
}

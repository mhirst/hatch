/// <reference types="vite/client" />
import type { HatchBridge } from "../preload";

declare global {
  interface Window {
    /** Exposed by the Electron preload. Undefined when running in pure-web mode. */
    hatch?: HatchBridge;
  }
}

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

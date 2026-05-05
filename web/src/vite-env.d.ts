/// <reference types="vite/client" />

// `window.hatch` is provided by the Electron preload. In pure-web builds it's
// always undefined; we shape it as the same minimal interface the desktop
// build exposes so optional-chain access (`window.hatch?.on....`) type-checks
// cleanly in both modes.
declare global {
  interface HatchBridgeShim {
    settings: {
      get: () => Promise<unknown>;
      set: (patch: unknown) => Promise<void>;
    };
    dialog: {
      pickFolder: () => Promise<string | null>;
    };
    shell: {
      openLogs: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
    on: {
      deeplinkDeploy: (cb: (p: { path: string; name: string }) => void) => () => void;
    };
  }
  interface Window {
    hatch?: HatchBridgeShim;
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

// Make this file a module so `declare global` augments instead of replacing.
export {};

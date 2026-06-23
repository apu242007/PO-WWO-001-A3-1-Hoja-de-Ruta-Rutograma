/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE?: string;
  readonly VITE_POWER_AUTOMATE_URL?: string;
  readonly VITE_TACKER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

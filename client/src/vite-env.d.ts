/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Seedance Express proxy (set to your Render URL in production builds, e.g. https://your-service.onrender.com) */
  readonly VITE_API_BASE?: string;
  /** Z.AI Open Platform — never commit real keys */
  readonly VITE_ZAI_API_KEY: string;
  readonly VITE_ZAI_MODEL?: string;
  /** Override only if Z.AI documents a different host (default: https://api.z.ai/api/paas/v4) */
  readonly VITE_ZAI_BASE_URL?: string;
  readonly VITE_BUTTERBASE_API_URL: string;
  readonly VITE_BUTTERBASE_APP_ID: string;
  readonly VITE_BUTTERBASE_DEV_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

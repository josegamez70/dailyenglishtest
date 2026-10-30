/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

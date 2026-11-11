// Public browser configuration retained from the supplied project. No service-role key.
export const projectConfig = {
  url: "https://gybksasoembmgdevogpv.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5YmtzYXNvZW1ibWdkZXZvZ3B2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzEyNjIsImV4cCI6MjA5NzM0NzI2Mn0.U0QFX7WS9ETbV0JmMYe-VNZhErJAPtZxwEBASep7AA4",
} as const;

// Sub-path the site is served from: "" on Netlify or a custom domain,
// "/muwajjah-app" on GitHub Pages (set at build time with BASE_PATH).
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// Absolute URL inside the app, e.g. for Supabase auth redirects.
export const appUrl = (path: string) => location.origin + BASE + path;

// Optional public contact for privacy/account requests. Leave empty to hide it.
export const CONTACT_EMAIL = "";

// The "preview" bar is retired: who can open the site is now the owner's
// private/public switch (Admin > Access, database/011).
export const PREVIEW = false;

// Sign-in is Google only (students and team). The owner grants team access by
// the Google account's email from Admin > Team. Password reset links still work.
export const GOOGLE_ONLY = true;

// Google Analytics 4 Measurement ID (public, e.g. "G-XXXXXXXXXX"). Empty = off.
export const GA_ID = "G-9EV7JD2S2Y";

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

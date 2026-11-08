import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // "/" for Netlify; the GitHub Pages workflow sets BASE_PATH=/muwajjah-app/.
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: ["terminal.local"],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});

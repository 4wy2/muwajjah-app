import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// One launch switch for the whole site, set at build time:
//   LAUNCH=1  → no "preview" bar, search engines allowed (robots).
//   otherwise → preview bar shown, noindex + robots.txt "Disallow: /".
// On GitHub Pages it comes from the repository variable LAUNCH.
const launch = process.env.LAUNCH === "1";
// Absolute site address, used for the link-preview image.
const siteUrl = (process.env.SITE_URL || "https://4wy2.github.io/muwajjah-app/").replace(/\/?$/, "/");

function launchSwitch(): Plugin {
  return {
    name: "muwajjah-launch-switch",
    transformIndexHtml(html) {
      const robots = launch ? "" : '<meta name="robots" content="noindex, nofollow" />';
      return html.replace("<!--ROBOTS-->", robots).replaceAll("%SITE_URL%", siteUrl);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: launch
          ? "User-agent: *\nAllow: /\nSitemap: " + siteUrl + "sitemap.xml\n"
          : "User-agent: *\nDisallow: /\n",
      });
      if (!launch) return;
      // Published universities (refresh scripts/sitemap-universities.json when
      // a university is added or removed).
      const ids: string[] = JSON.parse(readFileSync("scripts/sitemap-universities.json", "utf8"));
      const urls = ["", "privacy", "terms", ...ids.map((id) => "universities/" + id)];
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          urls.map((u) => "  <url><loc>" + siteUrl + u + "</loc></url>").join("\n") +
          "\n</urlset>\n",
      });
    },
  };
}

export default defineConfig({
  // "/" for Netlify; the GitHub Pages workflow sets BASE_PATH=/muwajjah-app/.
  base: process.env.BASE_PATH || "/",
  plugins: [react(), launchSwitch()],
  define: {
    __LAUNCH__: JSON.stringify(launch),
    // New deploy = new browser cache, so visitors never mix two versions.
    __BUILD_ID__: JSON.stringify(String(Date.now())),
  },
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

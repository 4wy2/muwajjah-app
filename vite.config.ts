import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// One launch switch for the whole site, set at build time:
//   LAUNCH=1  → no "preview" bar, search engines allowed (robots).
//   otherwise → preview bar shown, noindex + robots.txt "Disallow: /".
// On GitHub Pages it comes from the repository variable LAUNCH.
const launch = process.env.LAUNCH === "1";
// Absolute site address, used for the link-preview image.
const siteUrl = (process.env.SITE_URL || "https://4wy2.github.io/muwajjah-app/").replace(/\/?$/, "/");


type Uni = {
  name: string;
  city?: string;
  region?: string;
  type?: string;
  website?: string;
  housing?: string;
  about?: string;
  programs?: { c: string; n: string; d: string; g: string }[] | null;
  tracks?: { n: string; g: string; s: number; a: number; c: number }[] | null;
  sections?: { t: string; x: string }[] | null;
};
const esc = (t: string) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Owner-written text may carry light markdown; plain words are enough here.
const plain = (t: string) => esc(String(t ?? "").replace(/[*_#>`]+/g, "").replace(/\s+/g, " ").trim());
const shown = (v?: string) => (v && !/^غير (محدد|مذكور)/.test(v) ? v : "");
const HOUSING: Record<string, string> = {
  male_only: "يوجد سكن للطلاب فقط",
  female_only: "يوجد سكن للطالبات فقط",
  both: "يوجد سكن للطلاب والطالبات",
  available: "يوجد سكن",
  limited: "يوجد سكن بشروط",
  unavailable: "لا يوجد سكن",
};
// The university's content as simple HTML: what a search engine reads before
// the app loads, and what a visitor sees for a moment on a slow phone.
function staticPage(u: Uni, site: string): string {
  const parts: string[] = [];
  parts.push('<main class="seo-static"><nav><a href="' + site + '">دليل الجامعات</a></nav>');
  parts.push("<h1>" + esc(u.name) + "</h1>");
  if (u.city || u.region) parts.push("<p>" + esc([u.city, u.region].filter(Boolean).join("، ")) + "</p>");
  if (u.about) parts.push("<p>" + plain(u.about) + "</p>");
  const tracks = (u.tracks || []).filter((t) => Number(t.s) + Number(t.a) + Number(t.c) === 100);
  if (tracks.length) {
    parts.push("<h2>النسبة الموزونة</h2><ul>");
    for (const t of tracks) {
      const w = [
        Number(t.s) ? "الثانوية " + Number(t.s) + "%" : "",
        Number(t.a) ? "القدرات " + Number(t.a) + "%" : "",
        Number(t.c) ? "التحصيلي " + Number(t.c) + "%" : "",
      ].filter(Boolean).join("، ");
      parts.push("<li>" + esc(t.n) + (shown(t.g) ? " (" + esc(t.g) + ")" : "") + ": " + w + "</li>");
    }
    parts.push("</ul>");
  }
  const programs = u.programs || [];
  if (programs.length) {
    parts.push("<h2>التخصصات</h2>");
    const byCollege = new Map<string, typeof programs>();
    for (const p of programs) {
      const k = p.c || "تخصصات أخرى";
      if (!byCollege.has(k)) byCollege.set(k, []);
      byCollege.get(k)!.push(p);
    }
    for (const [college, list] of byCollege) {
      parts.push("<h3>" + esc(college) + "</h3><ul>");
      for (const p of list) {
        const extra = [shown(p.d), p.g === "طلاب" || p.g === "طالبات" ? p.g : ""].filter(Boolean).join("، ");
        parts.push("<li>" + esc(p.n) + (extra ? " (" + esc(extra) + ")" : "") + "</li>");
      }
      parts.push("</ul>");
    }
  }
  if (u.housing && HOUSING[u.housing]) parts.push("<h2>السكن الجامعي</h2><p>" + HOUSING[u.housing] + "</p>");
  for (const sec of u.sections || []) {
    if (!sec.x) continue;
    parts.push("<h2>" + esc(sec.t) + "</h2><p>" + plain(sec.x) + "</p>");
  }
  parts.push("</main>");
  return parts.join("");
}

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
      const ids = Object.keys(JSON.parse(readFileSync("scripts/university-content.json", "utf8")));
      const today = new Date().toISOString().slice(0, 10);
      const urls = ["", "privacy", "terms", ...ids.map((id) => "universities/" + id)];
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          urls.map((u) => "  <url><loc>" + siteUrl + u + "</loc><lastmod>" + today + "</lastmod></url>").join("\n") +
          "\n</urlset>\n",
      });
    },
    // Link previews and search engines: WhatsApp, Telegram and Google's first
    // pass do not run the app, so each university gets its own copy of
    // index.html with a title, description, canonical link and structured data.
    // With PUBLIC=1 the page also carries the university's content as plain
    // HTML (the app replaces it once it loads). Leave PUBLIC unset while the
    // site is private, so nothing is readable before launch.
    // Netlify serves universities/<id>.html for /universities/<id> first.
    writeBundle(options) {
      if (!launch) return;
      const out = options.dir || "dist";
      const base = readFileSync(join(out, "index.html"), "utf8");
      const data: Record<string, Uni> = JSON.parse(readFileSync("scripts/university-content.json", "utf8"));
      const logos = new Set(
        existsSync(join(out, "logos")) ? readdirSync(join(out, "logos")).map((f) => f.replace(/\.png$/, "")) : [],
      );
      const pub = process.env.PUBLIC === "1";
      mkdirSync(join(out, "universities"), { recursive: true });
      for (const [id, u] of Object.entries(data)) {
        const url = siteUrl + "universities/" + id;
        const title = u.name + ": التخصصات والنسبة الموزونة وشروط القبول | مُوجّه";
        const n = (u.programs || []).length;
        const desc =
          "تخصصات " + u.name + (n ? " (" + n + " تخصص)" : "") +
          "، النسبة الموزونة لكل مسار، شروط القبول والسكن" + (u.city ? " في " + u.city : "") + ".";
        const ld = {
          "@context": "https://schema.org",
          "@type": "CollegeOrUniversity",
          name: u.name,
          url,
          ...(u.website ? { sameAs: [u.website] } : {}),
          ...(logos.has(id) ? { logo: siteUrl + "logos/" + id + ".png" } : {}),
          address: { "@type": "PostalAddress", addressLocality: u.city || undefined, addressRegion: u.region || undefined, addressCountry: "SA" },
        };
        let html = base
          .replace(/<title>[^<]*<\/title>/, "<title>" + esc(title) + "</title>")
          .replace(/(<meta property="og:title" content=")[^"]*"/, "$1" + esc(title) + '"')
          .replace(/(<meta\s+name="description"\s+content=")[^"]*"/, "$1" + esc(desc) + '"')
          .replace(/(<meta\s+property="og:description"\s+content=")[^"]*"/, "$1" + esc(desc) + '"')
          .replace(
            '<meta property="og:type" content="website" />',
            '<meta property="og:type" content="website" />\n    <meta property="og:url" content="' + url + '" />' +
              '\n    <link rel="canonical" href="' + url + '" />' +
              '\n    <script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>",
          );
        if (pub) html = html.replace('<div id="root"></div>', '<div id="root">' + staticPage(u, siteUrl) + "</div>");
        writeFileSync(join(out, "universities", id + ".html"), html);
      }
      // The home page lists every university as plain links, so a crawler
      // finds them without running the app.
      if (pub) {
        const list = Object.entries(data)
          .map(([id, u]) => '<li><a href="' + siteUrl + "universities/" + id + '">' + esc(u.name) + "</a>" + (u.city ? " — " + esc(u.city) : "") + "</li>")
          .join("");
        writeFileSync(
          join(out, "index.html"),
          base.replace('<div id="root"></div>', '<div id="root"><main class="seo-static"><h1>دليل الجامعات السعودية</h1><ul>' + list + "</ul></main></div>"),
        );
      }
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

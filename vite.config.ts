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
// Readable addresses, read from the app's own list (src/lib/slugs.ts).
const SLUGS: Record<string, string> = Object.fromEntries(
  [...readFileSync("src/lib/slugs.ts", "utf8").matchAll(/"([0-9a-f-]{36})":\s*"([a-z0-9-]+)"/g)].map((m) => [m[1], m[2]]),
);
const slugOf = (id: string) => SLUGS[id] || id;
type Topic = "programs" | "admission";
const usableTracks = (u: Uni) => (u.tracks || []).filter((t) => Number(t.s) + Number(t.a) + Number(t.c) === 100);
const admissionSections = (u: Uni) =>
  (u.sections || []).filter((x) => x.x && /قبول|موزونة|التنافسية/.test(x.t));
// The university's content as simple HTML: what a search engine reads before
// the app loads, and what a visitor sees for a moment on a slow phone.
function staticPage(u: Uni, site: string, id: string, topic?: Topic): string {
  const parts: string[] = [];
  const full = site + "universities/" + slugOf(id);
  parts.push('<main class="seo-static"><nav><a href="' + site + '">دليل الجامعات</a>' + (topic ? ' / <a href="' + full + '">' + esc(u.name) + "</a>" : "") + "</nav>");
  parts.push(
    "<h1>" +
      esc(topic === "programs" ? "تخصصات " + u.name + " للطلاب والطالبات" : topic === "admission" ? "النسبة الموزونة وشروط القبول في " + u.name : u.name) +
      "</h1>",
  );
  const want = (k: "about" | "tracks" | "programs" | "housing" | "sections" | "admissionText") =>
    !topic ||
    (topic === "programs" && k === "programs") ||
    (topic === "admission" && (k === "tracks" || k === "admissionText"));
  if (u.city || u.region) parts.push("<p>" + esc([u.city, u.region].filter(Boolean).join("، ")) + "</p>");
  if (want("about") && u.about) parts.push("<p>" + plain(u.about) + "</p>");
  const tracks = usableTracks(u);
  if (want("tracks") && tracks.length) {
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
  if (want("programs") && programs.length) {
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
  if (topic === "admission")
    for (const sec of admissionSections(u)) parts.push("<h2>" + esc(sec.t) + "</h2><p>" + plain(sec.x) + "</p>");
  if (want("housing") && u.housing && HOUSING[u.housing]) parts.push("<h2>السكن الجامعي</h2><p>" + HOUSING[u.housing] + "</p>");
  for (const sec of want("sections") ? u.sections || [] : []) {
    if (!sec.x) continue;
    parts.push("<h2>" + esc(sec.t) + "</h2><p>" + plain(sec.x) + "</p>");
  }
  if (!topic) {
    const more: string[] = [];
    if (programs.length) more.push('<li><a href="' + site + "programs/" + slugOf(id) + '">تخصصات ' + esc(u.name) + "</a></li>");
    if (tracks.length || admissionSections(u).length)
      more.push('<li><a href="' + site + "admission/" + slugOf(id) + '">النسبة الموزونة وشروط القبول في ' + esc(u.name) + "</a></li>");
    if (more.length) parts.push("<h2>صفحات أخرى</h2><ul>" + more.join("") + "</ul>");
  } else parts.push('<p><a href="' + full + '">كل معلومات ' + esc(u.name) + "</a></p>");
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
      const all: Record<string, Uni> = JSON.parse(readFileSync("scripts/university-content.json", "utf8"));
      const today = new Date().toISOString().slice(0, 10);
      const urls = ["", "privacy", "terms"];
      for (const [id, u] of Object.entries(all)) {
        urls.push("universities/" + slugOf(id));
        if ((u.programs || []).length) urls.push("programs/" + slugOf(id));
        if (usableTracks(u).length || admissionSections(u).length) urls.push("admission/" + slugOf(id));
      }
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
    // The page also carries the university's content as plain HTML (the app
    // replaces it once it loads). While the site is private the app adds
    // "noindex", so search engines keep out until the owner opens the site.
    // PUBLIC=0 leaves the content out.
    // Netlify serves universities/<id>.html for /universities/<id> first.
    writeBundle(options) {
      if (!launch) return;
      const out = options.dir || "dist";
      const base = readFileSync(join(out, "index.html"), "utf8");
      const data: Record<string, Uni> = JSON.parse(readFileSync("scripts/university-content.json", "utf8"));
      const logos = new Set(
        existsSync(join(out, "logos")) ? readdirSync(join(out, "logos")).map((f) => f.replace(/\.png$/, "")) : [],
      );
      const pub = process.env.PUBLIC !== "0";
      mkdirSync(join(out, "universities"), { recursive: true });
      const page = (id: string, u: Uni, topic?: Topic) => {
        const path = (topic ? topic + "/" : "universities/") + slugOf(id);
        const url = siteUrl + path;
        const n = (u.programs || []).length;
        const title =
          topic === "programs"
            ? "تخصصات " + u.name + " للطلاب والطالبات | مُوجّه"
            : topic === "admission"
              ? "النسبة الموزونة وشروط القبول في " + u.name + " | مُوجّه"
              : u.name + ": التخصصات والنسبة الموزونة وشروط القبول | مُوجّه";
        const desc =
          topic === "programs"
            ? n + " تخصص في " + u.name + " مقسمة على الكليات، مع الدرجة (بكالوريوس أو دبلوم) والتخصصات الخاصة بالطلاب أو الطالبات."
            : topic === "admission"
              ? "أوزان الثانوية والقدرات والتحصيلي لكل مسار قبول في " + u.name + "، وشروط القبول."
              : "تخصصات " + u.name + (n ? " (" + n + " تخصص)" : "") + "، النسبة الموزونة لكل مسار، شروط القبول والسكن" + (u.city ? " في " + u.city : "") + ".";
        const ld = {
          "@context": "https://schema.org",
          "@type": "CollegeOrUniversity",
          name: u.name,
          url: siteUrl + "universities/" + slugOf(id),
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
        if (pub) html = html.replace('<div id="root"></div>', '<div id="root">' + staticPage(u, siteUrl, id, topic) + "</div>");
        mkdirSync(join(out, topic || "universities"), { recursive: true });
        writeFileSync(join(out, path + ".html"), html);
      };
      const redirects: string[] = [];
      for (const [id, u] of Object.entries(data)) {
        page(id, u);
        if ((u.programs || []).length) page(id, u, "programs");
        if (usableTracks(u).length || admissionSections(u).length) page(id, u, "admission");
        // Old id addresses move to the readable one.
        if (SLUGS[id]) redirects.push("/universities/" + id + "  /universities/" + SLUGS[id] + "  301");
      }
      // Redirects go before the app's catch-all rule.
      const rp = join(out, "_redirects");
      if (existsSync(rp)) writeFileSync(rp, redirects.join("\n") + "\n" + readFileSync(rp, "utf8"));
      // The home page lists every university as plain links, so a crawler
      // finds them without running the app (PUBLIC=0 leaves them out).
      if (pub) {
        const list = Object.entries(data)
          .map(([id, u]) => '<li><a href="' + siteUrl + "universities/" + slugOf(id) + '">' + esc(u.name) + "</a>" + (u.city ? " — " + esc(u.city) : "") + "</li>")
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

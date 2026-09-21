// 🗺️ Sitemap & Discovery — serves /sitemap.xml, /robots.txt, /llms.txt so crawlers (and LLMs) can find
// the published catalog. One function, routed by ?kind= (see vercel.json rewrites). Reads published
// stories with the public anon key (RLS already exposes status=published). Per-story URLs use the
// canonical /s/<id> deep link (see api/share.js + the App.jsx deep-link handler).

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;

const xmlEscape = (s = "") => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

async function publishedStories() {
  if (!SB_URL || !SB_ANON) return [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/stories?status=eq.published&select=id,title,tagline,logline,updated_at&order=updated_at.desc&limit=5000`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export default async function handler(req, res) {
  const kind = (req.query && req.query.kind) || "sitemap";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "mangaverse-deploy.vercel.app";
  const base = `https://${host}`;
  const stories = await publishedStories();

  if (kind === "robots") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(`User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  }

  if (kind === "llms") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    const lines = [
      `# MangaMultiVerse`,
      ``,
      `> An AI manga creation + reading platform. Users generate multi-chapter manga (story, script, characters, panels, voices), publish them, and read them with per-chapter translation.`,
      ``,
      `## Published stories`,
      ...stories.map((s) => `- [${(s.title || "Untitled").replace(/\n/g, " ")}](${base}/s/${s.id})${s.tagline ? ` — ${String(s.tagline).replace(/\n/g, " ").slice(0, 140)}` : ""}`),
    ];
    return res.status(200).send(lines.join("\n") + "\n");
  }

  // default: sitemap.xml
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  const urls = [
    { loc: `${base}/`, lastmod: null },
    ...stories.map((s) => ({ loc: `${base}/s/${s.id}`, lastmod: s.updated_at ? String(s.updated_at).slice(0, 10) : null })),
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;
  return res.status(200).send(body);
}

export const config = { api: { bodyParser: false } };

// 🔍 SEO prerender surface — serves /s/<id> (see vercel.json) as the app's index.html with per-story
// OpenGraph/meta tags injected into <head>. This is what makes the SEO agent more than report-only: a
// crawler or social unfurl hitting /s/<id> gets a real title/description for THAT story, while a human's
// browser still boots the SPA (the App.jsx deep-link handler reads the id from the path and opens it).

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;

const esc = (s = "") => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

async function getStory(id) {
  if (!SB_URL || !SB_ANON || !id) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&status=eq.published&select=id,title,tagline,logline&limit=1`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || "";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "mangaverse-deploy.vercel.app";
  const base = `https://${host}`;

  // Fetch the built SPA shell to serve as the base document.
  let html = "";
  try {
    const r = await fetch(`${base}/index.html`, { headers: { "x-mv-prerender": "1" } });
    html = await r.text();
  } catch { /* fall through to a minimal shell below */ }

  const story = await getStory(id);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600");

  if (!html) {
    // Couldn't fetch the shell — return a minimal valid page so the crawler still gets meta.
    const t = story ? `${story.title} · MangaMultiVerse` : "MangaMultiVerse";
    return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t)}</title></head><body><a href="/">Open MangaMultiVerse</a></body></html>`);
  }

  if (!story) return res.status(200).send(html); // unknown/unpublished id → plain SPA

  const title = `${story.title || "Untitled"} · MangaMultiVerse`;
  const desc = (story.tagline || story.logline || "Read this AI-created manga on MangaMultiVerse.").toString().replace(/\s+/g, " ").slice(0, 200);
  const url = `${base}/s/${story.id}`;
  const meta = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="MangaMultiVerse">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
  ].join("\n    ");

  // Drop the shell's existing <title>, <meta name="description">, and any og:/twitter: tags so ours are
  // the only ones the crawler sees, then inject the per-story block before </head>.
  const injected = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']*|twitter:[^"']*)["'][^>]*>/gi, "")
    .replace(/<\/head>/i, `    ${meta}\n  </head>`);
  return res.status(200).send(injected);
}

export const config = { api: { bodyParser: false } };

import { useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { runMaintenance } from "../lib/supabase.js";
import { MAINTENANCE } from "../lib/agents.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// The Maintenance wing home. Phase 0: exercise the secured runner (api/maintenance.js)
// via selfcheck to show which capabilities are wired, and display the agent roadmap
// (from the registry) so the build order is visible.
export default function MaintenancePage({ token }) {
  const C = useTheme();
  const [checking, setChecking] = useState(false);
  const [res, setRes] = useState(null);
  const [spendBusy, setSpendBusy] = useState(false);
  const [spend, setSpend] = useState(null);

  const runSelfcheck = async () => {
    setChecking(true); setRes(null);
    setRes(await runMaintenance("selfcheck", token));
    setChecking(false);
  };

  const runSpend = async () => {
    setSpendBusy(true); setSpend(null);
    setSpend(await runMaintenance("spend_summary", token));
    setSpendBusy(false);
  };

  const [deployBusy, setDeployBusy] = useState(false);
  const [deploy, setDeploy] = useState(null);
  const runDeploy = async () => {
    setDeployBusy(true); setDeploy(null);
    setDeploy(await runMaintenance("deploy_check", token));
    setDeployBusy(false);
  };

  const [tamperBusy, setTamperBusy] = useState(false);
  const [tamper, setTamper] = useState(null);
  const runTamper = async () => {
    setTamperBusy(true); setTamper(null);
    setTamper(await runMaintenance("tamper_watch", token));
    setTamperBusy(false);
  };

  const [discoBusy, setDiscoBusy] = useState(false);
  const [disco, setDisco] = useState(null);
  const [seo, setSeo] = useState(null);
  const runDisco = async () => {
    setDiscoBusy(true); setDisco(null); setSeo(null);
    const [d, s] = await Promise.all([runMaintenance("discovery_check", token), runMaintenance("seo_audit", token)]);
    setDisco(d); setSeo(s); setDiscoBusy(false);
  };

  const [p1Busy, setP1Busy] = useState(false);
  const [p1, setP1] = useState(null);
  const runP1 = async () => {
    setP1Busy(true); setP1(null);
    const [uptime, links, catalog, integrity, posture] = await Promise.all([
      runMaintenance("uptime_check", token), runMaintenance("links_check", token),
      runMaintenance("catalog_check", token), runMaintenance("integrity_check", token),
      runMaintenance("posture_check", token),
    ]);
    setP1({ uptime, links, catalog, integrity, posture });
    setP1Busy(false);
  };

  const [p2Busy, setP2Busy] = useState(false);
  const [p2, setP2] = useState(null);
  const runP2 = async () => {
    setP2Busy(true); setP2(null);
    const [deps, a11y] = await Promise.all([runMaintenance("deps_check", token), runMaintenance("a11y_check", token)]);
    setP2({ deps, a11y });
    setP2Busy(false);
  };

  // 🛡️ Moderator · Approval Rail
  const [modBusy, setModBusy] = useState(false);
  const [mod, setMod] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const loadRail = async () => { setModBusy(true); setMod(await runMaintenance("review_list", token)); setModBusy(false); };
  const runScan = async () => { setScanBusy(true); await runMaintenance("publish_review", token); setScanBusy(false); await loadRail(); };
  const decide = async (story_id, decision) => { setDeciding(story_id + decision); await runMaintenance("review_decide", token, { story_id, decision }); setDeciding(null); await loadRail(); };

  const waveColor = { P0: "#e24b4a", P1: C.gold, P2: C.muted, P3: C.purple };
  const statusColor = { planned: C.muted, building: C.gold, live: C.teal };
  const Dot = ({ on, label }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: on ? C.teal : "#e24b4a", flexShrink: 0 }} />{label}
    </span>
  );

  const caps = res?.ok && res.result?.caps;
  const armed = res?.ok && res.result?.armed;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.pink})`, boxShadow: `0 0 8px ${C.purple}88` }} />
          <div style={{ fontSize: 11, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>Control Room · Maintenance</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text }}>🔧 Maintenance</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>The agents that keep the app healthy. Phase 0 (the secured runner) first — then the roadmap below.</div>
      </div>

      {/* Phase 0 runner status */}
      <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Phase 0 · Secured runner</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}><code>api/maintenance.js</code> — holds the service-role + provider keys the agents need.</div>
          </div>
          <Btn v="pri" onClick={runSelfcheck} disabled={checking} sx={{ fontSize: 12 }}>{checking ? <><Spinner size={13} /> Checking…</> : "▶ Run self-check"}</Btn>
        </div>

        {res && !res.ok && (
          <div style={{ padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text }}>
            Runner unreachable: {res.error}{res.status ? ` (HTTP ${res.status})` : ""}. In local dev this needs the API layer (<code>vercel dev</code>); in prod it needs an admin session.
          </div>
        )}

        {caps && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Tag c={armed ? C.teal : C.gold}>{armed ? "✓ Armed" : "Not armed yet"}</Tag>
              {!armed && <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>Add <code>SUPABASE_SERVICE_ROLE_KEY</code> + <code>CRON_SECRET</code> to Vercel to arm.</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
              <Dot on={caps.service_role_key} label="Service-role key" />
              <Dot on={caps.cron_secret} label="Cron secret" />
              <Dot on={caps.providers?.anthropic} label="Anthropic key" />
              <Dot on={caps.providers?.fal} label="Fal key" />
              <Dot on={caps.providers?.together} label="Together key" />
              <Dot on={caps.providers?.elevenlabs} label="ElevenLabs key" />
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>Service read past RLS: <b style={{ color: res.result.serviceRead === "ok" ? C.teal : C.gold }}>{res.result.serviceRead}</b> · runner responded in {res.ms}ms as <b>{res.actor}</b></div>
          </div>
        )}
      </div>

      {/* 💸 Spend Sentinel */}
      {(() => {
        const S = spend?.ok && spend.result;
        const statusColorMap = { ok: C.teal, warn: C.gold, alert: "#e24b4a" };
        const w = S?.windows;
        const Money = ({ v }) => <b style={{ color: C.text }}>${(Number(v) || 0).toFixed(4)}</b>;
        const Meter = ({ used, budget, label }) => {
          const pct = budget ? Math.min(100, Math.round((used / budget) * 100)) : 0;
          const col = pct >= 100 ? "#e24b4a" : pct >= (S?.budget?.warnAt || 0.7) * 100 ? C.gold : C.teal;
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.muted, marginBottom: 3 }}>
                <span>{label}</span><span><Money v={used} /> <span style={{ color: C.muted }}>/ ${budget}</span></span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: col }} />
              </div>
            </div>
          );
        };
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>💸 Spend Sentinel <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P0 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>AI spend per provider vs. budget + the Fal 429 rate. Runs hourly by cron; refresh on demand.</div>
              </div>
              <Btn v="pri" onClick={runSpend} disabled={spendBusy} sx={{ fontSize: 12 }}>{spendBusy ? <><Spinner size={13} /> Reading…</> : "▶ Refresh spend"}</Btn>
            </div>

            {spend && !spend.ok && (
              <div style={{ padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text }}>
                Couldn't read spend: {spend.error}{spend.status ? ` (HTTP ${spend.status})` : ""}. Needs the API layer (<code>vercel dev</code>) + an admin session.
              </div>
            )}

            {S && S.armed === false && (
              <div style={{ fontSize: 12.5, color: C.text }}><Tag c={C.gold}>Not armed</Tag> <span style={{ marginLeft: 8, color: C.muted }}>{S.note}</span></div>
            )}
            {S && S.armed && S.table === false && (
              <div style={{ fontSize: 12.5, color: C.text }}><Tag c={C.gold}>No ledger</Tag> <span style={{ marginLeft: 8, color: C.muted }}>{S.note}</span></div>
            )}

            {S && S.table && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Tag c={statusColorMap[S.status] || C.muted}>{S.status === "ok" ? "✓ Within budget" : S.status === "warn" ? "⚠ Approaching budget" : "🚨 Over budget"}</Tag>
                  {S.alerted && <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>alert sent to Mr. K inbox</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <Meter used={w["1h"].usd} budget={S.budget.hourlyUsd} label="Last hour" />
                  <Meter used={w["24h"].usd} budget={S.budget.dailyUsd} label="Last 24h" />
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>By provider (24h): {Object.keys(w["24h"].byProvider).length
                  ? Object.entries(w["24h"].byProvider).sort((a, b) => b[1] - a[1]).map(([p, v]) => <span key={p} style={{ marginRight: 12 }}>{p} <Money v={v} /></span>)
                  : <span>no spend yet</span>}</div>
                <div style={{ fontSize: 12, color: C.muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span>7d total <Money v={w["7d"].usd} /></span>
                  <span>Fal 429s: {S.fal429["1h"]}·1h / {S.fal429["24h"]}·24h · rate <b style={{ color: S.fal429.rate24h >= 0.3 ? C.gold : C.text }}>{Math.round(S.fal429.rate24h * 100)}%</b></span>
                  <span>{S.rowsConsidered} ledger rows · {spend.ms}ms</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 🚀 Deploy Sentinel */}
      {(() => {
        const D = deploy?.ok && deploy.result;
        const statusColorMap = { ok: C.teal, warn: C.gold, alert: "#e24b4a" };
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>🚀 Deploy Sentinel <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P0 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>The live deploy boots + every <code>api/*</code> proxy + Supabase respond. Runs on cron; alerts on failure.</div>
              </div>
              <Btn v="pri" onClick={runDeploy} disabled={deployBusy} sx={{ fontSize: 12 }}>{deployBusy ? <><Spinner size={13} /> Probing…</> : "▶ Check deploy"}</Btn>
            </div>

            {deploy && !deploy.ok && (
              <div style={{ padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text }}>
                Couldn't run the check: {deploy.error}{deploy.status ? ` (HTTP ${deploy.status})` : ""}. Needs the API layer (<code>vercel dev</code>) + an admin session.
              </div>
            )}

            {D && (
              <div>
                <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Tag c={statusColorMap[D.status] || C.muted}>{D.status === "ok" ? "✓ All healthy" : D.status === "warn" ? `⚠ ${D.down} proxy down` : `🚨 ${D.down} down`}</Tag>
                  <span style={{ fontSize: 11, color: C.muted }}>{D.base}</span>
                  {D.alerted && <span style={{ fontSize: 11, color: C.muted }}>· alert sent to Mr. K inbox</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                  {D.results.map((t) => (
                    <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.text }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.ok ? C.teal : "#e24b4a", flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{t.name}</span>
                      <span style={{ color: C.muted, fontSize: 11 }}>{t.status || "err"} · {t.ms}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 🔓 Credit-Tamper & Abuse Watch */}
      {(() => {
        const T = tamper?.ok && tamper.result;
        const f = T?.findings;
        const statusColorMap = { ok: C.teal, warn: C.gold, alert: "#e24b4a" };
        const Row = ({ label, value, bad }) => (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.text }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: bad ? "#e24b4a" : C.teal, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{label}</span>
            <span style={{ color: bad ? "#e24b4a" : C.muted, fontSize: 11.5, fontWeight: bad ? 600 : 400 }}>{value}</span>
          </div>
        );
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>🔓 Credit-Tamper &amp; Abuse Watch <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P0 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Over-grant balances, rogue admins, and signup bursts (the client-set-grant hole). Runs on cron.</div>
              </div>
              <Btn v="pri" onClick={runTamper} disabled={tamperBusy} sx={{ fontSize: 12 }}>{tamperBusy ? <><Spinner size={13} /> Scanning…</> : "▶ Scan accounts"}</Btn>
            </div>

            {tamper && !tamper.ok && (
              <div style={{ padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text }}>
                Couldn't scan: {tamper.error}{tamper.status ? ` (HTTP ${tamper.status})` : ""}. Needs the API layer (<code>vercel dev</code>) + an admin session.
              </div>
            )}

            {T && T.armed === false && (
              <div style={{ fontSize: 12.5, color: C.text }}><Tag c={C.gold}>Not armed</Tag> <span style={{ marginLeft: 8, color: C.muted }}>{T.note}</span></div>
            )}

            {T && T.armed && f && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Tag c={statusColorMap[T.status] || C.muted}>{T.status === "ok" ? "✓ No tampering found" : T.status === "warn" ? "⚠ Review needed" : "🚨 Tamper detected"}</Tag>
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{f.totalProfiles} accounts scanned · grant {f.grant}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8, marginBottom: f.overCredits?.length || T.remediation ? 12 : 0 }}>
                  <Row label={`Over-grant (> ${f.grant})`} value={f.overCredits.length} bad={f.overCredits.length > 0} />
                  <Row label="Negative credits" value={f.negative.length} bad={f.negative.length > 0} />
                  <Row label="Admin accounts" value={f.adminCount} bad={f.adminCount > 1} />
                  <Row label="Signups (24h)" value={f.recentSignups24h ?? "n/a"} bad={f.recentSignups24h != null && f.recentSignups24h > 20} />
                </div>
                {f.overCredits?.length > 0 && (
                  <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>Flagged: {f.overCredits.slice(0, 8).map((p) => <span key={p.id} style={{ marginRight: 10, color: "#e24b4a" }}>{p.username || p.email || p.id.slice(0, 8)} ({p.credits})</span>)}</div>
                )}
                {T.remediation && (
                  <div style={{ padding: "9px 12px", background: "#e24b4a14", border: "0.5px solid #e24b4a44", borderRadius: 9, fontSize: 11.5, color: C.text }}>🔧 {T.remediation}</div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 🔍🗺️ Discovery & SEO */}
      {(() => {
        const D = disco?.ok && disco.result;
        const S = seo?.ok && seo.result;
        const statusColorMap = { ok: C.teal, warn: C.gold, alert: "#e24b4a" };
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>🔍 SEO &amp; 🗺️ Discovery <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P0 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>sitemap.xml / robots.txt / llms.txt served + per-story OG coverage. <code>/s/&lt;id&gt;</code> unfurls each story.</div>
              </div>
              <Btn v="pri" onClick={runDisco} disabled={discoBusy} sx={{ fontSize: 12 }}>{discoBusy ? <><Spinner size={13} /> Checking…</> : "▶ Check discovery"}</Btn>
            </div>

            {(disco && !disco.ok) && (
              <div style={{ padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text }}>
                Couldn't run: {disco.error}{disco.status ? ` (HTTP ${disco.status})` : ""}. Needs the API layer (<code>vercel dev</code>) + an admin session.
              </div>
            )}

            {D && (
              <div style={{ marginBottom: S ? 14 : 0 }}>
                <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Tag c={statusColorMap[D.status] || C.muted}>{D.status === "ok" ? "✓ Discovery files served" : `⚠ ${D.down} file down`}</Tag>
                  {D.storyUrls != null && <span style={{ fontSize: 11, color: C.muted }}>{D.storyUrls} URL(s) in sitemap</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
                  {D.results.map((t) => (
                    <div key={t.path} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.text }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.ok ? C.teal : "#e24b4a", flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{t.path}</span>
                      <span style={{ color: C.muted, fontSize: 11 }}>{t.status || "err"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {S && S.armed !== false && (
              <div style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Tag c={statusColorMap[S.status] || C.muted}>SEO {S.coverage}% covered</Tag>
                  <span style={{ fontSize: 11.5, color: C.muted }}>{S.withMeta}/{S.total} published stories unfurl with title + description</span>
                </div>
                {S.thin?.length > 0 && (
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Thin meta: {S.thin.slice(0, 8).map((p) => <span key={p.id} style={{ marginRight: 10, color: C.gold }}>{p.title || p.id.slice(0, 8)}{!p.hasDesc ? " (no tagline)" : ""}</span>)}</div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Wave 2 · Internal health (P1) */}
      {(() => {
        const statusColorMap = { ok: C.teal, warn: C.gold, alert: "#e24b4a" };
        const metric = (id, r) => {
          if (!r) return "";
          if (r.armed === false) return "not armed";
          switch (id) {
            case "uptime": return `${r.live?.app?.ok && r.live?.supabase?.ok ? "prod up" : "PROD DOWN"} · synthesis ${r.synthesis?.ageDays ?? "n/a"}d`;
            case "links": return `${r.noCover?.length ?? 0} no-cover · ${r.noArt?.length ?? 0} no-art / ${r.total ?? 0}`;
            case "catalog": return `avg ${r.avgScore ?? "?"}/100 · ${r.total ?? 0} stories`;
            case "integrity": return `${(r.orphanTranslations ?? 0) + (r.orphanBibles ?? 0)} orphans · ${r.overCap?.length ?? 0} over-cap`;
            case "posture": return `${r.bundleLeaks?.length ?? 0} bundle · ${r.rlsLeaks?.length ?? 0} rls leak`;
            default: return "";
          }
        };
        const AGENTS = [
          ["uptime", "📡 Uptime Monitor"], ["links", "🩹 Broken-Link Checker"], ["catalog", "📚 Catalog Health"],
          ["integrity", "🧬 Data-Integrity"], ["posture", "🛡️ Security Posture"],
        ];
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Wave 2 · Internal health <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P1 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Uptime, dead assets, catalog quality, data integrity, and security posture. Uptime/integrity/posture also run on the daily cron.</div>
              </div>
              <Btn v="pri" onClick={runP1} disabled={p1Busy} sx={{ fontSize: 12 }}>{p1Busy ? <><Spinner size={13} /> Running…</> : "▶ Run P1 checks"}</Btn>
            </div>
            {p1 && (
              <div style={{ display: "grid", gap: 8 }}>
                {AGENTS.map(([id, name]) => {
                  const resp = p1[id];
                  const r = resp?.ok && resp.result;
                  const st = r?.status || (resp && !resp.ok ? "err" : "?");
                  const col = statusColorMap[st] || C.muted;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.text }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: st === "err" ? "#e24b4a" : col, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 500 }}>{name}</span>
                      <span style={{ color: C.muted, fontSize: 11.5 }}>{resp && !resp.ok ? (resp.error || "error") : metric(id, r)}</span>
                      <Tag c={col}>{st}</Tag>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Wave 3 · Hygiene (P2) */}
      {(() => {
        const statusColorMap = { ok: C.teal, warn: C.gold, alert: "#e24b4a" };
        const metric = (id, r) => {
          if (!r) return "";
          if (r.ok === false) return r.note || "error";
          if (id === "deps") return `${r.vulnerable?.length ?? 0} vuln / ${r.depCount ?? 0} deps · ${r.backup?.stories ?? "?"} stories`;
          if (id === "a11y") return r.failed?.length ? `missing: ${r.failed.join(", ")}` : "shell a11y ok";
          return "";
        };
        const AGENTS = [["deps", "📦 Dependency & Backup"], ["a11y", "♿ Accessibility & Alt-Text"]];
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Wave 3 · Hygiene <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P2 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Dependency vulnerabilities (OSV) + a data-volume snapshot, and a static accessibility audit. Deps also runs on the daily cron.</div>
              </div>
              <Btn v="pri" onClick={runP2} disabled={p2Busy} sx={{ fontSize: 12 }}>{p2Busy ? <><Spinner size={13} /> Running…</> : "▶ Run P2 checks"}</Btn>
            </div>
            {p2 && (
              <div style={{ display: "grid", gap: 8 }}>
                {AGENTS.map(([id, name]) => {
                  const resp = p2[id];
                  const r = resp?.ok && resp.result;
                  const st = r?.status || (resp && !resp.ok ? "err" : "?");
                  const col = statusColorMap[st] || C.muted;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.text }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: st === "err" ? "#e24b4a" : col, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: 500 }}>{name}</span>
                      <span style={{ color: C.muted, fontSize: 11.5 }}>{resp && !resp.ok ? (resp.error || "error") : metric(id, r)}</span>
                      <Tag c={col}>{st}</Tag>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 🛡️ Moderator · Approval Rail (Wave 4 / P3) */}
      {(() => {
        const M = mod?.ok && mod.result;
        const vColor = { ok: C.teal, warn: C.gold, alert: "#e24b4a", violation: "#e24b4a", borderline: C.gold, pending: C.muted };
        return (
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>🛡️ Moderator · Approval Rail <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 6 }}>P3 · live</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>New publishes reviewed vs the Content Policy. Violations auto-hidden; borderline / mis-rated queued here. Runs on the daily cron.</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={runScan} disabled={scanBusy} sx={{ fontSize: 12 }}>{scanBusy ? <><Spinner size={13} /> Scanning…</> : "▶ Scan new publishes"}</Btn>
                <Btn v="pri" onClick={loadRail} disabled={modBusy} sx={{ fontSize: 12 }}>{modBusy ? <><Spinner size={13} /> Loading…</> : "↻ Approval rail"}</Btn>
              </div>
            </div>

            {mod && !mod.ok && (
              <div style={{ padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text }}>
                Couldn't load: {mod.error}{mod.status ? ` (HTTP ${mod.status})` : ""}. Needs the API layer (<code>vercel dev</code>) + an admin session.
              </div>
            )}
            {M && M.armed === false && <div style={{ fontSize: 12.5, color: C.text }}><Tag c={C.gold}>Not armed</Tag> <span style={{ marginLeft: 8, color: C.muted }}>{M.note}</span></div>}
            {M && M.table === false && <div style={{ fontSize: 12.5, color: C.text }}><Tag c={C.gold}>No table</Tag> <span style={{ marginLeft: 8, color: C.muted }}>{M.note}</span></div>}

            {M && M.table && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Tag c={M.openCount ? "#e24b4a" : C.teal}>{M.openCount ? `${M.openCount} need${M.openCount === 1 ? "s" : ""} action` : "✓ Nothing to review"}</Tag>
                </div>
                {M.open?.length > 0 && (
                  <div style={{ display: "grid", gap: 8, marginBottom: M.recent?.length ? 14 : 0 }}>
                    {M.open.map((r) => (
                      <div key={r.story_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 10, flexWrap: "wrap" }}>
                        <Tag c={vColor[r.verdict] || C.muted}>{r.action === "auto_hidden" ? "auto-hidden" : r.verdict}</Tag>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>{r.title || r.story_id.slice(0, 10)}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{r.reason || "—"} · rated {r.rating || "teen"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn v="teal" onClick={() => decide(r.story_id, "approve")} disabled={!!deciding} sx={{ fontSize: 11, padding: "4px 10px" }}>{deciding === r.story_id + "approve" ? "…" : "✓ Approve"}</Btn>
                          <Btn onClick={() => decide(r.story_id, "hide")} disabled={!!deciding} sx={{ fontSize: 11, padding: "4px 10px", color: "#e24b4a", borderColor: "#e24b4a55" }}>{deciding === r.story_id + "hide" ? "…" : "🚫 Hide"}</Btn>
                          <Btn onClick={() => decide(r.story_id, "dismiss")} disabled={!!deciding} sx={{ fontSize: 11, padding: "4px 10px" }}>{deciding === r.story_id + "dismiss" ? "…" : "Dismiss"}</Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {M.recent?.length > 0 && (
                  <div style={{ fontSize: 11, color: C.muted }}>Recent: {M.recent.slice(0, 8).map((r) => <span key={r.story_id} style={{ marginRight: 10 }}>{r.title || r.story_id.slice(0, 8)} <span style={{ color: vColor[r.verdict] || C.muted }}>{r.status === "resolved" ? r.action : r.verdict}</span></span>)}</div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Roadmap */}
      {["P0", "P1", "P2", "P3"].map((wave) => {
        const items = MAINTENANCE.filter((m) => m.wave === wave);
        if (!items.length) return null;
        return (
          <div key={wave} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: waveColor[wave], fontWeight: 700 }}>{wave}</span>
              {wave === "P0" ? "Build first" : wave === "P1" ? "Ongoing health" : wave === "P2" ? "Hygiene / fast-follows" : "Autonomous + approval"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
              {items.map((m) => (
                <div key={m.id} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 14, borderLeft: `3px solid ${waveColor[wave]}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{m.icon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, flex: 1 }}>{m.name}</span>
                    <Tag c={statusColor[m.status]}>{m.status}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{m.blurb}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

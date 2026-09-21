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

  const waveColor = { P0: "#e24b4a", P1: C.gold, P2: C.muted };
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

      {/* Roadmap */}
      {["P0", "P1", "P2"].map((wave) => {
        const items = MAINTENANCE.filter((m) => m.wave === wave);
        if (!items.length) return null;
        return (
          <div key={wave} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: waveColor[wave], fontWeight: 700 }}>{wave}</span>
              {wave === "P0" ? "Build first" : wave === "P1" ? "Ongoing health" : "Hygiene / fast-follows"}
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

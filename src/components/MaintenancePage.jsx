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

  const runSelfcheck = async () => {
    setChecking(true); setRes(null);
    setRes(await runMaintenance("selfcheck", token));
    setChecking(false);
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

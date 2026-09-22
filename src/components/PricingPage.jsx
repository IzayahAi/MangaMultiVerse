import { useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { PLAN_TIERS, TOPUP_PACKS } from "../constants.js";
import { startCheckout, openBillingPortal } from "../lib/supabase.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// Pricing & subscriptions. Subscribe to a plan or buy a top-up pack → Stripe Checkout; the webhook
// grants credits. "Manage billing" opens the Stripe portal. Only shown at launch (RELEASE_MODE).
export default function PricingPage({ auth, onRequestAuth }) {
  const C = useTheme();
  const [busy, setBusy] = useState(null); // id being processed
  const [toast, setToast] = useState(null);
  const signedIn = !!(auth?.token && auth.token !== "demo");
  const currentPlan = auth?.user?.plan || "free";

  const go = async (kind, id) => {
    if (!signedIn) { onRequestAuth?.(); return; }
    setBusy(id); setToast(null);
    const res = kind === "portal" ? await openBillingPortal(auth.token) : await startCheckout(kind, id, auth.token);
    setBusy(null);
    if (res?.url) { window.location.href = res.url; return; }
    setToast(res?.error || "Something went wrong — please try again.");
  };

  const card = { background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 26 }}>
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text }}>Subscription</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Create more manga. Cancel anytime. Run out? Top up instantly.</div>
        {currentPlan !== "free" && signedIn && (
          <div style={{ marginTop: 12 }}>
            <Tag c={C.teal}>Current plan: {PLAN_TIERS.find((p) => p.id === currentPlan)?.name || currentPlan}</Tag>
            <button onClick={() => go("portal")} disabled={busy === "portal"} style={{ marginLeft: 10, fontSize: 12, padding: "5px 12px", borderRadius: 7, border: `0.5px solid ${C.border2}`, background: "transparent", color: C.text, cursor: "pointer", fontFamily: "inherit" }}>
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ maxWidth: 520, margin: "0 auto 18px", padding: "10px 14px", background: "#e24b4a18", border: "0.5px solid #e24b4a55", borderRadius: 10, fontSize: 12.5, color: C.text, textAlign: "center" }}>{toast}</div>
      )}

      {/* Subscription tiers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 30 }}>
        {PLAN_TIERS.map((p) => {
          const isCurrent = p.id === currentPlan;
          return (
            <div key={p.id} style={{ ...card, border: p.highlight ? `1px solid ${C.purple}` : card.border, boxShadow: p.highlight ? `0 0 0 1px ${C.purple}44` : "none" }}>
              {p.highlight && <Tag c={C.purple}>Most popular</Tag>}
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{p.name}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.text, marginTop: 4 }}>${p.priceUsd}<span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>{p.priceUsd ? " / mo" : ""}</span></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                {p.perks.map((perk, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.muted, display: "flex", gap: 7 }}><span style={{ color: C.teal }}>✓</span>{perk}</div>
                ))}
              </div>
              <Btn v={p.highlight ? "pri" : "soft"} onClick={() => go("subscription", p.id)} disabled={isCurrent || busy === p.id || p.id === "free"} sx={{ justifyContent: "center", fontSize: 13, padding: "10px 0" }}>
                {isCurrent ? "Current plan" : p.id === "free" ? "Free" : busy === p.id ? <><Spinner size={13} /> …</> : `Choose ${p.name}`}
              </Btn>
            </div>
          );
        })}
      </div>

      {/* Top-up packs */}
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>Need more? One-time top-ups (never expire)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        {TOPUP_PACKS.map((p) => (
          <div key={p.id} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.name}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "6px 0 12px" }}>${p.priceUsd}</div>
            <Btn v="soft" onClick={() => go("pack", p.id)} disabled={busy === p.id} sx={{ justifyContent: "center", fontSize: 12, padding: "8px 0", width: "100%" }}>
              {busy === p.id ? <><Spinner size={12} /> …</> : "Buy"}
            </Btn>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 22 }}>Secure checkout by Stripe · Prices in USD</div>
    </div>
  );
}

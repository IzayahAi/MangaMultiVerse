// Single source of truth for credit costs + limits, server-side (authoritative).
// v1 is a static module; the release upgrade is to read these from a `config` DB row so pricing can
// change with no redeploy (see the parked config-as-data note). The client mirrors only what it needs
// for display in src/constants.js — the SERVER value is what actually charges.

export const COSTS = {
  story: 4,        // full agent story build
  script: 5,       // chapter script
  char: 1,         // character design brief
  voices: 1,       // voice profiles
  panel: 1,        // one panel image (charged per rendered image)
  translate: 1,    // per language, per chapter
  voice_tts: 1,    // one audio clip
  lora: 5,         // character LoRA training
  brain: 0,        // admin Brain calls — free (admin-only)
  free: 0,         // retries / failover / status polls within one already-charged action
  misc: 1,
};

export const LIMITS = {
  maxLanguagesPerPublish: 12,
};

// ── 💸 Spend Sentinel: ESTIMATED provider $ per action (US dollars). These are rough per-call estimates,
// NOT authoritative billing — the Spend Sentinel uses them to trend spend and flag runaway burn from our
// own ledger; true dollars come from the provider dashboards. Tune here as real usage data comes in.
// Keyed by the same action names as COSTS. `free` (retries/polls) is deliberately 0 — the retry-storm
// signal is captured by the Fal 429 rate instead, so retries don't need per-call costing.
export const USD_COST = {
  story: 0.03,      // multi-call agent story build (Anthropic)
  script: 0.02,     // chapter script (Anthropic)
  char: 0.005,      // character brief (Anthropic)
  voices: 0.005,    // voice profiles (Anthropic)
  translate: 0.008, // per language, per chapter (Anthropic)
  brain: 0.01,      // admin Brain / analysis calls (Anthropic)
  panel: 0.02,      // one panel image (Fal flux, or Together on fallback)
  lora: 0.4,        // character LoRA training (Fal)
  voice_tts: 0.004, // one audio clip (ElevenLabs)
  misc: 0.005,
  free: 0,          // retries / failover / status polls — not costed per-call (see note above)
};

// Rough spend budget the Spend Sentinel measures against. Tune to what a tester round should cost.
// status: ok < warnAt·budget ≤ warn < budget ≤ alert.
export const BUDGET = { hourlyUsd: 5, dailyUsd: 30, warnAt: 0.7 };

export function usdFor(action) {
  return USD_COST[action] ?? USD_COST.misc;
}

// Demo-mode per-IP DAILY caps (only enforced while RELEASE_MODE is off). At 50-panel chapters (~60
// images each), 300 images/day ≈ ~5 chapters/day per visitor — enough to make real progress while still
// capping runaway/guest abuse. textPerDay raised to match so text isn't the bottleneck. Tune here.
export const DEMO_LIMITS = { imagesPerDay: 300, textPerDay: 100 };

// Credit grant for NEW signups while in demo/beta — generous to seed content. Mirror: constants.js.
// (At launch, Free is read-only: revisit the signup-trigger grant in db/signup_trigger.sql.)
export const DEMO_CREDITS = 500;

// The launch gate. OFF (default) = demo/beta: keys are still server-side (the security win is always
// on), but auth + credit charging are skipped so the current experience is unchanged. ON = release:
// require a signed-in user and charge credits before every paid action.
export const RELEASE_MODE = process.env.RELEASE_MODE === "true";

export function costFor(action) {
  return COSTS[action] ?? COSTS.misc;
}

// ── Subscriptions + top-up packs (server-authoritative). Behind RELEASE_MODE. The Stripe price IDs come
// from env (set per environment in Vercel) so the same code works in test + live. `credits` is the
// monthly grant for a plan / the one-time grant for a pack. `features` gate what a plan unlocks; the
// credit `cap` is the real usage limit — over it, users buy a pack. Numbers are tunable config.
export const PLANS = {
  free: {
    id: "free", name: "Free", priceUsd: 0, credits: 0, stripePrice: null,
    // Read-only: free to read + be on the site (ad-supported). Creating requires a paid plan.
    features: { translate: false, voice: false, maxLangs: 1, lora: false, maxStories: 0, fullAccess: false },
  },
  pro: {
    id: "pro", name: "Pro", priceUsd: 25, credits: 700, stripePrice: process.env.STRIPE_PRICE_PRO || null,
    features: { translate: true, voice: true, maxLangs: 12, lora: false, maxStories: null, fullAccess: false },
  },
  studio: {
    id: "studio", name: "Studio", priceUsd: 50, credits: 1600, stripePrice: process.env.STRIPE_PRICE_STUDIO || null,
    features: { translate: true, voice: true, maxLangs: 12, lora: true, maxStories: null, fullAccess: false },
  },
  studio_pro: {
    id: "studio_pro", name: "Studio Pro", priceUsd: 100, credits: 4000, stripePrice: process.env.STRIPE_PRICE_STUDIO_PRO || null,
    features: { translate: true, voice: true, maxLangs: 12, lora: true, maxStories: null, fullAccess: true },
  },
};

// One-time credit top-ups (never expire). `mode: "payment"` in Stripe Checkout.
export const PACKS = {
  small:  { id: "small",  name: "300 credits",    credits: 300,   priceUsd: 5,   stripePrice: process.env.STRIPE_PRICE_PACK_SMALL  || null },
  medium: { id: "medium", name: "1,000 credits",  credits: 1000,  priceUsd: 15,  stripePrice: process.env.STRIPE_PRICE_PACK_MEDIUM || null },
  large:  { id: "large",  name: "3,000 credits",  credits: 3000,  priceUsd: 40,  stripePrice: process.env.STRIPE_PRICE_PACK_LARGE  || null },
  xl:     { id: "xl",     name: "10,000 credits", credits: 10000, priceUsd: 120, stripePrice: process.env.STRIPE_PRICE_PACK_XL     || null },
};

export const planFor = (id) => PLANS[id] || PLANS.free;
export const packFor = (id) => PACKS[id] || null;

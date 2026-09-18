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

// Demo-mode per-IP DAILY caps (only enforced while RELEASE_MODE is off). At 50-panel chapters (~60
// images each), 300 images/day ≈ ~5 chapters/day per visitor — enough to make real progress while still
// capping runaway/guest abuse. textPerDay raised to match so text isn't the bottleneck. Tune here.
export const DEMO_LIMITS = { imagesPerDay: 300, textPerDay: 100 };

// Credit grant for NEW signups while in demo (was 840). ~2-3 stories' worth. Mirror: constants.js.
export const DEMO_CREDITS = 120;

// The launch gate. OFF (default) = demo/beta: keys are still server-side (the security win is always
// on), but auth + credit charging are skipped so the current experience is unchanged. ON = release:
// require a signed-in user and charge credits before every paid action.
export const RELEASE_MODE = process.env.RELEASE_MODE === "true";

export function costFor(action) {
  return COSTS[action] ?? COSTS.misc;
}

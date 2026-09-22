import { useTheme } from "../ThemeContext.jsx";
import { SUPPORT_EMAIL } from "../constants.js";

// Terms / Privacy / Content-policy pages for the public demo. Static content, no backend. Three docs
// switched by an internal tab (driven by the `doc` prop so the footer links can deep-link a specific one).
// ⚠️ These are reasonable STARTER policies for a free beta — have them reviewed before scaling / adding
// paid billing. Contact address comes from constants.SUPPORT_EMAIL (founder must point it at a real inbox).

const EFFECTIVE = "September 22, 2026";

const TABS = [
  { id: "terms",   label: "Terms of Service" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "content", label: "Content Policy" },
];

export default function LegalPage({ doc = "terms", onDoc }) {
  const C = useTheme();
  const active = TABS.find((t) => t.id === doc) ? doc : "terms";

  const H = ({ children }) => (
    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "22px 0 8px", fontFamily: "'Cinzel',serif" }}>{children}</h2>
  );
  const P = ({ children }) => (
    <p style={{ fontSize: 13, color: C.text, lineHeight: 1.75, margin: "0 0 10px" }}>{children}</p>
  );
  const LI = ({ children }) => (
    <li style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 5 }}>{children}</li>
  );
  const UL = ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ul>;
  const Mail = () => (
    <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: C.purple, textDecoration: "none" }}>{SUPPORT_EMAIL}</a>
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", animation: "fadeUp .2s ease" }}>
      {/* Doc switcher */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, borderBottom: `0.5px solid ${C.border}`, paddingBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onDoc && onDoc(t.id)}
            style={{ padding: "6px 14px", fontSize: 12, borderRadius: 8, border: `0.5px solid ${active === t.id ? C.purple : C.border}`, background: active === t.id ? C.purple + "22" : "transparent", color: active === t.id ? C.purpleL : C.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: active === t.id ? 500 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>Effective {EFFECTIVE} · Beta</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 6px", fontFamily: "'Cinzel',serif" }}>
        {TABS.find((t) => t.id === active).label}
      </h1>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
        MangaMultiVerse is a free beta. These terms may change as the product develops; material changes will be posted here.
      </div>

      {active === "terms" && (
        <div>
          <P>Welcome to MangaMultiVerse (“MangaMultiVerse”, “we”, “us”). By creating an account or using the service you agree to these Terms of Service. If you don’t agree, please don’t use the service.</P>

          <H>1. The service</H>
          <P>MangaMultiVerse is a platform for creating and reading AI-assisted manga. During this beta the service is provided free of charge, on an “as is” and “as available” basis, and may change, break, or go offline without notice.</P>

          <H>2. Your account</H>
          <UL>
            <LI>You must be at least 13 years old to create an account. Some content is marked “Mature” and gated to users 18+.</LI>
            <LI>You’re responsible for activity under your account and for keeping your login secure.</LI>
            <LI>One person, one account. Don’t create accounts to evade limits, bans, or usage caps.</LI>
          </UL>

          <H>3. Creating content</H>
          <P>You use AI tools to generate stories, scripts, characters, panel art, and voices. You’re responsible for what you generate and publish, and you agree to follow our <button onClick={() => onDoc && onDoc("content")} style={{ background: "none", border: "none", padding: 0, color: C.purple, cursor: "pointer", font: "inherit", fontSize: 13 }}>Content Policy</button>.</P>

          <H>4. Ownership &amp; licence</H>
          <UL>
            <LI>As between you and us, you retain the rights you have in the stories you create. AI-generated output may not be protectable by copyright in every jurisdiction — that’s a matter of law, not this agreement.</LI>
            <LI>By publishing a story you grant MangaMultiVerse a non-exclusive, worldwide, royalty-free licence to host, display, cache, and distribute it so the service can operate (including translations and link previews). You can remove a published story at any time, which ends that licence going forward.</LI>
            <LI>You represent that your content doesn’t infringe anyone else’s rights.</LI>
          </UL>

          <H>5. Usage limits</H>
          <P>To keep a shared, free service sustainable we apply per-account and per-network usage limits. These may change at any time. Trying to circumvent them may get your access suspended.</P>

          <H>6. Acceptable use</H>
          <P>Don’t misuse the service — no illegal activity, no infringing or harmful content, and nothing that endangers minors. See the <button onClick={() => onDoc && onDoc("content")} style={{ background: "none", border: "none", padding: 0, color: C.purple, cursor: "pointer", font: "inherit", fontSize: 13 }}>Content Policy</button> for specifics. We may remove content and suspend or terminate accounts that violate these terms.</P>

          <H>7. Disclaimers</H>
          <P>The service is provided “as is” without warranties of any kind. AI output can be inaccurate, unexpected, or offensive; you use it at your own discretion. To the fullest extent permitted by law, we’re not liable for indirect, incidental, or consequential damages arising from your use of the service.</P>

          <H>8. Termination</H>
          <P>You can stop using the service and request deletion at any time (see the Privacy Policy). We may suspend or end access if you violate these terms or to protect the service and its users.</P>

          <H>9. Changes &amp; contact</H>
          <P>We may update these terms; continued use after a change means you accept the update. Questions? Email <Mail />.</P>
        </div>
      )}

      {active === "privacy" && (
        <div>
          <P>This Privacy Policy explains what we collect and why. We aim to collect as little as we need to run the service.</P>

          <H>What we collect</H>
          <UL>
            <LI><b>Account data</b> — the email and username you sign up with, managed through our authentication provider (Supabase).</LI>
            <LI><b>Content you create</b> — the stories, scripts, characters, panels, and settings you generate and save.</LI>
            <LI><b>Usage &amp; technical data</b> — basic logs needed to operate and protect the service, including error reports and a per-network request counter used to enforce fair-use limits. We store a truncated network identifier for rate-limiting, not to profile you.</LI>
          </UL>
          <P>We do <b>not</b> take payment in this beta, so we don’t collect or store any card or billing information.</P>

          <H>How we use it</H>
          <UL>
            <LI>To provide the service — save your work, publish stories, generate and translate content.</LI>
            <LI>To keep the service running and safe — debugging, abuse prevention, and enforcing usage limits.</LI>
            <LI>To moderate content that’s reported or violates our Content Policy.</LI>
          </UL>

          <H>AI providers</H>
          <P>To generate content, the text and prompts you submit are sent to third-party AI providers (for example, model and image/voice generation services) which process them to return output. They act as processors for that request; we don’t sell your content or use it to train models.</P>

          <H>Sharing</H>
          <P>We don’t sell your personal data. We share data only with the infrastructure and AI providers that run the service, and where required by law. Stories you choose to <b>publish</b> are public by design and discoverable (including in our sitemap and link previews).</P>

          <H>Your choices &amp; deletion</H>
          <P>You can unpublish or delete stories at any time from your dashboard. To delete your account and associated data, email <Mail /> from your account email and we’ll process it. Some minimal records may be retained where required for security or legal reasons.</P>

          <H>Data location &amp; security</H>
          <P>Data is stored with our hosting and database providers and protected by access controls. No system is perfectly secure; please don’t put sensitive personal information into stories or prompts.</P>

          <H>Contact</H>
          <P>Questions about privacy or a data request? Email <Mail />.</P>
        </div>
      )}

      {active === "content" && (
        <div>
          <P>MangaMultiVerse is a creative platform used by a broad audience, including minors. To keep it safe, everyone must follow this Content Policy. We may remove content and suspend accounts that break it.</P>

          <H>Not allowed</H>
          <UL>
            <LI><b>Anything sexualizing minors</b>, in any form. Zero tolerance — this is reported where required by law.</LI>
            <LI><b>Sexually explicit / pornographic content.</b> Mature <i>themes</i> are allowed under the 18+ gate, but explicit sexual content is not permitted (and our AI providers won’t generate it).</LI>
            <LI><b>Real-world hate or harassment</b> — content that attacks or dehumanizes people based on protected characteristics, or that targets or harasses a real individual.</LI>
            <LI><b>Incitement to violence or credible threats</b>, and content promoting terrorism or self-harm.</LI>
            <LI><b>Illegal content</b>, or content that infringes someone else’s copyright, trademark, or other rights.</LI>
            <LI><b>Impersonation</b> or content presented to deceive (e.g. passing off as a real person or brand).</LI>
          </UL>

          <H>Mature content &amp; the age gate</H>
          <P>Creators must label mature stories with the correct rating. Mature stories are gated to viewers who confirm they’re 18+, and their covers are blurred for unverified viewers. Misrating content to bypass the gate is a violation.</P>

          <H>Reporting</H>
          <P>Every story has a “⚑ Report” control in the reader. If you see something that breaks this policy, report it — our team reviews reports and can hide or remove content. You can also email <Mail />.</P>

          <H>Enforcement</H>
          <P>Depending on severity we may hide or delete content, limit features, or suspend/terminate accounts. Serious violations involving minors are escalated to the appropriate authorities.</P>
        </div>
      )}

      <div style={{ marginTop: 28, paddingTop: 16, borderTop: `0.5px solid ${C.border}`, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
        Contact: <Mail /> · These are beta policies and may be updated as the product develops.
      </div>
    </div>
  );
}

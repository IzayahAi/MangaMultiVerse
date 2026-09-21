import { useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { Tag } from "./UI.jsx";
import BrainPage from "./BrainPage.jsx";
import StoryBrainsPage from "./StoryBrainsPage.jsx";
import ErrorsPage from "./ErrorsPage.jsx";
import AgentsPage from "./AgentsPage.jsx";
import ModerationPage from "./ModerationPage.jsx";
import MrKPage from "./MrKPage.jsx";
import TodoList from "./TodoList.jsx";

// One home for everything that used to be its own top-nav tab — Story Brains, the Ops Brain, AI Agents,
// and Errors — behind a left sidebar, like a real admin console. Sections gate by role.
export default function AdminDashboard({ auth, published = [], db, onOpenStory, onModerated }) {
  const C = useTheme();
  const isAdmin = auth?.user?.role === "admin";
  const stories = db?.stories || [];
  const [section, setSection] = useState("overview");

  const NAV = [
    { group: "Yours", items: [
      { id: "overview", label: "Overview", icon: "▦" },
      { id: "mrk", label: "Mr. K", icon: "🎩" },
      { id: "brains", label: "Story Brains", icon: "🧠" },
    ] },
    ...(isAdmin ? [{ group: "Platform", items: [
      { id: "reports", label: "Reports", icon: "⚑" },
      { id: "ops", label: "Ops Brain", icon: "◈" },
      { id: "agents", label: "AI Agents", icon: "✦" },
      { id: "errors", label: "Errors", icon: "🐞" },
    ] }] : []),
  ];

  const published_n = stories.filter(s => s.status === "published").length;
  const drafts_n = stories.filter(s => s.status === "draft").length;
  const chapters_n = stories.reduce((n, s) => n + (s.chapters || 1), 0);
  const tiles = [
    { label: "Your stories", value: stories.length, c: C.purple },
    { label: "Published", value: published_n, c: C.teal },
    { label: "Chapters", value: chapters_n, c: C.gold },
    { label: "Drafts", value: drafts_n, c: C.muted },
  ];

  const Overview = () => (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text, marginBottom: 4 }}>Dashboard</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Welcome back{auth?.user?.username ? `, ${auth.user.username}` : ""}. Everything about your stories and the platform, in one place.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 22 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: t.c }}>{t.value}</div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>
      <TodoList userKey={auth?.user?.username || auth?.user?.id || "me"} />
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Jump to</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {NAV.flatMap(g => g.items).filter(i => i.id !== "overview").map(i => (
          <button key={i.id} onClick={() => setSection(i.id)} style={{ padding: "9px 14px", borderRadius: 9, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
            <span>{i.icon}</span>{i.label}
          </button>
        ))}
      </div>
    </div>
  );

  const content = () => {
    switch (section) {
      case "mrk": return <MrKPage token={auth?.token} />;
      case "brains": return <StoryBrainsPage stories={stories} onOpenStory={onOpenStory} />;
      case "reports": return isAdmin ? <ModerationPage token={auth?.token} onModerated={onModerated} /> : <Overview />;
      case "ops": return isAdmin ? <BrainPage auth={auth} published={published} db={db} /> : <Overview />;
      case "agents": return isAdmin ? <AgentsPage /> : <Overview />;
      case "errors": return isAdmin ? <ErrorsPage token={auth?.token} /> : <Overview />;
      default: return <Overview />;
    }
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", maxWidth: 1180, margin: "0 auto" }}>
      {/* Sidebar */}
      <div style={{ width: 190, flexShrink: 0, position: "sticky", top: 16 }}>
        <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 10 }}>
          {NAV.map(g => (
            <div key={g.group} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", padding: "6px 10px 4px" }}>{g.group}</div>
              {g.items.map(i => {
                const on = section === i.id;
                return (
                  <button key={i.id} onClick={() => setSection(i.id)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, marginBottom: 2, border: "none", background: on ? C.purple + "1e" : "transparent", color: on ? C.text : C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: on ? 600 : 400 }}>
                    <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{i.icon}</span>{i.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {isAdmin && <div style={{ marginTop: 10, padding: "8px 12px", textAlign: "center" }}><Tag c={C.purple}>Admin</Tag></div>}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>{content()}</div>
    </div>
  );
}

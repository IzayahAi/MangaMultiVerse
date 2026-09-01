import { createContext, useContext, useState, useEffect } from "react";

export const LIGHT = {
  bg:"#e8f4fd", surf:"#ffffff", card:"#f5faff", border:"#bde0f5", border2:"#93c9eb",
  purple:"#0ea5e9", purpleL:"#38bdf8", pink:"#06b6d4", gold:"#0284c7",
  teal:"#0891b2", blue:"#0369a1", text:"#0c1a2e", muted:"#4a7a9b", dim:"#dbeafe",
  isDark: false,
};

export const DARK = {
  bg:"#060b18", surf:"#0d1526", card:"#111d35", border:"#1a2d4d", border2:"#243d66",
  purple:"#a855f7", purpleL:"#c084fc", pink:"#e879f9", gold:"#fbbf24",
  teal:"#38bdf8", blue:"#818cf8", text:"#e2e8f0", muted:"#7a94b8", dim:"#1a2d4d",
  isDark: true,
};

const ThemeCtx = createContext(LIGHT);
const ToggleCtx = createContext(() => {});

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("mv_dark") === "1"; } catch { return false; }
  });

  const toggle = () => setDark(d => {
    const next = !d;
    try { localStorage.setItem("mv_dark", next ? "1" : "0"); } catch {}
    return next;
  });

  const theme = dark ? DARK : LIGHT;

  useEffect(() => {
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
  }, [dark]);

  return (
    <ThemeCtx.Provider value={theme}>
      <ToggleCtx.Provider value={[dark, toggle]}>
        {children}
      </ToggleCtx.Provider>
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
export const useThemeToggle = () => useContext(ToggleCtx);

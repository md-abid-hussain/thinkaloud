"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const NAMES: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

export function Logo() {
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
      <rect x="0" y="8" width="3" height="6" rx="1.5" fill="var(--wave)" />
      <rect x="6" y="3" width="3" height="16" rx="1.5" fill="var(--wave)" />
      <rect x="12" y="0" width="3" height="22" rx="1.5" fill="var(--ink)" />
      <rect x="18" y="5" width="3" height="12" rx="1.5" fill="var(--wave)" />
      <rect x="23" y="9" width="3" height="4" rx="1.5" fill="var(--wave)" />
    </svg>
  );
}

interface Item { href: string; t: string; d: string; key?: "projects" | "learning" }

const LANDING: Item[] = [
  { href: "#how", t: "How it works", d: "One project, four moves" },
  { href: "#mentor", t: "The mentor", d: "Help when you ask, never before" },
  { href: "#flow", t: "With Wispr Flow", d: "Explain your thinking by voice" },
  { href: "#projects", t: "Projects", d: "From Coding Challenges by John Crickett" },
];
const INNER: Item[] = [
  { href: "/projects", t: "Projects", d: "21 ready to build and explain", key: "projects" },
  { href: "/learning", t: "Your learning", d: "What you've explained, in your words", key: "learning" },
];

/** Applies a theme choice to <html> and remembers it. "system" follows the OS. */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try { localStorage.setItem("ta-theme", t); } catch {}
}

export default function Header({ variant, current, readyCount }: { variant: "landing" | "inner"; current?: "projects" | "learning"; readyCount?: number }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const items = variant === "landing" ? LANDING : INNER.map((i) => (i.key === "projects" && readyCount ? { ...i, d: `${readyCount} ready to build and explain` } : i));
  const navLink = (item: Item, children: React.ReactNode) => {
    const cur = item.key && item.key === current ? "page" : undefined;
    return item.href.startsWith("#")
      ? <a key={item.href} href={item.href} aria-current={cur}>{children}</a>
      : <Link key={item.href} href={item.href} aria-current={cur}>{children}</Link>;
  };

  // Read the theme the head script already applied.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ta-theme") as Theme | null;
      if (saved && ORDER.includes(saved)) setTheme(saved);
    } catch {}
  }, []);
  const choose = (t: Theme) => { setTheme(t); applyTheme(t); };

  const close = useCallback((back: boolean) => {
    setOpen(false);
    if (back) menuRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("locked");
    sheetRef.current?.querySelector<HTMLElement>(".sheet-nav a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      if (e.key === "Escape") { close(true); return; }
      if (e.key === "Tab") {
        const f = Array.from(sheet.querySelectorAll<HTMLElement>("a[href], button")).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onResize = () => { if (window.innerWidth > 1080) close(false); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.classList.remove("locked");
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const onSheetClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".sheet-nav a, .sheet-foot a")) close(false);
    else if (t.hasAttribute("data-close")) close(true);
  };

  return (
    <>
      <header className="top">
        <div className="top-in">
          <Link className="brand" href="/" aria-label="ThinkAloud home">
            <Logo />
            ThinkAloud
          </Link>
          <nav className={variant === "landing" ? "nav" : "nav nav-inner"} aria-label="Main">
            {items.map((i) => navLink(i, i.t))}
          </nav>
          <div className="top-end">
            <button type="button" className="icon-btn theme-btn" aria-label={`Theme: ${NAMES[theme].toLowerCase()}. Change theme`}
              onClick={() => choose(ORDER[(ORDER.indexOf(theme) + 1) % 3])}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" /></svg>
              <span className="t">{NAMES[theme]}</span>
            </button>
            <button type="button" ref={menuRef} className="icon-btn menu-btn" aria-expanded={open} aria-controls="sheet" onClick={() => setOpen(true)}>
              <span className="bars" aria-hidden="true"><i /><i /></span>Menu
            </button>
          </div>
        </div>
      </header>

      <div className={open ? "sheet opening" : "sheet"} id="sheet" hidden={!open} ref={sheetRef} onClick={onSheetClick}>
        <div className="scrim" data-close="" />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="sheet-head">
            <span className="brand"><Logo />ThinkAloud</span>
            <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => close(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Close
            </button>
          </div>
          <ol className="sheet-nav">
            {items.map((i, n) => (
              <li key={i.href}>
                {navLink(i, <><span className="n">{String(n + 1).padStart(2, "0")}</span><span className="t">{i.t}</span><span className="d">{i.d}</span></>)}
              </li>
            ))}
          </ol>
          <div className="sheet-foot">
            {variant === "landing"
              ? <Link className="btn btn-primary" href="/projects">Browse projects</Link>
              : <Link className="btn btn-ghost" href="/learning#export">Export learning log</Link>}
            <div className="sheet-row">
              <span className="fine">Theme</span>
              <div className="seg" role="group" aria-label="Theme">
                {ORDER.map((t) => (
                  <button key={t} type="button" aria-pressed={theme === t} onClick={() => choose(t)}>{NAMES[t]}</button>
                ))}
              </div>
            </div>
            <p className="sheet-credit">Projects from Coding Challenges by John Crickett</p>
          </div>
        </aside>
      </div>
    </>
  );
}

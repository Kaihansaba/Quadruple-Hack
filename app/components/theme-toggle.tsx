"use client";

import { useEffect, useState } from "react";

const KEY = "verdict:theme";

export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem(KEY, "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(KEY, "dark");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 light:hover:bg-zinc-200 light:hover:text-zinc-700"
    >
      {light ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm3.536 2.05a1 1 0 0 1 1.414 1.414l-.707.708a1 1 0 0 1-1.414-1.415l.707-.707zM18 9a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1zM5.05 5.464a1 1 0 0 1 0 1.415l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zM10 16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm5.657-2.343a1 1 0 0 1 1.414 0l.707.707a1 1 0 0 1-1.414 1.414l-.707-.707a1 1 0 0 1 0-1.414zM4 10a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1zm1.757 3.657a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0zM10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" clipRule="evenodd" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M17.293 13.293A8 8 0 0 1 6.707 2.707a8.001 8.001 0 1 0 10.586 10.586z" />
    </svg>
  );
}

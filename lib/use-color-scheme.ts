"use client";

import { useEffect, useState } from "react";

/** Returns 'light' or 'dark' and reacts live when the user toggles the theme. */
export function useColorScheme(): "light" | "dark" {
  const [scheme, setScheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    function read() {
      setScheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    }
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  return scheme;
}

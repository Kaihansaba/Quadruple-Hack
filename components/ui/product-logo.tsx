"use client";

import { useMemo, useState } from "react";

// Curated brand → logo hints for the products we commonly compare.
// `si` = simpleicons.org slug (crisp brand-coloured logo); `domain` = favicon source.
const ALIASES: Record<string, { si?: string; domain?: string }> = {
  aws: { si: "amazonwebservices", domain: "aws.amazon.com" },
  "amazon web services": { si: "amazonwebservices", domain: "aws.amazon.com" },
  "google cloud": { si: "googlecloud", domain: "cloud.google.com" },
  gcp: { si: "googlecloud", domain: "cloud.google.com" },
  azure: { si: "microsoftazure", domain: "azure.microsoft.com" },
  "microsoft azure": { si: "microsoftazure", domain: "azure.microsoft.com" },
  "google chrome": { si: "googlechrome", domain: "google.com" },
  chrome: { si: "googlechrome", domain: "google.com" },
  firefox: { si: "firefoxbrowser", domain: "mozilla.org" },
  "mozilla firefox": { si: "firefoxbrowser", domain: "mozilla.org" },
  safari: { si: "safari", domain: "apple.com" },
  "microsoft edge": { si: "microsoftedge", domain: "microsoft.com" },
  edge: { si: "microsoftedge", domain: "microsoft.com" },
  brave: { si: "brave", domain: "brave.com" },
  opera: { si: "opera", domain: "opera.com" },
  macbook: { si: "apple", domain: "apple.com" },
  "macbook pro": { si: "apple", domain: "apple.com" },
  "macbook air": { si: "apple", domain: "apple.com" },
  apple: { si: "apple", domain: "apple.com" },
  lenovo: { si: "lenovo", domain: "lenovo.com" },
  thinkpad: { si: "lenovo", domain: "lenovo.com" },
  dell: { si: "dell", domain: "dell.com" },
  hp: { si: "hp", domain: "hp.com" },
  asus: { si: "asus", domain: "asus.com" },
  salesforce: { si: "salesforce", domain: "salesforce.com" },
  hubspot: { si: "hubspot", domain: "hubspot.com" },
  pipedrive: { si: "pipedrive", domain: "pipedrive.com" },
  okta: { si: "okta", domain: "okta.com" },
  "microsoft entra id": { si: "microsoft", domain: "microsoft.com" },
  crowdstrike: { si: "crowdstrike", domain: "crowdstrike.com" },
  sentinelone: { si: "sentinelone", domain: "sentinelone.com" },
  "microsoft defender": { si: "microsoft", domain: "microsoft.com" },
  slack: { si: "slack", domain: "slack.com" },
  notion: { si: "notion", domain: "notion.so" },
  github: { si: "github", domain: "github.com" }
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function favicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

// Find a brand alias by trying the full name, then each individual word
// (so "Macbook Pro M5" still resolves via the "macbook" → Apple alias).
function resolveAlias(name: string) {
  const lower = name.trim().toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  if (ALIASES[slugify(lower)]) return ALIASES[slugify(lower)];
  for (const word of lower.split(/\s+/).filter(Boolean)) {
    if (ALIASES[word]) return ALIASES[word];
    if (ALIASES[slugify(word)]) return ALIASES[slugify(word)];
  }
  return undefined;
}

// Ordered list of logo URLs to try; an empty list means "show initials".
function logoCandidates(name: string): string[] {
  const firstWord = name.trim().split(/\s+/).filter(Boolean)[0] ?? name;
  const firstSlug = slugify(firstWord);
  const alias = resolveAlias(name);
  const urls: string[] = [];

  if (alias) {
    if (alias.si) urls.push(`https://cdn.simpleicons.org/${alias.si}`);
    if (alias.domain) urls.push(favicon(alias.domain));
  }

  // Generic fallback: use the first word as the brand guess.
  if (firstSlug) {
    urls.push(`https://cdn.simpleicons.org/${firstSlug}`);
    urls.push(favicon(`${firstSlug}.com`));
  }

  return urls;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function ProductLogo({
  name,
  size = 40,
  className = ""
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const candidates = useMemo(() => logoCandidates(name), [name]);
  const [idx, setIdx] = useState(0);
  const exhausted = idx >= candidates.length;

  return (
    <span
      aria-hidden="true"
      title={name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${
        exhausted ? "bg-blue-500/15 text-blue-300" : "bg-white"
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {exhausted ? (
        <span className="font-semibold leading-none" style={{ fontSize: Math.round(size * 0.38) }}>
          {initials(name)}
        </span>
      ) : (
        <img
          key={candidates[idx]}
          src={candidates[idx]}
          alt=""
          loading="lazy"
          onError={() => setIdx((i) => i + 1)}
          className="object-contain"
          style={{ width: "78%", height: "78%" }}
        />
      )}
    </span>
  );
}

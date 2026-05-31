"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ProfileRecord } from "./page";

type EditableProfile = {
  companyName: string;
  contactName: string;
  organization: string;
};

const STORAGE_KEY = "verdict:profile-edits:v1";

function value(input: unknown) {
  if (input === null || input === undefined || input === "") {
    return "—";
  }
  return String(input);
}

function money(input: number | null | undefined) {
  if (input === null || input === undefined) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(input);
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "P";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
}

function list(input: string[] | null | undefined) {
  if (!input || input.length === 0) {
    return <span className="text-zinc-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {input.map((item) => (
        <span key={item} className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
          {item}
        </span>
      ))}
    </div>
  );
}

function weights(input: Record<string, number> | null | undefined) {
  const entries = Object.entries(input ?? {});
  if (entries.length === 0) {
    return <span className="text-zinc-500">—</span>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, weight]) => (
        <div key={key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="capitalize text-zinc-300">{key.replaceAll("_", " ")}</span>
            <span className="font-medium text-white">{Math.round(weight * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.round(weight * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function readSavedProfile(): EditableProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EditableProfile) : null;
  } catch {
    return null;
  }
}

function buildEditable(profile: ProfileRecord): EditableProfile {
  return {
    companyName: profile.name ?? "",
    contactName: profile.contact_name ?? profile.person_name ?? "",
    organization: profile.organization ?? profile.name ?? ""
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-4 text-sm font-semibold text-white">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function EditableField({
  label,
  value,
  editing,
  onChange
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</label>
      {editing ? (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-green-500"
          placeholder="—"
        />
      ) : (
        <div className="text-sm text-zinc-200">{value.trim() || "—"}</div>
      )}
    </div>
  );
}

export function ProfileClient({ initialProfile }: { initialProfile: ProfileRecord }) {
  const initialEditable = useMemo(() => buildEditable(initialProfile), [initialProfile]);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<EditableProfile>(initialEditable);
  const [draft, setDraft] = useState<EditableProfile>(initialEditable);

  useEffect(() => {
    const saved = readSavedProfile();
    if (!saved) return;
    setProfile(saved);
    setDraft(saved);
  }, []);

  function updateDraft(key: keyof EditableProfile, nextValue: string) {
    setDraft((current) => ({ ...current, [key]: nextValue }));
  }

  function save() {
    setProfile(draft);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setEditing(false);
  }

  function cancel() {
    setDraft(profile);
    setEditing(false);
  }

  const sector = initialProfile.sector ?? initialProfile.industry;
  const displayName = profile.contactName.trim() || profile.companyName.trim() || "Profile";

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-green-500/25 bg-green-500/10 text-xl font-semibold text-green-300">
                {initials(displayName)}
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-500">Profile</p>
                <h1 className="text-2xl font-bold text-white">{value(displayName)}</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {value(profile.companyName)} · {value(sector)}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancel}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
                >
                  Edit names
                </button>
              )}
            </div>
          </div>
        </section>

        <Section title="Company">
          <EditableField
            label="Company name"
            value={draft.companyName}
            editing={editing}
            onChange={(nextValue) => updateDraft("companyName", nextValue)}
          />
          <EditableField
            label="Organization / sector"
            value={draft.organization}
            editing={editing}
            onChange={(nextValue) => updateDraft("organization", nextValue)}
          />
          <Field label="Industry">{value(initialProfile.industry)}</Field>
          <Field label="Size">{value(initialProfile.size)}</Field>
        </Section>

        <Section title="People">
          <EditableField
            label="Contact / person name"
            value={draft.contactName}
            editing={editing}
            onChange={(nextValue) => updateDraft("contactName", nextValue)}
          />
        </Section>

        <Section title="Constraints">
          <Field label="Budget ceiling">{money(initialProfile.budget_ceiling)}</Field>
          <Field label="Compliance requirements">{list(initialProfile.compliance_reqs)}</Field>
        </Section>

        <Section title="Preferences">
          <Field label="Tech stack">{list(initialProfile.tech_stack)}</Field>
          <Field label="Preferred suppliers">{list(initialProfile.preferred_suppliers)}</Field>
          <div className="sm:col-span-2">
            <Field label="Default weights">{weights(initialProfile.default_weights)}</Field>
          </div>
        </Section>
      </div>
    </main>
  );
}

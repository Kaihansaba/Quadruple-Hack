"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ProfileRecord } from "./page";
import {
  editableFromProfile,
  EMPTY_EDITABLE_PROFILE,
  profileDisplayName,
  readSavedProfile,
  savedProfileFromEditable,
  writeSavedProfile,
  type EditableProfile,
  type EditableWeight
} from "@/lib/profile-storage";

function value(input: unknown) {
  if (input === null || input === undefined || input === "") {
    return "—";
  }
  return String(input);
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "P";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
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
  onChange,
  placeholder = "—",
  type = "text"
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</label>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-blue-500"
          placeholder={placeholder}
        />
      ) : (
        <div className="text-sm text-zinc-200">{value.trim() || "—"}</div>
      )}
    </div>
  );
}

function updateListItem(items: string[], index: number, value: string) {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function ListField({
  label,
  values,
  editing,
  placeholder,
  onChange
}: {
  label: string;
  values: string[];
  editing: boolean;
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const displayValues = values.map((item) => item.trim()).filter(Boolean);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      {editing ? (
        <div className="space-y-2">
          {values.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={item}
                onChange={(event) => onChange(updateListItem(values, index, event.target.value))}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-blue-500"
                placeholder={placeholder}
              />
              <button
                type="button"
                onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
                className="rounded-lg border border-zinc-700 px-3 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...values, ""])}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
          >
            Add
          </button>
        </div>
      ) : displayValues.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {displayValues.map((item) => (
            <span key={item} className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-sm text-zinc-500">—</span>
      )}
    </div>
  );
}

function updateWeightRow(rows: EditableWeight[], index: number, patch: Partial<EditableWeight>) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
}

function WeightField({
  rows,
  editing,
  onChange
}: {
  rows: EditableWeight[];
  editing: boolean;
  onChange: (rows: EditableWeight[]) => void;
}) {
  const displayRows = rows.filter((row) => row.criterion.trim());

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Default weights</div>
      {editing ? (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
              <input
                value={row.criterion}
                onChange={(event) => onChange(updateWeightRow(rows, index, { criterion: event.target.value }))}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-blue-500"
                placeholder="criterion_id"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={row.percent}
                onChange={(event) => onChange(updateWeightRow(rows, index, { percent: event.target.value }))}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-blue-500"
                placeholder="%"
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                className="rounded-lg border border-zinc-700 px-3 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange([...rows, { criterion: "", percent: "" }])}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
          >
            Add weight
          </button>
        </div>
      ) : displayRows.length > 0 ? (
        <div className="space-y-3">
          {displayRows.map((row) => {
            const percent = Number(row.percent);
            const width = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
            return (
              <div key={row.criterion}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="capitalize text-zinc-300">{row.criterion.replaceAll("_", " ")}</span>
                  <span className="font-medium text-white">{Number.isFinite(percent) ? Math.round(percent) : 0}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-sm text-zinc-500">—</span>
      )}
    </div>
  );
}

export function ProfileClient({ initialProfile }: { initialProfile: ProfileRecord | null }) {
  const initialEditable = useMemo(() => editableFromProfile(initialProfile), [initialProfile]);
  const [editing, setEditing] = useState(initialProfile === null);
  const [profile, setProfile] = useState<EditableProfile>(initialEditable);
  const [draft, setDraft] = useState<EditableProfile>(initialEditable);

  useEffect(() => {
    const saved = readSavedProfile();
    if (!saved) return;
    const editable = editableFromProfile(saved);
    setProfile(editable);
    setDraft(editable);
    setEditing(false);
  }, []);

  function updateDraft<K extends keyof EditableProfile>(key: K, nextValue: EditableProfile[K]) {
    setDraft((current) => ({ ...current, [key]: nextValue }));
  }

  function save() {
    const normalized = savedProfileFromEditable(draft);
    const editable = editableFromProfile(normalized);
    setProfile(editable);
    setDraft(editable);
    writeSavedProfile(normalized);
    setEditing(false);
  }

  function cancel() {
    setDraft(profile);
    setEditing(false);
  }

  const savedProfile = savedProfileFromEditable(profile);
  const displayName = profileDisplayName(savedProfile);
  const hasProfileName = displayName.length > 0;

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-xl font-semibold text-blue-300">
                {initials(displayName)}
              </div>
              <div>
                <p className="mb-1 text-sm text-zinc-500">Profile</p>
                <h1 className="text-2xl font-bold text-white">
                  {hasProfileName ? value(displayName) : "Create your profile"}
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {hasProfileName ? `${value(profile.companyName)} · ${value(profile.organization || profile.industry)}` : "Add profile details to personalize comparisons."}
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
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
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
                  Edit profile
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
            placeholder="Company name"
            onChange={(nextValue) => updateDraft("companyName", nextValue)}
          />
          <EditableField
            label="Organization / sector"
            value={draft.organization}
            editing={editing}
            placeholder="Organization or sector"
            onChange={(nextValue) => updateDraft("organization", nextValue)}
          />
          <EditableField
            label="Industry"
            value={draft.industry}
            editing={editing}
            placeholder="Industry"
            onChange={(nextValue) => updateDraft("industry", nextValue)}
          />
          <EditableField
            label="Size"
            value={draft.size}
            editing={editing}
            placeholder="Company size"
            onChange={(nextValue) => updateDraft("size", nextValue)}
          />
        </Section>

        <Section title="People">
          <EditableField
            label="Contact / person name"
            value={draft.contactName}
            editing={editing}
            placeholder="Contact name"
            onChange={(nextValue) => updateDraft("contactName", nextValue)}
          />
        </Section>

        <Section title="Constraints">
          <EditableField
            label="Budget ceiling"
            value={draft.budgetCeiling}
            editing={editing}
            type="number"
            placeholder="Budget ceiling"
            onChange={(nextValue) => updateDraft("budgetCeiling", nextValue)}
          />
          <ListField
            label="Compliance requirements"
            values={draft.complianceReqs}
            editing={editing}
            placeholder="Compliance requirement"
            onChange={(nextValue) => updateDraft("complianceReqs", nextValue)}
          />
        </Section>

        <Section title="Preferences">
          <ListField
            label="Tech stack"
            values={draft.techStack}
            editing={editing}
            placeholder="Technology"
            onChange={(nextValue) => updateDraft("techStack", nextValue)}
          />
          <ListField
            label="Preferred suppliers"
            values={draft.preferredSuppliers}
            editing={editing}
            placeholder="Supplier"
            onChange={(nextValue) => updateDraft("preferredSuppliers", nextValue)}
          />
          <div className="sm:col-span-2">
            <WeightField
              rows={draft.defaultWeights}
              editing={editing}
              onChange={(nextValue) => updateDraft("defaultWeights", nextValue)}
            />
          </div>
        </Section>
      </div>
    </main>
  );
}

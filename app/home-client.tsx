"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import type { StartResponse } from "@/lib/api-types";

type Product = { name: string; description: string; files: File[] };

const SUGGESTIONS = ["Salesforce", "HubSpot"];
const PROFILE_BADGE = "Meridian Software";
const MAX_PRODUCTS = 4;

const EMPTY_DRAFT: Product = { name: "", description: "", files: [] };

export function HomeClient() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Product>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const canAddProduct = draft.name.trim().length > 0 && products.length < MAX_PRODUCTS;
  const canCompare = products.length >= 2 && !loading;
  const showInitialAdd = products.length === 0 && !formOpen;

  async function submit() {
    if (!canCompare) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/comparisons/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: products.map((product) => product.name).join(" vs ") })
      });
      if (!res.ok) throw new Error(await res.text());
      const data: StartResponse = await res.json();
      const href = `/compare/${data.comparisonId}/clarify?data=${encodeURIComponent(JSON.stringify(data))}`;
      upsertComparisonHistory({
        id: data.comparisonId,
        title: data.products.map((product) => product.name).join(" vs "),
        href,
        status: "clarify"
      });
      router.push(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  function addProduct() {
    if (!canAddProduct) return;

    const nextProduct: Product = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      files: draft.files
    };
    setProducts((current) => [...current, nextProduct]);
    setDraft(EMPTY_DRAFT);
    setFormOpen(false);
    window.setTimeout(() => {
      cardsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function removeProduct(index: number) {
    setProducts((current) => current.filter((_, productIndex) => productIndex !== index));
    setFormOpen(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setDraft((current) => ({
      ...current,
      files: [...current.files, ...Array.from(fileList)]
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setDraft((current) => ({
      ...current,
      files: current.files.filter((_, fileIndex) => fileIndex !== index)
    }));
  }

  function useSuggestion(suggestion: string) {
    if (products.length >= MAX_PRODUCTS) return;
    setFormOpen(true);
    setDraft((current) => ({ ...current, name: suggestion }));
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function onFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addProduct();
  }

  function openForm() {
    if (products.length >= MAX_PRODUCTS) return;
    setFormOpen(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  return (
    <main className="min-h-screen px-4 pb-32 pt-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <div className="mb-9 flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm text-green-400">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Profile loaded: <strong className="font-semibold">{PROFILE_BADGE}</strong>
        </div>

        <h1 className="mb-8 max-w-2xl text-center text-4xl font-bold leading-tight text-white sm:text-5xl">
          What are you deciding today?
        </h1>

        <div ref={cardsRef} className="mb-6 w-full overflow-x-auto pb-2">
          <div className={showInitialAdd ? "flex w-full justify-center" : "flex min-w-max gap-3"}>
            <AnimatePresence initial={false}>
              {products.map((product, index) => (
                <ProductCard
                  key={`${product.name}-${index}`}
                  product={product}
                  onRemove={() => removeProduct(index)}
                />
              ))}
            </AnimatePresence>

            {showInitialAdd && (
              <motion.button
                type="button"
                onClick={openForm}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex h-64 w-[40rem] max-w-[calc(100vw-2rem)] shrink-0 flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-200"
              >
                <span className="text-6xl leading-none">+</span>
                <span className="mt-5 text-xl font-semibold">Add product</span>
              </motion.button>
            )}

            {products.length > 0 && products.length < MAX_PRODUCTS && (
              <motion.button
                type="button"
                onClick={openForm}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex h-24 w-52 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
              >
                <span className="text-2xl leading-none">+</span>
                <span className="mt-1 text-sm">Add product</span>
              </motion.button>
            )}
          </div>
        </div>

        <AnimatePresence>
        {formOpen && products.length < MAX_PRODUCTS && (
          <motion.form
            onSubmit={onFormSubmit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
          >
            <div className="border-b border-zinc-800 pb-4">
              <label htmlFor="product-name" className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Product
              </label>
              <input
                ref={nameInputRef}
                id="product-name"
                type="text"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Salesforce"
                disabled={loading}
                className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            <div className="border-b border-zinc-800 py-4">
              <label htmlFor="product-description" className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Why you're considering it (optional)
              </label>
              <textarea
                id="product-description"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="e.g. Our sales team already uses it"
                rows={2}
                disabled={loading}
                className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            {draft.files.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-zinc-800 py-3">
                {draft.files.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="flex max-w-48 items-center gap-1 rounded-full bg-zinc-700 px-2.5 py-1 text-xs text-zinc-300"
                  >
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-zinc-500 transition-colors hover:text-zinc-200"
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 pt-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                  onChange={(event) => addFiles(event.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white disabled:opacity-40"
                >
                  <PaperclipIcon />
                  Attach
                </button>
              </div>

              <button
                type="submit"
                disabled={!canAddProduct || loading}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add product →
              </button>
            </div>
          </motion.form>
        )}
        </AnimatePresence>

        <AnimatePresence>
        {formOpen && products.length < MAX_PRODUCTS && (
          <div className="mt-5 flex w-full max-w-2xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => useSuggestion(suggestion)}
                disabled={loading}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        </AnimatePresence>

      </div>

      <div className="app-bottom-bar fixed bottom-0 left-0 right-0 z-10 border-t border-zinc-800 bg-zinc-950/95 px-4 py-4 transition-[left] duration-300">
        <div className="mx-auto max-w-3xl space-y-2">
          <motion.button
            type="button"
            onClick={submit}
            disabled={!canCompare}
            whileHover={canCompare ? { scale: 1.015 } : {}}
            whileTap={canCompare ? { scale: 0.97 } : {}}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`relative w-full rounded-2xl py-3 text-base font-semibold transition-colors ${
              canCompare
                ? "bg-green-600 text-white hover:bg-green-500"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
          >
            {loading && (
              <span className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            )}
            {products.length < 2 ? "Add at least 2 products" : `Compare ${products.length} products →`}
          </motion.button>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  );
}

function ProductCard({
  product,
  onRemove
}: {
  product: Product;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="relative h-24 w-52 shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 p-4"
    >
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        aria-label={`Remove ${product.name}`}
      >
        ×
      </button>
      <div className="pr-7">
        <p className="truncate text-sm font-medium text-white">{product.name}</p>
        <p className="mt-1 overflow-hidden text-xs leading-5 text-zinc-400 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {product.description || "No note added"}
        </p>
        {product.files.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
            <PaperclipIcon />
            {product.files.length} file{product.files.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PaperclipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

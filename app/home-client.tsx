"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import type { DocumentPage, StartResult } from "@/lib/api-types";
import { saveSessionData } from "@/lib/session-data";
import { formatIncomparableMessage } from "@/lib/start-response";
import { useColorScheme } from "@/lib/use-color-scheme";
import BoxLoader from "@/components/ui/box-loader";
import LightRays from "@/components/ui/light-rays";
import ProductLogo from "@/components/ui/product-logo";

type AttachmentStatus = "parsing" | "parsed" | "no_text" | "error";

type ParsedPage = {
  page: number;
  text: string;
};

type StartDocument = {
  productName: string;
  text: string;
  perPage?: DocumentPage[];
};

type AttachedFile = {
  id: string;
  file: File;
  status: AttachmentStatus;
  text?: string;
  pageCount?: number;
  perPage?: ParsedPage[];
  error?: string;
};

type Product = { name: string; description: string; files: AttachedFile[] };

const SUGGESTIONS = ["Salesforce", "HubSpot"];
const MAX_PRODUCTS = 4;
const MAX_DOCUMENT_TEXT_CHARS = 20_000;
const PROFILE_STORAGE_KEY = "verdict:profile-edits:v1";

const EMPTY_DRAFT: Product = { name: "", description: "", files: [] };

function getGreeting(firstName: string | null) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return firstName ? `${greeting} ${firstName}` : greeting;
}

function readProfileFirstName() {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { contactName?: string };
    return parsed.contactName?.trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

function createAttachmentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function productDocuments(products: Product[]): StartDocument[] {
  return products.flatMap((product) => {
    const text = product.files
      .map((attachment) => attachment.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_DOCUMENT_TEXT_CHARS);

    if (!text) return [];

    return [
      {
        productName: product.name,
        text,
        perPage: product.files.flatMap((attachment) => attachment.perPage ?? [])
      }
    ];
  });
}

export function HomeClient() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Product>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomparableMessage, setIncomparableMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const canAddProduct =
    draft.name.trim().length > 0 && (editingIndex !== null || products.length < MAX_PRODUCTS);
  const canCompare = products.length >= 2 && !loading;
  const showInitialAdd = products.length === 0 && !formOpen;
  const canShowAddSlot = products.length < MAX_PRODUCTS && editingIndex === null;
  const greeting = getGreeting(firstName);

  useEffect(() => {
    setFirstName(readProfileFirstName());
  }, []);

  async function submit(forceCompare = false) {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    if (forceCompare) {
      setIncomparableMessage(null);
    }

    try {
      const documents = productDocuments(products);
      const body =
        documents.length > 0
          ? { query: products.map((product) => product.name).join(" vs "), documents, forceCompare }
          : { query: products.map((product) => product.name).join(" vs "), forceCompare };

      const res = await fetch("/api/comparisons/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      const data: StartResult = await res.json();
      if (data.status === "incomparable") {
        setIncomparableMessage(formatIncomparableMessage(data.comparability.reason));
        setLoading(false);
        return;
      }

      saveSessionData(data.comparisonId, data);
      const href = `/compare/${data.comparisonId}/clarify`;
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
    setIncomparableMessage(null);

    const nextProduct: Product = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      files: draft.files
    };
    if (editingIndex !== null) {
      setProducts((current) =>
        current.map((product, index) => (index === editingIndex ? nextProduct : product))
      );
    } else {
      setProducts((current) => [...current, nextProduct]);
    }
    setDraft(EMPTY_DRAFT);
    setEditingIndex(null);
    setFormOpen(false);
    window.setTimeout(() => {
      cardsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function removeProduct(index: number) {
    setIncomparableMessage(null);
    setProducts((current) => current.filter((_, productIndex) => productIndex !== index));
    if (editingIndex === index) {
      setDraft(EMPTY_DRAFT);
      setEditingIndex(null);
      setFormOpen(false);
    }
  }

  function updateAttachment(id: string, patch: Partial<AttachedFile>) {
    const updateFiles = (files: AttachedFile[]) =>
      files.map((attachment) => (attachment.id === id ? { ...attachment, ...patch } : attachment));

    setDraft((current) => ({ ...current, files: updateFiles(current.files) }));
    setProducts((current) =>
      current.map((product) => ({ ...product, files: updateFiles(product.files) }))
    );
  }

  async function parsePdfAttachment(attachment: AttachedFile) {
    const formData = new FormData();
    formData.append("file", attachment.file);

    try {
      const res = await fetch("/api/uploads/parse", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = (await res.json()) as {
        text?: string;
        pageCount?: number;
        perPage?: ParsedPage[];
        note?: string;
      };
      const parsedText = data.text ?? "";

      updateAttachment(attachment.id, {
        status: parsedText.trim().length > 0 ? "parsed" : "no_text",
        text: parsedText,
        pageCount: data.pageCount,
        perPage: data.perPage ?? []
      });
    } catch (err) {
      updateAttachment(attachment.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Parse failed"
      });
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const nextFiles: AttachedFile[] = Array.from(fileList).map((file) => ({
      id: createAttachmentId(),
      file,
      status: isPdf(file) ? "parsing" : "parsed"
    }));

    setDraft((current) => ({
      ...current,
      files: [...current.files, ...nextFiles]
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    nextFiles.filter((attachment) => isPdf(attachment.file)).forEach(parsePdfAttachment);
  }

  function removeFile(index: number) {
    setDraft((current) => ({
      ...current,
      files: current.files.filter((_, fileIndex) => fileIndex !== index)
    }));
  }

  function useSuggestion(suggestion: string) {
    if (products.length >= MAX_PRODUCTS) return;
    setIncomparableMessage(null);
    setEditingIndex(null);
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
    setIncomparableMessage(null);
    setEditingIndex(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function editProduct(index: number) {
    const product = products[index];
    if (!product) return;
    setIncomparableMessage(null);
    setDraft(product);
    setEditingIndex(index);
    setFormOpen(true);
    window.setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  return (
    <main className="relative min-h-screen px-4 pb-32 pt-12">
      <AnimatePresence>{loading && <GeneratingOverlay products={products} />}</AnimatePresence>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* WebGL light rays — hidden in light mode (renders on dark canvas) */}
        <div className="absolute inset-0 opacity-80 light:hidden">
          <LightRays
            raysOrigin="top-right"
            raysColor="#2d71bf"
            raysSpeed={1.2}
            lightSpread={0.8}
            rayLength={1.2}
            fadeDistance={1.1}
            followMouse
            mouseInfluence={0.1}
            noiseAmount={0.1}
            distortion={0.05}
          />
        </div>
        {/* dot grid */}
        <div className="bg-dot-grid absolute inset-0 opacity-[0.10] light:opacity-[0.35]" />
        {/* blue glow — dark mode */}
        <div className="absolute right-0 top-0 h-[600px] w-[600px] translate-x-1/4 -translate-y-1/4 rounded-full bg-blue-400/[0.08] blur-[120px] light:hidden" />
        {/* decorative concentric rings — light mode only */}
        <div className="pointer-events-none absolute inset-0 hidden light:block overflow-hidden">
          <div className="absolute left-1/2 top-[38%] h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2d71bf]/[0.10]" />
          <div className="absolute left-1/2 top-[38%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2d71bf]/[0.14]" />
          <div className="absolute left-1/2 top-[38%] h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#2d71bf]/[0.20]" />
          <div className="absolute left-1/2 top-[38%] h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#2d71bf]/[0.28]" />
          {/* soft blue radial glow at the centre of the rings */}
          <div className="absolute left-1/2 top-[38%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d71bf]/[0.05] blur-[60px]" />
        </div>
      </div>
      {incomparableMessage ? (
        <IncomparablePage
          message={incomparableMessage}
          products={products.map((product) => product.name)}
          onContinue={() => submit(true)}
          onBack={() => {
            setIncomparableMessage(null);
            setError(null);
            router.push("/");
          }}
        />
      ) : (
        <>
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center">
        <div className="mb-9 flex items-center gap-2 rounded-full border border-blue-400/30 light:border-blue-600/30 bg-blue-400/10 light:bg-blue-50 px-3 py-1.5 text-sm text-blue-300 light:text-blue-700 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <strong className="font-semibold">{greeting}</strong>
        </div>

        <h1
          className="mb-8 max-w-2xl text-center text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
          style={{
            backgroundImage: colorScheme === "light"
              ? "linear-gradient(to bottom, #09090b 0%, #52525b 100%)"
              : "linear-gradient(to bottom, #ffffff 0%, #a1a1aa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}
        >
          What are you deciding today?
        </h1>

        <div ref={cardsRef} className="mb-6 w-full overflow-x-auto pb-2">
          <div className={showInitialAdd ? "flex w-full justify-center" : "flex min-w-max gap-3"}>
            <AnimatePresence initial={false}>
              {products.map((product, index) => (
                <ProductCard
                  key={`${product.name}-${index}`}
                  product={product}
                  isEditing={editingIndex === index}
                  onEdit={() => editProduct(index)}
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
                className="flex h-64 w-[40rem] max-w-[calc(100vw-2rem)] shrink-0 flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] text-zinc-400 backdrop-blur-md transition-colors hover:border-blue-400/50 hover:bg-blue-400/[0.04] hover:text-blue-200"
              >
                <span className="text-6xl leading-none">+</span>
                <span className="mt-5 text-xl font-semibold">Add product</span>
              </motion.button>
            )}

            {canShowAddSlot && !showInitialAdd && (
              <AddProductSlot isActive={formOpen && editingIndex === null} onClick={openForm} />
            )}
          </div>
        </div>

        <AnimatePresence>
        {formOpen && (products.length < MAX_PRODUCTS || editingIndex !== null) && (
          <motion.form
            onSubmit={onFormSubmit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full rounded-2xl border border-white/10 light:border-zinc-200 bg-white/[0.04] light:bg-white p-5 shadow-[0_8px_40px_rgba(0,0,0,0.4)] light:shadow-sm backdrop-blur-xl"
          >
            <div className="border-b border-white/10 pb-4">
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
                className="w-full bg-transparent text-base text-white light:text-zinc-900 outline-none placeholder:text-zinc-500"
              />
            </div>

            <div className="border-b border-white/10 py-4">
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
                className="w-full resize-none bg-transparent text-sm text-white light:text-zinc-900 outline-none placeholder:text-zinc-500"
              />
            </div>

            {draft.files.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-white/10 py-3">
                {draft.files.map((attachment, index) => (
                  <span
                    key={attachment.id}
                    className="flex max-w-48 items-center gap-1 rounded-full bg-zinc-700 light:bg-zinc-100 px-2.5 py-1 text-xs text-zinc-300 light:text-zinc-600"
                  >
                    {attachment.status === "parsing" && (
                      <span className="h-3 w-3 shrink-0 rounded-full border-2 border-zinc-500 border-t-zinc-200 animate-spin" />
                    )}
                    <span className="truncate">{attachment.file.name}</span>
                    <span className="shrink-0 text-zinc-400">{fileStatusLabel(attachment)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-zinc-500 transition-colors hover:text-zinc-200"
                      aria-label={`Remove ${attachment.file.name}`}
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
                  className="flex items-center gap-2 rounded-xl border border-white/10 light:border-zinc-200 bg-white/[0.02] light:bg-zinc-50 px-3 py-2 text-sm text-zinc-300 light:text-zinc-600 transition-colors hover:border-white/25 light:hover:border-zinc-400 hover:text-white light:hover:text-zinc-900 disabled:opacity-40"
                >
                  <PaperclipIcon />
                  Attach
                </button>
              </div>

              <button
                type="submit"
                disabled={!canAddProduct || loading}
                className="rounded-xl bg-blue-400 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editingIndex === null ? "Add product →" : "Save product →"}
              </button>
            </div>
          </motion.form>
        )}
        </AnimatePresence>

        <AnimatePresence>
        {formOpen && products.length < MAX_PRODUCTS && editingIndex === null && (
          <div className="mt-5 flex w-full max-w-2xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => useSuggestion(suggestion)}
                disabled={loading}
                className="rounded-full border border-white/10 light:border-zinc-200 bg-white/[0.02] light:bg-zinc-50 px-3 py-1.5 text-sm text-zinc-400 light:text-zinc-600 backdrop-blur-md transition-colors hover:border-blue-400/40 hover:text-blue-200 light:hover:text-blue-700 disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        </AnimatePresence>

      </div>

      <div className="app-bottom-bar fixed bottom-4 left-0 right-0 z-10 px-4 py-4 transition-[left] duration-300 sm:bottom-6">
        <div className="mx-auto max-w-3xl space-y-2">
          <motion.button
            type="button"
            onClick={() => submit()}
            disabled={!canCompare}
            whileHover={canCompare ? { scale: 1.015 } : {}}
            whileTap={canCompare ? { scale: 0.97 } : {}}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`relative w-full rounded-2xl py-3 text-base font-semibold transition-colors ${
              canCompare
                ? "bg-blue-400 text-white shadow-[0_8px_30px_rgba(45,113,191,0.25)] hover:bg-blue-300"
                : "cursor-not-allowed border border-white/10 light:border-zinc-200 bg-white/[0.04] light:bg-zinc-100 text-zinc-500 backdrop-blur-md"
            }`}
          >
            {loading && (
              <span className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            )}
            {products.length === 0
              ? "Add 2 products to compare"
              : products.length === 1
                ? "Add 1 more product to compare"
                : `Analyze ${products.length} products →`}
          </motion.button>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </div>
      </div>
        </>
      )}
    </main>
  );
}

function IncomparablePage({
  message,
  products,
  onContinue,
  onBack
}: {
  message: string;
  products: string[];
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-3xl items-center justify-center">
      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="w-full rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8"
      >
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-2xl text-amber-300">
          !
        </div>
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-amber-300">Different decision frames</p>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          These products are not ready to compare.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-300">{message}</p>

        {products.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {products.map((product, index) => (
              <span
                key={`${product}-${index}`}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300"
              >
                {product}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-300"
          >
            Continue anyway
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            Back to home
          </button>
          <p className="flex items-center text-sm text-zinc-500">
            Try comparing items that solve the same problem or belong to the same category.
          </p>
        </div>
      </motion.section>
    </div>
  );
}

function GeneratingOverlay({ products }: { products: Product[] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0f12]/95 px-4 backdrop-blur-sm"
    >
      <div className="mb-14 flex h-24 items-center justify-center">
        <BoxLoader />
      </div>
      <h2 className="mb-1 text-xl font-bold text-white">Setting up your comparison</h2>
      <p className="max-w-sm text-center text-sm text-zinc-400">
        Building the criteria and clarifying questions for{" "}
        <span className="text-zinc-200">{products.map((p) => p.name).join(" vs ")}</span>.
      </p>
    </motion.div>
  );
}

function ProductCard({
  product,
  isEditing,
  onEdit,
  onRemove
}: {
  product: Product;
  isEditing: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      onDoubleClick={onEdit}
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={`relative h-24 w-52 shrink-0 cursor-pointer rounded-xl border p-4 backdrop-blur-md transition-shadow ${
        isEditing
          ? "border-blue-400 bg-blue-400/15 shadow-[0_0_0_1px_rgba(45,113,191,0.18),0_0_34px_rgba(45,113,191,0.2)]"
          : "border-white/10 light:border-zinc-200 bg-white/[0.04] light:bg-white"
      } hover:border-white/20 light:hover:border-zinc-300 hover:shadow-[0_0_24px_rgba(45,113,191,0.12)]`}
      title="Double click to edit"
    >
      {isEditing && (
        <div className="absolute left-3 top-2 rounded-full bg-blue-400/15 light:bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-300 light:text-blue-700">
          Editing
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        aria-label={`Remove ${product.name}`}
      >
        ×
      </button>
      <div className={`pr-7 ${isEditing ? "pt-5" : ""}`}>
        <div className="mb-1 flex items-center gap-2">
          <ProductLogo name={product.name} size={24} />
          <p className="truncate text-sm font-medium text-white light:text-zinc-900">{product.name}</p>
        </div>
        <p className="mt-1 overflow-hidden text-xs leading-5 text-zinc-400 light:text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
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

function fileStatusLabel(attachment: AttachedFile) {
  if (!isPdf(attachment.file)) {
    return "";
  }

  if (attachment.status === "parsing") {
    return "parsing";
  }

  if (attachment.status === "parsed") {
    const pages = attachment.pageCount ? ` (${attachment.pageCount} page${attachment.pageCount === 1 ? "" : "s"})` : "";
    return `parsed ✓${pages}`;
  }

  if (attachment.status === "no_text") {
    return "no text found";
  }

  return "parse failed";
}

function AddProductSlot({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex h-24 w-52 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed backdrop-blur-md transition-colors ${
        isActive
          ? "border-blue-400/70 bg-blue-400/5 text-transparent shadow-[0_0_0_1px_rgba(45,113,191,0.16),0_0_32px_rgba(45,113,191,0.18)]"
          : "border-white/15 bg-white/[0.02] text-zinc-500 hover:border-blue-400/40 hover:text-zinc-300"
      }`}
      aria-label={isActive ? "Product entry active" : "Add product"}
    >
      {!isActive && (
        <>
          <span className="text-2xl leading-none">+</span>
          <span className="mt-1 text-sm">Add product</span>
        </>
      )}
    </motion.button>
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

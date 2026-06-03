"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { upsertComparisonHistory } from "@/lib/comparison-history";
import type { DiscoverProduct, DiscoverResponse, DocumentPage, StartResponse, StartResult } from "@/lib/api-types";
import { saveSessionData } from "@/lib/session-data";
import { formatIncomparableMessage } from "@/lib/start-response";
import { useColorScheme } from "@/lib/use-color-scheme";
import {
  PROFILE_STORAGE_EVENT,
  profileFirstName,
  readSavedProfile
} from "@/lib/profile-storage";
import BoxLoader from "@/components/ui/box-loader";
import LightRays from "@/components/ui/light-rays";
import ProductLogo from "@/components/ui/product-logo";
import { AnimatedText } from "@/components/ui/animated-underline-text-one";

type AttachmentStatus = "parsing" | "parsed" | "no_text" | "error";

type ParsedPage = {
  page: number;
  text: string;
};

type StartDocument = {
  productName?: string;
  filename?: string;
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
type HomeMode = "add_products" | "general_search";
type ConfirmableProduct = StartResponse["products"][number] & {
  category?: string;
  detectedFrom?: "document" | "query";
  sourceDoc?: string;
  nameAsGiven?: string;
  nameNormalized?: string;
  correctionMade?: boolean;
  note?: string;
  originalName: string;
};

const SUGGESTIONS = ["Salesforce", "HubSpot"];
const MAX_PRODUCTS = 4;
const MAX_DOCUMENT_TEXT_CHARS = 20_000;
const EMPTY_DRAFT: Product = { name: "", description: "", files: [] };

function getGreeting(firstName: string | null) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return firstName ? `${greeting} ${firstName}` : "Hello";
}

function readProfileFirstName() {
  return profileFirstName(readSavedProfile());
}

function productsForConfirmation(response: StartResponse): ConfirmableProduct[] {
  return response.products.map((product) => {
    const detected = response.detected_products?.find(
      (item) => item.name === product.name || item.name_normalized === product.name
    );
    return {
      ...product,
      category: detected?.category,
      detectedFrom: detected?.detected_from,
      sourceDoc: detected?.source_doc,
      nameAsGiven: detected?.name_as_given,
      nameNormalized: detected?.name_normalized,
      correctionMade: detected?.correction_made,
      note: detected?.note,
      originalName: detected?.name_as_given ?? product.name
    };
  });
}

function displayProductName(product: Product) {
  return product.name.trim() || product.files[0]?.file.name || "Uploaded document";
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
        ...(product.name.trim() ? { productName: product.name.trim() } : {}),
        filename: product.files[0]?.file.name,
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
  const [pendingConfirmation, setPendingConfirmation] = useState<StartResponse | null>(null);
  const [confirmProducts, setConfirmProducts] = useState<ConfirmableProduct[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [mode, setMode] = useState<HomeMode>("add_products");
  const [generalQuery, setGeneralQuery] = useState("");
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalResults, setGeneralResults] = useState<DiscoverProduct[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalSearched, setGeneralSearched] = useState(false);
  const [selectedGeneralProducts, setSelectedGeneralProducts] = useState<string[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  const draftHasDocumentText = draft.files.some((file) => file.text?.trim());
  const canAddProduct =
    (draft.name.trim().length > 0 || draftHasDocumentText) &&
    (editingIndex !== null || products.length < MAX_PRODUCTS);
  const documentReadyCount = products.filter((product) =>
    product.files.some((file) => file.text?.trim())
  ).length;
  const namedProductCount = products.filter((product) => product.name.trim()).length;
  const canCompare = (namedProductCount >= 2 || documentReadyCount >= 2) && !loading;
  const showInitialAdd = products.length === 0 && !formOpen;
  const canShowAddSlot = products.length < MAX_PRODUCTS && editingIndex === null;
  const greeting = getGreeting(firstName);

  useEffect(() => {
    function refreshProfileName() {
      setFirstName(readProfileFirstName());
    }

    refreshProfileName();
    window.addEventListener("storage", refreshProfileName);
    window.addEventListener(PROFILE_STORAGE_EVENT, refreshProfileName);
    return () => {
      window.removeEventListener("storage", refreshProfileName);
      window.removeEventListener(PROFILE_STORAGE_EVENT, refreshProfileName);
    };
  }, []);

  function selectMode(nextMode: HomeMode) {
    setMode(nextMode);
    setError(null);
    setGeneralLoading(false);
    setGeneralQuery("");
    setGeneralResults([]);
    setGeneralError(null);
    setGeneralSearched(false);
    setSelectedGeneralProducts([]);
  }

  async function submitProducts(productsToCompare: Product[], forceCompare = false) {
    const hasNamedProducts = productsToCompare.filter((product) => product.name.trim()).length >= 2;
    const hasDocuments = productsToCompare.filter((product) =>
      product.files.some((file) => file.text?.trim())
    ).length >= 2;
    if (!hasNamedProducts && !hasDocuments) return;

    setProducts(productsToCompare);
    setLoading(true);
    setError(null);
    if (forceCompare) {
      setIncomparableMessage(null);
    }

    try {
      const documents = productDocuments(productsToCompare);
      const query = productsToCompare
        .map((product) => product.name.trim())
        .filter(Boolean)
        .join(" vs ");
      const savedProfile = readSavedProfile();
      const body =
        documents.length > 0
          ? { ...(query ? { query } : {}), documents, forceCompare, ...(savedProfile ? { profile: savedProfile } : {}) }
          : { query, forceCompare, ...(savedProfile ? { profile: savedProfile } : {}) };

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

      setPendingConfirmation(data);
      setConfirmProducts(productsForConfirmation(data));
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function submit(forceCompare = false) {
    if (!canCompare) return;
    await submitProducts(products, forceCompare);
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

  function confirmComparison() {
    if (!pendingConfirmation) return;
    const confirmedProducts = confirmProducts
      .map(({ category, detectedFrom, sourceDoc, nameAsGiven, nameNormalized, correctionMade, note, originalName, ...product }) => ({
        ...product,
        name: product.name.trim()
      }))
      .filter((product) => product.name);
    if (confirmedProducts.length < 2) {
      setError("Keep at least two products to compare.");
      return;
    }

    const confirmed: StartResponse = {
      ...pendingConfirmation,
      products: confirmedProducts
    };
    saveSessionData(confirmed.comparisonId, confirmed);
    const href = `/compare/${confirmed.comparisonId}/clarify`;
    upsertComparisonHistory({
      id: confirmed.comparisonId,
      title: confirmed.products.map((product) => product.name).join(" vs "),
      href,
      status: "clarify"
    });
    router.push(href);
  }

  function cancelConfirmation() {
    setPendingConfirmation(null);
    setConfirmProducts([]);
    setError(null);
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

  async function submitGeneralSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!generalQuery.trim() || generalLoading) return;

    setGeneralLoading(true);
    setGeneralResults([]);
    setGeneralError(null);
    setGeneralSearched(true);
    setSelectedGeneralProducts([]);

    try {
      const savedProfile = readSavedProfile();
      const res = await fetch("/api/search/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          need: generalQuery.trim(),
          ...(savedProfile ? { profile: savedProfile } : {})
        })
      });
      const data = (await res.json()) as DiscoverResponse;
      if (!res.ok) {
        throw new Error(data.error || "Search failed.");
      }
      setGeneralResults(data.products);
      setSelectedGeneralProducts(data.products.map((result) => result.name));
      if (data.products.length === 0) {
        setGeneralError("No clear matches yet. Try describing it differently.");
      }
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : "No clear matches yet. Try describing it differently."
      );
      setGeneralResults([]);
    } finally {
      setGeneralLoading(false);
    }
  }

  function toggleGeneralProduct(productName: string) {
    setSelectedGeneralProducts((current) => {
      const isSelected = current.includes(productName);
      if (isSelected) {
        if (current.length <= 2) return current;
        return current.filter((name) => name !== productName);
      }

      return [...current, productName];
    });
  }

  function compareGeneralProducts() {
    if (selectedGeneralProducts.length < 2 || loading) return;
    const selectedProducts = selectedGeneralProducts.map((name) => ({
      name,
      description: "",
      files: []
    }));
    void submitProducts(selectedProducts);
  }

  return (
    <main className="relative min-h-screen px-4 pb-32 pt-12">
      <AnimatePresence>{loading && <GeneratingOverlay products={products} />}</AnimatePresence>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
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
      {pendingConfirmation ? (
        <ProductConfirmationPage
          products={confirmProducts}
          onChange={setConfirmProducts}
          onConfirm={confirmComparison}
          onBack={cancelConfirmation}
          error={error}
        />
      ) : incomparableMessage ? (
        <IncomparablePage
          message={incomparableMessage}
          products={products.map((product) => product.name)}
          onContinue={() => submit(true)}
          onBack={() => {
            setIncomparableMessage(null);
            setError(null);
          }}
        />
      ) : (
        <>
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center">
        <ModeToggle mode={mode} onChange={selectMode} />

        <AnimatedText
          text={greeting}
          textClassName="text-lg font-semibold text-blue-300 light:text-blue-700"
          underlineClassName="text-blue-400 light:text-blue-600"
          underlinePath="M 0,10 Q 75,0 150,10 Q 225,20 300,10"
          underlineHoverPath="M 0,10 Q 75,20 150,10 Q 225,0 300,10"
          underlineDuration={1.2}
          className="mb-9"
        />

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

        {mode === "add_products" ? (
          <>
        <div ref={cardsRef} className={`mb-6 w-full ${formOpen ? "overflow-x-auto pb-2" : ""}`}>
          <div className={
            showInitialAdd
              ? "flex w-full justify-center"
              : formOpen
                ? "flex min-w-max gap-3"
                : "flex flex-wrap justify-center gap-4"
          }>
            <AnimatePresence initial={false}>
              {products.map((product, index) => (
                <ProductCard
                  key={`${product.name}-${index}`}
                  product={product}
                  isEditing={editingIndex === index}
                  compact={formOpen}
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
              <AddProductSlot isActive={formOpen && editingIndex === null} compact={formOpen} onClick={openForm} />
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
          </>
        ) : (
          <GeneralSearchPanel
            query={generalQuery}
            loading={generalLoading}
            results={generalResults}
            error={generalError}
            searched={generalSearched}
            selectedProductNames={selectedGeneralProducts}
            comparing={loading}
            onQueryChange={setGeneralQuery}
            onSubmit={submitGeneralSearch}
            onToggleProduct={toggleGeneralProduct}
            onCompare={compareGeneralProducts}
          />
        )}

      </div>

      {mode === "add_products" && (
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
              ? "Add 2 products or documents"
              : namedProductCount < 2 && documentReadyCount < 2
                ? "Add 1 more product or document"
                : `Analyze ${products.length} products →`}
          </motion.button>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </div>
      </div>
      )}
        </>
      )}
    </main>
  );
}

function ModeToggle({
  mode,
  onChange
}: {
  mode: HomeMode;
  onChange: (mode: HomeMode) => void;
}) {
  return (
    <div className="mb-7 inline-flex rounded-2xl border border-white/10 light:border-zinc-200 bg-zinc-950/70 light:bg-white/80 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.22)] light:shadow-sm backdrop-blur-xl">
      {[
        { id: "add_products" as const, label: "Add Products" },
        { id: "general_search" as const, label: "General Search" }
      ].map((item) => {
        const active = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-blue-500 text-white shadow-[0_6px_20px_rgba(45,113,191,0.28)]"
                : "text-zinc-400 light:text-zinc-600 hover:text-zinc-100 light:hover:text-zinc-900"
            }`}
            aria-pressed={active}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function GeneralSearchPanel({
  query,
  loading,
  results,
  error,
  searched,
  selectedProductNames,
  comparing,
  onQueryChange,
  onSubmit,
  onToggleProduct,
  onCompare
}: {
  query: string;
  loading: boolean;
  results: DiscoverProduct[];
  error: string | null;
  searched: boolean;
  selectedProductNames: string[];
  comparing: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleProduct: (productName: string) => void;
  onCompare: () => void;
}) {
  const selectedCount = selectedProductNames.length;
  const canCompareSelected = selectedCount >= 2 && !comparing;

  return (
    <div className="w-full">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-white/10 light:border-zinc-200 bg-white/[0.04] light:bg-white p-5 shadow-[0_8px_40px_rgba(0,0,0,0.4)] light:shadow-sm backdrop-blur-xl"
      >
        <label htmlFor="general-search" className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          General Search
        </label>
        <textarea
          id="general-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          rows={5}
          disabled={loading}
          placeholder={"Describe exactly what you need… (e.g. 'a CRM for a 40-person non-technical sales team, budget-conscious, must integrate with Slack')"}
          className="w-full resize-none bg-transparent text-base leading-7 text-white light:text-zinc-900 outline-none placeholder:text-zinc-500"
        />
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 light:border-zinc-200 pt-4">
          <p className="text-xs text-zinc-500">Uses web search to find real products with sources.</p>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="relative rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Searching
              </span>
            ) : (
              "Search"
            )}
          </button>
        </div>
      </form>

      {loading && (
        <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-200 light:text-blue-700">
          Searching the web for credible product matches.
        </div>
      )}

      {!loading && error && (
        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200 light:text-amber-700">
          {error}
        </div>
      )}

      {!loading && searched && !error && results.length === 0 && (
        <div className="mt-5 rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-950/70 light:bg-white/90 p-4 text-sm text-zinc-400 light:text-zinc-600">
          No clear matches yet. Try describing it differently.
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-5 rounded-2xl border border-white/10 light:border-zinc-200 bg-zinc-950/70 light:bg-white/90 p-5 shadow-[0_8px_40px_rgba(0,0,0,0.28)] light:shadow-sm backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-white light:text-zinc-900">Product matches</h2>
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300 light:text-blue-700">
              Web-sourced
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((result) => (
              <label
                key={result.name}
                className={`block rounded-xl border p-4 transition-colors ${
                  selectedProductNames.includes(result.name)
                    ? "border-blue-500/50 bg-blue-500/10 light:bg-blue-50"
                    : "border-zinc-800 light:border-zinc-200 bg-zinc-900/80 light:bg-zinc-50"
                }`}
              >
                <div className="mb-2 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedProductNames.includes(result.name)}
                    onChange={() => onToggleProduct(result.name)}
                    disabled={selectedProductNames.includes(result.name) && selectedCount <= 2}
                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 accent-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ProductLogo name={result.name} size={28} />
                      <h3 className="truncate text-sm font-semibold text-zinc-100 light:text-zinc-900">{result.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{result.category} · {Math.round(result.confidence * 100)}% confidence</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-400 light:text-zinc-600">{result.reason}</p>
                    <a
                      href={result.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block max-w-full truncate text-xs text-blue-300 light:text-blue-700 hover:text-blue-200 light:hover:text-blue-600"
                    >
                      {result.source_url}
                    </a>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-zinc-800 light:border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-500">
              {selectedCount < 2 ? "Select at least 2 products to compare." : "Keep at least 2 selected to compare."}
            </p>
            <button
              type="button"
              onClick={onCompare}
              disabled={!canCompareSelected}
              className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {comparing ? "Starting comparison..." : `Compare these (${selectedCount})`}
            </button>
          </div>
        </section>
      )}
    </div>
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

function ProductConfirmationPage({
  products,
  onChange,
  onConfirm,
  onBack,
  error
}: {
  products: ConfirmableProduct[];
  onChange: (products: ConfirmableProduct[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  error: string | null;
}) {
  function updateProduct(index: number, patch: Partial<ConfirmableProduct>) {
    onChange(products.map((product, productIndex) => (productIndex === index ? { ...product, ...patch } : product)));
  }

  function removeProduct(index: number) {
    onChange(products.filter((_, productIndex) => productIndex !== index));
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl items-center justify-center">
      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="w-full rounded-3xl border border-zinc-800 light:border-zinc-200 bg-zinc-950/90 light:bg-white/90 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8"
      >
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-blue-300 light:text-blue-700">Confirm products</p>
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-white light:text-zinc-900 sm:text-4xl">
          Check the product names before analysis.
        </h1>
        <p className="mb-6 max-w-2xl text-sm leading-6 text-zinc-400 light:text-zinc-600">
          Use the suggested correction, revert to the original text, edit a name, or remove anything that should not be compared.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {products.map((product, index) => (
            <div key={`${product.originalName}-${index}`} className="rounded-2xl border border-zinc-800 light:border-zinc-200 bg-zinc-900/80 light:bg-zinc-50 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    {product.detectedFrom === "document" ? `From ${product.sourceDoc ?? "uploaded document"}` : "Typed"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">{product.category ?? "Category not identified"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeProduct(index)}
                  className="rounded-lg px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 light:hover:bg-zinc-100 light:hover:text-zinc-700"
                >
                  Remove
                </button>
              </div>

              {product.correctionMade && product.nameAsGiven && product.nameNormalized && (
                <div className="mb-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
                  <span className="text-zinc-400">Suggested correction:</span>{" "}
                  <span className="line-through decoration-blue-300/60">{product.nameAsGiven}</span>
                  <span> → </span>
                  <span className="font-semibold text-white light:text-zinc-900">{product.nameNormalized}</span>
                  {product.note && <p className="mt-1 text-xs text-blue-200/80">{product.note}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateProduct(index, { name: product.nameNormalized ?? product.name })}
                      className="rounded-lg bg-blue-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-400"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProduct(index, { name: product.nameAsGiven ?? product.originalName })}
                      className="rounded-lg border border-blue-400/30 px-2.5 py-1 text-xs font-semibold text-blue-100 hover:bg-blue-500/10"
                    >
                      Revert
                    </button>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">Confirmed name</span>
                <input
                  value={product.name}
                  onChange={(event) => updateProduct(index, { name: event.target.value })}
                  className="w-full rounded-xl border border-zinc-700 light:border-zinc-300 bg-zinc-950 light:bg-white px-3 py-2 text-sm text-white light:text-zinc-900 outline-none transition-colors focus:border-blue-400"
                />
              </label>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-300"
          >
            Confirm and continue
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-zinc-700 light:border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-200 light:text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-900 light:hover:bg-zinc-100"
          >
            Back to edit
          </button>
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
        <span className="text-zinc-200">{products.map(displayProductName).join(" vs ")}</span>.
      </p>
    </motion.div>
  );
}

function ProductCard({
  product,
  isEditing,
  compact,
  onEdit,
  onRemove
}: {
  product: Product;
  isEditing: boolean;
  compact: boolean;
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
      className={`relative shrink-0 cursor-pointer rounded-xl border backdrop-blur-md transition-shadow ${
        compact ? "h-24 w-52 p-4" : "w-64 min-h-[160px] p-5"
      } ${
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
        aria-label={`Remove ${displayProductName(product)}`}
      >
        ×
      </button>
      <div className={`pr-7 ${isEditing ? "pt-5" : ""}`}>
        <div className={`flex items-center gap-2 ${compact ? "mb-1" : "mb-3"}`}>
          <ProductLogo name={displayProductName(product)} size={compact ? 24 : 36} />
          <p className={`truncate font-medium text-white light:text-zinc-900 ${compact ? "text-sm" : "text-base"}`}>
            {displayProductName(product)}
          </p>
        </div>
        <p className={`overflow-hidden text-zinc-400 light:text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] ${compact ? "text-xs leading-5 [-webkit-line-clamp:2]" : "text-sm leading-6 [-webkit-line-clamp:4]"}`}>
          {product.description || "No note added"}
        </p>
        {product.files.length > 0 && (
          <div className={`flex items-center gap-1 text-xs text-zinc-500 ${compact ? "mt-2" : "mt-3"}`}>
            <PaperclipIcon />
            {product.files.length} file{product.files.length === 1 ? "" : "s"}
          </div>
        )}
        {!compact && (
          <p className="mt-4 text-[11px] text-zinc-600 light:text-zinc-400">Double-click to edit</p>
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

function AddProductSlot({ isActive, compact, onClick }: { isActive: boolean; compact: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex shrink-0 flex-col items-center justify-center rounded-xl border border-dashed backdrop-blur-md transition-colors ${
        compact ? "h-24 w-52" : "w-64 min-h-[160px]"
      } ${
        isActive
          ? "border-blue-400/70 bg-blue-400/5 text-transparent shadow-[0_0_0_1px_rgba(45,113,191,0.16),0_0_32px_rgba(45,113,191,0.18)]"
          : "border-white/15 light:border-zinc-300 bg-white/[0.02] light:bg-zinc-50 text-zinc-500 hover:border-blue-400/40 hover:text-zinc-300 light:hover:text-blue-700"
      }`}
      aria-label={isActive ? "Product entry active" : "Add product"}
    >
      {!isActive && (
        <>
          <span className={`leading-none ${compact ? "text-2xl" : "text-4xl"}`}>+</span>
          <span className={`${compact ? "mt-1 text-sm" : "mt-3 text-base font-semibold"}`}>Add product</span>
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

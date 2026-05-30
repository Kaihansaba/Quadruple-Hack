# PRD — Quantified Purchase Decision Engine (working title: "Verdict")

## 1. One-liner

A B2B decision engine that takes two or more candidate products/vendors, gathers
evidence from the live web, and produces a **quantified, defensible recommendation**
— a ranked score with a clear breakdown of *why*, personalized to what the buying
company already knows about itself.

## 2. The problem

Buying decisions (a cybersecurity vendor, a SaaS tool, a fleet of laptops) drown in
noise: marketing claims, contradictory reviews, scattered specs, and opinions. Every
vendor says they're the best. Buyers can't easily turn this into an apples-to-apples
number, and procurement has no defensible artifact to justify the spend.

## 3. Target user (v1)

B2B buyer — procurement lead, IT/security decision-maker, or ops manager choosing
between vendors/SaaS products. For the demo we operate as a **single, pre-configured
company** (no login, no multi-tenant). B2C is explicitly out of scope for v1.

## 4. Core architectural principle (non-negotiable)

**The LLM extracts and narrates. Deterministic code does the scoring.**

The model is used to (a) gather and structure messy evidence, (b) propose criteria
and weights, and (c) write the final human-readable verdict. The actual ranking math
runs in plain TypeScript. This makes results **reproducible, fast, auditable, and
defensible** — the same inputs always produce the same scores, and we can point at
exactly which criterion and which source drove each result. We never ask the model
"which is better?" and accept its number.

## 5. Scope

### In scope (v1 / demo)
- B2B vendor/product comparison, 2–5 candidates per comparison.
- Input by product **name or URL** (no document upload in v1).
- **Live web search/fetch** at compare time to gather evidence.
- Pre-configured demo **company profile** that influences criteria, weights, and
  dealbreakers.
- AI-generated clarifying questions with **suggested, selectable answers** (user can
  also free-type), styled like Claude's option chips.
- Deterministic scoring engine (normalize → weight → rank → sensitivity).
- Results screen: ranked leaderboard, per-criterion scorecard, radar chart, written
  verdict with citations, and a **chat-to-refine** thread.
- Persistence in Supabase; deploy on Vercel.

### Out of scope (v1)
- Auth / multi-user / real company onboarding.
- Document/PDF/RFP upload and parsing.
- Approval workflows, audit-trail sign-off, multi-stakeholder weighting.
- B2C mode.
- Learning preferences over time across comparisons.

## 6. User flow & UI

The product is a 3-screen flow that visually starts like a familiar AI chat, then
progressively reveals structure.

### Step 1 — Add products (generic chat-style entry)
- Clean, centered chat interface (matches the reference screenshot: big greeting,
  single input box, suggestion chips).
- User enters the products to compare — names or URLs — e.g. "Compare CrowdStrike
  Falcon vs SentinelOne Singularity."
- On submit, the app fires **API Call 1** (criteria + clarifying questions).
- UI improvement: as products are recognized, show a lightweight **product card row**
  (name, logo/favicon, "remove") so the user confirms what's being compared before
  going deeper.

### Step 2 — Clarify what matters (AI-suggested answers)
- The app renders AI-generated, product-category-specific clarifying questions, each
  with **2–4 suggested answer chips** plus a free-text option (Claude-style).
- Three distinct input types on this screen, kept visually separate:
  1. **Priorities** — what matters most (drives weights).
  2. **Must-haves / dealbreakers** — hard requirements (drive *filters*, not weights).
  3. **Open clarifications** — category-specific (e.g. "How many seats?", "On-prem or
     cloud?").
- **Profile pre-fill (the demo moment):** suggested answers and dealbreakers arrive
  **pre-selected based on the stored company profile**. Visually mark these as
  "from your company profile" so it's obvious the system already knows the buyer.
- On submit, the app fires **API Call 2** (extraction + weight proposal), then runs
  the deterministic engine.

### Step 3 — Results + refine
- **Ranked leaderboard** with composite scores at the top (the headline number).
- **Scorecard matrix** — options × criteria, color-coded, showing per-criterion
  normalized scores and the raw value behind each.
- **Radar chart** per option for shape-of-strengths.
- **Verdict panel** — the written recommendation, top 3 reasons, each with a
  **citation** to its source. Explicitly references profile-driven decisions.
- **Sensitivity callout** — "If you weighted price ~15% higher, B overtakes A."
- **Chat-to-refine** — a persistent thread. Messages like "what if budget didn't
  matter?" adjust weights and **re-run the deterministic engine** (not the LLM
  scoring); the model only narrates the change.
- UI improvement: make the weight sliders **visible and editable** on this screen.
  Dragging a slider re-runs the engine live — this is the most visceral demo beat and
  reuses the same code path as chat-to-refine.

## 7. The engine (pipeline)

Three LLM calls bracket one deterministic core.

### API Call 1 — Criteria + clarifying questions
- Input: the product list (+ company profile).
- Output (structured JSON): a **unified criteria set** for the category (same axes for
  every product), plus category-specific clarifying questions with suggested answers,
  with profile-relevant answers pre-marked.
- Why a unified set up front: prevents Product A having "battery life" and Product B
  having "battery" — locks the columns before extraction.

### API Call 2 — Extraction + weight proposal (uses live web search)
- Input: locked criteria set + user's clarification answers + company profile.
- The model gathers evidence via OpenRouter's **web plugin** (see §8) and extracts each
  product's value for **every criterion**. For each value it returns: `raw_value`,
  `source_url`, `source_type` (spec / expert_review / user_review / vendor_claim), and
  `confidence`. The plugin returns source URLs as annotations, which we persist as the
  `source_url` for each extracted value (and reuse for citations in Call 3).
- The model also **proposes weights** (0–1, summing to 1) from the stated priorities
  and profile — but these are *proposals* the engine and user can adjust.

### Deterministic core (TypeScript, ~150 lines)
1. **Reconcile** multiple values per cell via credibility-weighted merge (lookup table:
   expert/verified > user review > vendor claim). Keep variance → surface as a
   "sources disagree" flag.
2. **Apply dealbreakers** as hard filters — any product failing a must-have is
   eliminated before scoring (kept separate from weights).
3. **Normalize** every criterion to 0–1, respecting direction (lower-is-better for
   price, higher-is-better for uptime). Qualitative criteria scored 0–10 against a
   rubric by the LLM in Call 2, then normalized here. Missing data is imputed +
   flagged low-confidence, never silently treated as zero.
4. **Score & rank:** `composite = Σ(weight × normalized_value)`. Store **per-criterion
   contributions** so the verdict can say "won mostly on support + price."
5. **Sensitivity:** sweep weights, find the tipping point that flips the ranking.

### API Call 3 — Verdict narration
- Input: the computed scores, contributions, dealbreaker outcomes, sources.
- Output: the written verdict with citations — grounded entirely in the structured
  numbers, not raw web text.

## 8. Data sourcing

Live web search at compare time (Call 2), via **OpenRouter**. OpenRouter exposes an
OpenAI-compatible chat-completions API, so one HTTP client covers every model.

**Live web data** is added one of two ways:
- Append `:online` to the model slug (e.g. `anthropic/claude-sonnet-4.5:online`), or
- Pass a web plugin in the request body: `plugins: [{ id: "web" }]` (optionally with
  `max_results` and a custom `search_prompt`).

This is OpenRouter's **managed web plugin**, not a model-native search tool — it runs a
search, injects results into context, and returns the source URLs as message
annotations. Capture those annotations as the `source_url` per extracted value.

**Structured output:** request JSON via `response_format: { type: "json_object" }` (or
`json_schema` on models that support it). Note the web plugin and strict JSON modes can
interact awkwardly on some models — if a model refuses to combine them, do extraction in
two hops (search call → then a JSON-formatting call over the returned text), or pick a
model slug known to support both. Validate the JSON server-side and retry once.

**Model choice:** because OpenRouter abstracts the provider, keep the model slug in an
env var so you can swap Claude / GPT / Gemini without code changes. Pick one strong model
for extraction (Call 2) and a cheaper/faster one for narration (Call 3) if you want to
save cost.

**Demo reliability:** cache the evidence for the 2–3 demo products in Supabase after a
clean run. On stage, attempt the live plugin call; if the conference network is flaky,
fall back silently to the cached evidence so the demo never stalls.

**Key safety:** the `OPENROUTER_API_KEY` lives only in Vercel server env; all OpenRouter
calls go through the serverless API routes, never the browser.

## 9. The demo "wow" moment

Run the same comparison twice — once "anonymous", once "as the demo company" — and show
the recommendation **flip** because a stored compliance requirement eliminated the
otherwise-winning vendor. The verdict text names the reason explicitly. This makes the
"knows you" moat legible in seconds.

## 10. Architecture & stack

- **Frontend:** React + TypeScript. Recommend **Next.js (App Router)** so UI and the
  serverless API routes live in one Vercel deploy (cleaner than Vite + separate
  functions for this use case).
- **API layer:** Vercel serverless functions / Next.js route handlers. All LLM calls
  and web search run server-side (key safety, CORS).
- **LLM:** **OpenRouter** (OpenAI-compatible chat-completions API). Model slug kept in
  an env var for easy swapping; live data via the web plugin; structured outputs via
  `response_format` (see §8).
- **Database:** Supabase (Postgres). Stores the company profile, comparisons, products,
  criteria, extracted values, computed results, and chat messages.
- **Deploy:** Vercel. Supabase env vars + Claude API key in Vercel project settings.

```
React/Next (UI)  ──>  Vercel API routes  ──>  OpenRouter (+ web plugin)
       │                      │
       │                      └──>  Deterministic scoring engine (TS)
       │                      │
       └──────────────────────┴──>  Supabase (profile, comparisons, results, chat)
```

## 11. Data model (Supabase)

```
company_profile        -- single demo row
  id, name, industry, size, budget_ceiling,
  tech_stack (jsonb), compliance_reqs (jsonb),
  preferred_suppliers (jsonb), default_weights (jsonb)

comparisons
  id, title, category, status, created_at

products
  id, comparison_id (fk), name, url, logo_url, raw_metadata (jsonb)

criteria
  id, comparison_id (fk), name, unit, direction (higher|lower),
  type (soft|hard), weight (float)          -- weight null when type=hard

extracted_values                            -- one row per (product, criterion, source)
  id, product_id (fk), criterion_id (fk),
  raw_value, normalized_value (float),
  source_url, source_type, confidence (float)

clarifications
  id, comparison_id (fk), question,
  suggested_answers (jsonb), chosen_answer,
  from_profile (bool)

results
  id, comparison_id (fk),
  composite_scores (jsonb),                 -- {product_id: score}
  contributions (jsonb),                    -- per-criterion breakdown
  sensitivity (jsonb), verdict (text)

messages                                    -- chat-to-refine thread
  id, comparison_id (fk), role (user|assistant), content, created_at
```

## 12. API endpoints

```
POST /api/comparisons/start
  body: { products: [name|url], category? }
  -> creates comparison; Call 1; returns criteria + clarifying questions

POST /api/comparisons/:id/clarify
  body: { answers: [...], dealbreakers: [...], priorities: [...] }
  -> Call 2 (extraction + web search + weight proposal),
     runs deterministic engine, persists results; returns results

POST /api/comparisons/:id/reweight
  body: { weights: {criterion_id: float} }
  -> re-runs deterministic engine only (no LLM); returns updated results
     (powers both the sliders and chat-to-refine)

POST /api/comparisons/:id/chat
  body: { message }
  -> interprets intent (e.g. adjust weights) -> reweight + Call 3 narration
```

## 13. Build plan (hackathon milestones)

Ordered so there's always a working artifact, riskiest demo-critical parts de-risked
early.

1. **Deterministic engine first.** Pure TS module: normalize → reconcile → filter →
   weight → score → sensitivity. Unit-test with hardcoded data. This is the core and
   must never break on stage. (~150 lines.)
2. **Supabase schema + seed** the demo company profile and 2–3 demo products.
3. **Step 3 results screen** wired to the engine with seeded data — leaderboard,
   scorecard, radar, sliders. Get the payoff screen looking great early.
4. **Call 2** (extraction + web search + weight proposal) feeding real data into the
   engine. Add cached fallback.
5. **Step 2 clarification screen** with AI-suggested answers + profile pre-fill.
6. **Step 1 chat-style entry** + **Call 1** (criteria + questions).
7. **Call 3 verdict** + **chat-to-refine**.
8. Deploy to Vercel; rehearse the profile-flip demo.

If time runs short, cut in this order: chat-to-refine → sensitivity → radar. Keep the
leaderboard, scorecard, verdict, and the profile-flip moment at all costs.

## 14. Risks & mitigations

- **Flaky live web data on demo network** → cached evidence fallback (§8).
- **LLM returns malformed JSON** → request `response_format` JSON; validate against a
  schema server-side; retry once. If the web plugin + strict JSON don't combine on the
  chosen model, split extraction into a search hop then a JSON-formatting hop (§8).
- **Criteria mismatch across products** → lock the unified criteria set in Call 1
  before any extraction.
- **Scoring feels like a black box** → keep math in code; expose per-criterion
  contributions in the UI so every number is traceable.
- **Scope creep** → §5 out-of-scope list is firm for v1.

## 15. Future (post-hackathon)

Auth + real multi-tenant onboarding, document/RFP upload, supplier-quote comparison &
TCO, approval workflows with audit trail, multi-stakeholder weighting, preference
learning over time, B2C mode.

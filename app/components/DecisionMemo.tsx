import type { ReactNode } from "react";

export type MemoSourceType = "spec" | "expert_review" | "user_review" | "vendor_claim";

export type MemoCriterion = {
  id: string;
  name: string;
  weight: number;
  direction: "higher" | "lower";
  rationale: string;
  fromProfile?: boolean;
};

export type MemoVendor = {
  id: string;
  name: string;
  estimatedCost: string;
  compositeScore: number;
};

export type MemoScoreCell = {
  vendorId: string;
  criterionId: string;
  normalizedScore: number;
  sourcesDisagree?: boolean;
};

export type MemoSource = {
  id: string;
  label: string;
  url: string;
  sourceType: MemoSourceType;
  confidence: number;
  relatedVendorId?: string;
  relatedCriterionId?: string;
  sourcesDisagree?: boolean;
};

export type MemoData = {
  title: string;
  to: string;
  from: string;
  date: string;
  subject: string;
  decisionStatus: string;
  preparedBy: string;
  totalEstimatedCost: string;
  selectedVendorId: string;
  criteria: MemoCriterion[];
  vendors: MemoVendor[];
  scores: MemoScoreCell[];
  contributions: Record<string, Record<string, number>>;
  robustness: {
    winFrequency: Record<string, number>;
    worstCaseRank: Record<string, number>;
    flipThreshold: number | null;
    flipCriterionName: string | null;
    runnerUpVendorId: string | null;
  };
  alternativeReasons: Array<{
    vendorId: string;
    reason: string;
  }>;
  riskSummary: string;
  sources: MemoSource[];
};

export const mockDecisionMemo: MemoData = {
  title: "Vendor Selection Decision Memo",
  to: "Avery Chen, VP Revenue Operations",
  from: "Procurement Strategy Team",
  date: "May 31, 2026",
  subject: "CRM platform selection for regulated mid-market sales team",
  decisionStatus: "Recommended for Approval",
  preparedBy: "Kai Han Saba",
  totalEstimatedCost: "$48,000 annual subscription and implementation support",
  selectedVendorId: "nimbus",
  criteria: [
    {
      id: "annual_cost",
      name: "Annual cost",
      weight: 0.3,
      direction: "lower",
      rationale: "Budget fit is important, but not at the expense of security and adoption.",
      fromProfile: true
    },
    {
      id: "integration_fit",
      name: "Fit with existing stack",
      weight: 0.25,
      direction: "higher",
      rationale: "The team needs clean handoff with Slack, Google Workspace, and the existing BI stack.",
      fromProfile: true
    },
    {
      id: "admin_usability",
      name: "Admin usability",
      weight: 0.2,
      direction: "higher",
      rationale: "Sales operations must be able to configure fields, routing, and reporting without engineering.",
      fromProfile: false
    },
    {
      id: "implementation_support",
      name: "Implementation support",
      weight: 0.25,
      direction: "higher",
      rationale: "Vendor-led onboarding reduces launch risk for a time-boxed rollout.",
      fromProfile: false
    }
  ],
  vendors: [
    {
      id: "nimbus",
      name: "Nimbus CRM",
      estimatedCost: "$48,000",
      compositeScore: 0.82
    },
    {
      id: "ledgerflow",
      name: "LedgerFlow Sales Cloud",
      estimatedCost: "$68,000",
      compositeScore: 0.73
    },
    {
      id: "pipelane",
      name: "Pipelane",
      estimatedCost: "$39,000",
      compositeScore: 0.61
    }
  ],
  scores: [
    { vendorId: "nimbus", criterionId: "annual_cost", normalizedScore: 0.71, sourcesDisagree: true },
    { vendorId: "nimbus", criterionId: "integration_fit", normalizedScore: 0.84 },
    { vendorId: "nimbus", criterionId: "admin_usability", normalizedScore: 0.81 },
    { vendorId: "nimbus", criterionId: "implementation_support", normalizedScore: 0.82 },
    { vendorId: "ledgerflow", criterionId: "annual_cost", normalizedScore: 0.38 },
    { vendorId: "ledgerflow", criterionId: "integration_fit", normalizedScore: 0.94 },
    { vendorId: "ledgerflow", criterionId: "admin_usability", normalizedScore: 0.78 },
    { vendorId: "ledgerflow", criterionId: "implementation_support", normalizedScore: 0.95 },
    { vendorId: "pipelane", criterionId: "annual_cost", normalizedScore: 1 },
    { vendorId: "pipelane", criterionId: "integration_fit", normalizedScore: 0.68 },
    { vendorId: "pipelane", criterionId: "admin_usability", normalizedScore: 0.89 },
    { vendorId: "pipelane", criterionId: "implementation_support", normalizedScore: 0.67 }
  ],
  contributions: {
    nimbus: {
      annual_cost: 0.213,
      integration_fit: 0.21,
      admin_usability: 0.162,
      implementation_support: 0.205
    },
    ledgerflow: {
      annual_cost: 0.114,
      integration_fit: 0.235,
      admin_usability: 0.156,
      implementation_support: 0.238
    },
    pipelane: {
      annual_cost: 0.3,
      integration_fit: 0.17,
      admin_usability: 0.178,
      implementation_support: 0.168
    }
  },
  robustness: {
    winFrequency: {
      nimbus: 0.94,
      ledgerflow: 0.06,
      pipelane: 0
    },
    worstCaseRank: {
      nimbus: 2,
      ledgerflow: 2,
      pipelane: 3
    },
    flipThreshold: 0.18,
    flipCriterionName: "implementation support",
    runnerUpVendorId: "ledgerflow"
  },
  alternativeReasons: [
    {
      vendorId: "ledgerflow",
      reason:
        "LedgerFlow has stronger support depth, but its materially higher annual cost lowered the total value score."
    },
    {
      vendorId: "pipelane",
      reason:
        "Pipelane is the lowest-cost option, but it trails on implementation support and integration fit for the current stack."
    }
  ],
  riskSummary:
    "Nimbus pricing evidence had some variance between vendor pricing and user-reported deal data; procurement should confirm final commercial terms before signature.",
  sources: [
    {
      id: "source_1",
      label: "Nimbus CRM pricing page",
      url: "https://example.com/nimbus/pricing",
      sourceType: "spec",
      confidence: 0.92,
      relatedVendorId: "nimbus",
      relatedCriterionId: "annual_cost",
      sourcesDisagree: true
    },
    {
      id: "source_2",
      label: "Nimbus CRM customer pricing review",
      url: "https://example.com/reviews/nimbus-pricing",
      sourceType: "user_review",
      confidence: 0.7,
      relatedVendorId: "nimbus",
      relatedCriterionId: "annual_cost",
      sourcesDisagree: true
    },
    {
      id: "source_3",
      label: "LedgerFlow implementation partner review",
      url: "https://example.com/expert/ledgerflow-implementation",
      sourceType: "expert_review",
      confidence: 0.9,
      relatedVendorId: "ledgerflow",
      relatedCriterionId: "implementation_support"
    },
    {
      id: "source_4",
      label: "Pipelane integrations overview",
      url: "https://example.com/pipelane/integrations",
      sourceType: "vendor_claim",
      confidence: 0.72,
      relatedVendorId: "pipelane",
      relatedCriterionId: "integration_fit"
    }
  ]
};

type DecisionMemoProps = {
  memo: MemoData;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function score(value: number) {
  return Math.round(value * 100);
}

function sourceTypeLabel(type: MemoSourceType) {
  return type.replace("_", " ");
}

export function DecisionMemo({ memo }: DecisionMemoProps) {
  const selectedVendor = memo.vendors.find((vendor) => vendor.id === memo.selectedVendorId) ?? memo.vendors[0];
  const runnerUp = memo.vendors.find((vendor) => vendor.id === memo.robustness.runnerUpVendorId);
  const selectedContributions = memo.contributions[selectedVendor.id] ?? {};
  const topCriterion =
    memo.criteria
      .map((criterion) => ({
        criterion,
        contribution: selectedContributions[criterion.id] ?? 0
      }))
      .sort((a, b) => b.contribution - a.contribution)[0]?.criterion ?? memo.criteria[0];
  const selectedWinFrequency = memo.robustness.winFrequency[selectedVendor.id] ?? 0;
  const selectedWorstRank = memo.robustness.worstCaseRank[selectedVendor.id];

  return (
    <article className="decision-memo" aria-label={memo.title}>
      <style dangerouslySetInnerHTML={{ __html: memoStyles }} />

      <footer className="memo-print-footer" aria-hidden="true">
        {memo.title}
      </footer>

      <section className="memo-page memo-header-block">
        <div className="memo-title-row">
          <div>
            <p className="memo-kicker">Procurement recommendation</p>
            <h1>{memo.title}</h1>
          </div>
          <div className="memo-status">{memo.decisionStatus}</div>
        </div>

        <div className="memo-meta-grid">
          <MemoMeta label="To" value={memo.to} />
          <MemoMeta label="From" value={memo.from} />
          <MemoMeta label="Date" value={memo.date} />
          <MemoMeta label="Subject" value={memo.subject} />
          <MemoMeta label="Total estimated cost" value={memo.totalEstimatedCost} strong />
          <MemoMeta label="Decision status" value={memo.decisionStatus} strong />
        </div>
      </section>

      <MemoSection title="Recommendation">
        <p className="memo-recommendation">
          Recommend approving <strong>{selectedVendor.name}</strong> because it contributed most on{" "}
          <strong>{topCriterion.name}</strong>, the strongest driver in the weighted evaluation.
        </p>
        <div className="memo-figure-row">
          <div>
            <span>Composite score</span>
            <strong>{score(selectedVendor.compositeScore)}</strong>
          </div>
          <div>
            <span>Robustness</span>
            <strong>Wins in {percent(selectedWinFrequency)}</strong>
          </div>
          <div>
            <span>Cost estimate</span>
            <strong>{selectedVendor.estimatedCost}</strong>
          </div>
        </div>
      </MemoSection>

      <MemoSection title="Decision Criteria & Weights">
        <table className="memo-table">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Weight</th>
              <th>Direction</th>
              <th>Why this weight</th>
            </tr>
          </thead>
          <tbody>
            {memo.criteria.map((criterion) => (
              <tr key={criterion.id}>
                <td>
                  <strong>{criterion.name}</strong>
                  {criterion.fromProfile && <span className="memo-profile-chip">Company profile</span>}
                </td>
                <td>{percent(criterion.weight)}</td>
                <td>{criterion.direction === "higher" ? "Higher better" : "Lower better"}</td>
                <td>{criterion.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MemoSection>

      <MemoSection title="Evaluation Summary">
        <table className="memo-table memo-scorecard">
          <thead>
            <tr>
              <th>Criterion</th>
              {memo.vendors.map((vendor) => (
                <th key={vendor.id} className={vendor.id === selectedVendor.id ? "memo-winner-column" : ""}>
                  {vendor.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {memo.criteria.map((criterion) => (
              <tr key={criterion.id}>
                <td>
                  <strong>{criterion.name}</strong>
                  <span>{percent(criterion.weight)} weight</span>
                </td>
                {memo.vendors.map((vendor) => {
                  const cell = memo.scores.find(
                    (item) => item.vendorId === vendor.id && item.criterionId === criterion.id
                  );
                  return (
                    <td key={vendor.id} className={vendor.id === selectedVendor.id ? "memo-winner-column" : ""}>
                      {cell ? score(cell.normalizedScore) : "N/A"}
                      {cell?.sourcesDisagree && <span className="memo-dispute">Sources disagree</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="memo-composite-row">
              <td>Composite</td>
              {memo.vendors.map((vendor) => (
                <td key={vendor.id} className={vendor.id === selectedVendor.id ? "memo-winner-column" : ""}>
                  {score(vendor.compositeScore)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </MemoSection>

      <MemoSection title="Why Alternatives Were Not Selected">
        <div className="memo-alternative-list">
          {memo.alternativeReasons.map((item) => {
            const vendor = memo.vendors.find((entry) => entry.id === item.vendorId);
            return (
              <div key={item.vendorId} className="memo-alternative">
                <strong>{vendor?.name ?? item.vendorId}</strong>
                <p>{item.reason}</p>
              </div>
            );
          })}
        </div>
      </MemoSection>

      <MemoSection title="Decision Robustness & Risk">
        <ul className="memo-risk-list">
          <li>
            {selectedVendor.name} wins in {percent(selectedWinFrequency)} of reasonable priority scenarios.
          </li>
          {memo.robustness.flipThreshold !== null && runnerUp && memo.robustness.flipCriterionName && (
            <li>
              The decision would flip if priorities shifted about {percent(memo.robustness.flipThreshold)} toward{" "}
              {memo.robustness.flipCriterionName}, allowing {runnerUp.name} to overtake.
            </li>
          )}
          {selectedWorstRank && (
            <li>
              Across the modeled scenarios, {selectedVendor.name} never ranks below #{selectedWorstRank}.
            </li>
          )}
          <li>{memo.riskSummary}</li>
        </ul>
      </MemoSection>

      <MemoSection title="Sources & Confidence">
        <ol className="memo-source-list">
          {memo.sources.map((source) => (
            <li key={source.id}>
              <div>
                <strong>{source.label}</strong>
                {source.sourcesDisagree && <span className="memo-dispute">Sources disagree</span>}
              </div>
              <span>
                {sourceTypeLabel(source.sourceType)} | confidence {percent(source.confidence)} | {source.url}
              </span>
            </li>
          ))}
        </ol>
      </MemoSection>

      <MemoSection title="Sign-Off">
        <div className="memo-signoff-grid">
          <div>
            <span>Prepared by</span>
            <strong>{memo.preparedBy}</strong>
          </div>
          <div>
            <span>Approval signature</span>
            <div className="memo-signature-line" />
          </div>
          <div>
            <span>Date</span>
            <div className="memo-signature-line" />
          </div>
        </div>
      </MemoSection>
    </article>
  );
}

function MemoMeta({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="memo-meta-item">
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <p>{value}</p>}
    </div>
  );
}

function MemoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="memo-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const memoStyles = `
  .decision-memo {
    min-height: 100vh;
    background: #f4f6f8;
    color: #172033;
    font-family: Arial, Helvetica, sans-serif;
    line-height: 1.45;
    padding: 40px 20px;
  }

  @media screen {
    .decision-memo {
      position: fixed;
      inset: 0;
      z-index: 60;
      overflow: auto;
    }
  }

  .decision-memo * {
    box-sizing: border-box;
  }

  .memo-page,
  .memo-section {
    max-width: 920px;
    margin: 0 auto 18px;
    background: #ffffff;
    border: 1px solid #d9dee7;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }

  .memo-page {
    padding: 34px 38px;
  }

  .memo-section {
    padding: 24px 30px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .memo-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 28px;
    border-bottom: 2px solid #172033;
    padding-bottom: 22px;
  }

  .memo-kicker {
    margin: 0 0 8px;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .decision-memo h1,
  .decision-memo h2,
  .decision-memo p {
    margin: 0;
  }

  .decision-memo h1 {
    color: #0f172a;
    font-size: 31px;
    line-height: 1.12;
    letter-spacing: -0.01em;
  }

  .decision-memo h2 {
    color: #0f172a;
    font-size: 15px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-bottom: 1px solid #d9dee7;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }

  .memo-status {
    border: 1px solid #1f7a4d;
    background: #edf8f2;
    color: #14532d;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .memo-meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 28px;
    padding-top: 22px;
  }

  .memo-meta-item span,
  .memo-signoff-grid span {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .memo-meta-item p,
  .memo-meta-item strong {
    color: #172033;
    font-size: 14px;
  }

  .memo-recommendation {
    color: #172033;
    font-size: 17px;
    line-height: 1.55;
  }

  .memo-figure-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .memo-figure-row div {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    padding: 14px;
  }

  .memo-figure-row span {
    display: block;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .memo-figure-row strong {
    display: block;
    color: #0f172a;
    font-size: 22px;
    margin-top: 4px;
  }

  .memo-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .memo-table th {
    background: #172033;
    color: #ffffff;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .memo-table th,
  .memo-table td {
    border: 1px solid #d9dee7;
    padding: 10px 11px;
    text-align: left;
    vertical-align: top;
  }

  .memo-table tr,
  .memo-source-list li,
  .memo-alternative {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .memo-table td strong,
  .memo-table td span {
    display: block;
  }

  .memo-table td span {
    color: #64748b;
    font-size: 11px;
    margin-top: 2px;
  }

  .memo-profile-chip,
  .memo-dispute {
    display: inline-block !important;
    width: fit-content;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #475569 !important;
    font-size: 10px !important;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin-top: 6px !important;
    padding: 2px 6px;
    text-transform: uppercase;
  }

  .memo-dispute {
    border-color: #eab308;
    background: #fefce8;
    color: #854d0e !important;
  }

  .memo-scorecard th:not(:first-child),
  .memo-scorecard td:not(:first-child) {
    text-align: center;
  }

  .memo-winner-column {
    background: #eff6f3;
    border-left-color: #15803d !important;
    border-right-color: #15803d !important;
  }

  .memo-composite-row td {
    background: #eef2f7;
    color: #0f172a;
    font-weight: 700;
  }

  .memo-alternative-list {
    display: grid;
    gap: 12px;
  }

  .memo-alternative {
    border-left: 3px solid #94a3b8;
    background: #f8fafc;
    padding: 12px 14px;
  }

  .memo-alternative strong {
    display: block;
    color: #0f172a;
    margin-bottom: 4px;
  }

  .memo-alternative p,
  .memo-risk-list,
  .memo-source-list {
    color: #334155;
    font-size: 13px;
  }

  .memo-risk-list,
  .memo-source-list {
    margin: 0;
    padding-left: 20px;
  }

  .memo-risk-list li,
  .memo-source-list li {
    margin-bottom: 9px;
  }

  .memo-source-list span {
    display: block;
    color: #64748b;
    font-size: 12px;
    margin-top: 2px;
  }

  .memo-signoff-grid {
    display: grid;
    grid-template-columns: 1.2fr 1.4fr 0.8fr;
    gap: 20px;
  }

  .memo-signoff-grid strong {
    color: #172033;
  }

  .memo-signature-line {
    border-bottom: 1px solid #172033;
    height: 28px;
  }

  .memo-print-footer {
    display: none;
  }

  @page {
    size: letter;
    margin: 0.65in 0.58in 0.75in;
    @bottom-right {
      content: "Page " counter(page);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
      color: #64748b;
    }
    @bottom-left {
      content: "Vendor Selection Decision Memo";
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9px;
      color: #64748b;
    }
  }

  @media print {
    html,
    body {
      background: #ffffff !important;
    }

    .decision-memo {
      background: #ffffff !important;
      color: #111827 !important;
      padding: 0;
      position: static;
      overflow: visible;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .memo-page,
    .memo-section {
      max-width: none;
      margin: 0 0 14px;
      border-color: #cfd6df;
      box-shadow: none;
    }

    .memo-page {
      padding: 0 0 18px;
      border: 0;
      border-bottom: 2px solid #172033;
    }

    .memo-section {
      padding: 16px 0;
      border: 0;
      border-bottom: 1px solid #d9dee7;
    }

    .memo-title-row {
      padding-bottom: 16px;
    }

    .decision-memo h1 {
      font-size: 25px;
    }

    .memo-table {
      page-break-inside: auto;
    }

    .memo-table thead {
      display: table-header-group;
    }

    .memo-table tfoot {
      display: table-footer-group;
    }

    .memo-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .memo-print-footer {
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      border-top: 1px solid #d9dee7;
      color: #64748b;
      font-size: 9px;
      padding-top: 5px;
      text-align: left;
    }
  }

  @media (max-width: 720px) {
    .decision-memo {
      padding: 18px 10px;
    }

    .memo-page,
    .memo-section {
      padding: 20px 16px;
    }

    .memo-title-row,
    .memo-meta-grid,
    .memo-figure-row,
    .memo-signoff-grid {
      grid-template-columns: 1fr;
      display: grid;
    }

    .memo-status {
      width: fit-content;
    }
  }
`;

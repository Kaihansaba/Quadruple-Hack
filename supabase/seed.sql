insert into company_profile (
  id,
  name,
  industry,
  size,
  budget_ceiling,
  tech_stack,
  compliance_reqs,
  preferred_suppliers,
  default_weights
) values (
  '00000000-0000-0000-0000-000000000001',
  'Northstar Health Finance',
  'healthcare fintech',
  '650 employees',
  75000,
  '["Salesforce", "Slack", "Snowflake", "Okta"]'::jsonb,
  '["SOC 2 Type II", "HIPAA-ready vendor controls"]'::jsonb,
  '["AWS Marketplace", "Salesforce AppExchange"]'::jsonb,
  '{"annual_cost": 0.30, "stack_fit": 0.25, "admin_usability": 0.20, "implementation_support": 0.25}'::jsonb
) on conflict (id) do update set
  name = excluded.name,
  industry = excluded.industry,
  size = excluded.size,
  budget_ceiling = excluded.budget_ceiling,
  tech_stack = excluded.tech_stack,
  compliance_reqs = excluded.compliance_reqs,
  preferred_suppliers = excluded.preferred_suppliers,
  default_weights = excluded.default_weights;

insert into comparisons (id, title, category, status) values
  (
    '10000000-0000-0000-0000-000000000001',
    'CRM platform for regulated mid-market sales team',
    'crm',
    'seeded'
  )
on conflict (id) do update set
  title = excluded.title,
  category = excluded.category,
  status = excluded.status;

insert into products (id, comparison_id, name, url, logo_url, raw_metadata) values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Nimbus CRM',
    'https://example.com/nimbus',
    'https://example.com/nimbus.ico',
    '{}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'LedgerFlow Sales Cloud',
    'https://example.com/ledgerflow',
    'https://example.com/ledgerflow.ico',
    '{}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Pipelane',
    'https://example.com/pipelane',
    'https://example.com/pipelane.ico',
    '{}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  url = excluded.url,
  logo_url = excluded.logo_url,
  raw_metadata = excluded.raw_metadata;

insert into criteria (id, comparison_id, name, unit, direction, type, weight) values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Annual cost',
    'usd_per_year',
    'lower',
    'soft',
    0.30
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Fit with existing stack',
    'score_0_10',
    'higher',
    'soft',
    0.25
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Admin usability',
    'score_0_10',
    'higher',
    'soft',
    0.20
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'Implementation support',
    'score_0_10',
    'higher',
    'soft',
    0.25
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'SOC 2 Type II available',
    'boolean',
    'higher',
    'hard',
    null
  )
on conflict (id) do update set
  name = excluded.name,
  unit = excluded.unit,
  direction = excluded.direction,
  type = excluded.type,
  weight = excluded.weight;

insert into extracted_values (
  id,
  product_id,
  criterion_id,
  raw_value,
  normalized_value,
  source_url,
  source_type,
  confidence
) values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '48000',
    null,
    'https://example.com/nimbus/pricing',
    'spec',
    0.92
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '52000',
    null,
    'https://example.com/reviews/nimbus-pricing',
    'user_review',
    0.70
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '68000',
    null,
    'https://example.com/ledgerflow/pricing',
    'spec',
    0.95
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    '39000',
    null,
    'https://example.com/pipelane/pricing',
    'vendor_claim',
    0.75
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '8.4',
    null,
    'https://example.com/expert/nimbus-integrations',
    'expert_review',
    0.88
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '9.4',
    null,
    'https://example.com/expert/ledgerflow-integrations',
    'expert_review',
    0.90
  ),
  (
    '40000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002',
    '6.8',
    null,
    'https://example.com/pipelane/integrations',
    'vendor_claim',
    0.72
  ),
  (
    '40000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000003',
    '8.1',
    null,
    'https://example.com/reviews/nimbus-admin',
    'user_review',
    0.82
  ),
  (
    '40000000-0000-0000-0000-000000000009',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    '7.8',
    null,
    'https://example.com/reviews/ledgerflow-admin',
    'user_review',
    0.80
  ),
  (
    '40000000-0000-0000-0000-000000000010',
    '20000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    '8.9',
    null,
    'https://example.com/reviews/pipelane-admin',
    'user_review',
    0.78
  ),
  (
    '40000000-0000-0000-0000-000000000011',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000004',
    '8.2',
    null,
    'https://example.com/expert/nimbus-support',
    'expert_review',
    0.87
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000004',
    '9.5',
    null,
    'https://example.com/expert/ledgerflow-support',
    'expert_review',
    0.90
  ),
  (
    '40000000-0000-0000-0000-000000000013',
    '20000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000004',
    '6.7',
    null,
    'https://example.com/reviews/pipelane-support',
    'user_review',
    0.74
  ),
  (
    '40000000-0000-0000-0000-000000000014',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000005',
    'true',
    1,
    'https://example.com/nimbus/security',
    'spec',
    0.96
  ),
  (
    '40000000-0000-0000-0000-000000000015',
    '20000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000005',
    'true',
    1,
    'https://example.com/ledgerflow/security',
    'spec',
    0.98
  ),
  (
    '40000000-0000-0000-0000-000000000016',
    '20000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000005',
    'false',
    0,
    'https://example.com/pipelane/security',
    'vendor_claim',
    0.85
  )
on conflict (id) do update set
  raw_value = excluded.raw_value,
  normalized_value = excluded.normalized_value,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  confidence = excluded.confidence;

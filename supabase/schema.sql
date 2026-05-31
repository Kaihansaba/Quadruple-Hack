create table if not exists company_profile (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  size text not null,
  budget_ceiling numeric,
  tech_stack jsonb not null default '[]'::jsonb,
  compliance_reqs jsonb not null default '[]'::jsonb,
  preferred_suppliers jsonb not null default '[]'::jsonb,
  default_weights jsonb not null default '{}'::jsonb
);

create table if not exists comparisons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references comparisons(id) on delete cascade,
  name text not null,
  url text,
  logo_url text,
  pricing_model jsonb,
  raw_metadata jsonb not null default '{}'::jsonb
);

create table if not exists criteria (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references comparisons(id) on delete cascade,
  name text not null,
  unit text not null,
  direction text not null check (direction in ('higher', 'lower')),
  type text not null check (type in ('soft', 'hard')),
  weight double precision check (weight is null or weight >= 0)
);

create table if not exists extracted_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  criterion_id uuid not null references criteria(id) on delete cascade,
  raw_value text not null,
  normalized_value double precision,
  source_url text,
  source_type text not null check (
    source_type in ('spec', 'expert_review', 'user_review', 'vendor_claim')
  ),
  confidence double precision not null check (confidence >= 0 and confidence <= 1)
);

create table if not exists clarifications (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references comparisons(id) on delete cascade,
  question text not null,
  suggested_answers jsonb not null default '[]'::jsonb,
  chosen_answer text,
  from_profile boolean not null default false
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references comparisons(id) on delete cascade,
  composite_scores jsonb not null default '{}'::jsonb,
  contributions jsonb not null default '{}'::jsonb,
  sensitivity jsonb,
  verdict text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null references comparisons(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

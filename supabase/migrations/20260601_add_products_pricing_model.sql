alter table products
  add column if not exists pricing_model jsonb;

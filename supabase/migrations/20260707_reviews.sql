-- Vastukala AI — professional review / sign-off records.
-- Demo mode keeps reviews in localStorage; when Supabase is configured the web
-- app ALSO upserts here (best-effort, keyed by user + plan-version hash).
-- A row records that a licensed professional REVIEWED a plan version and takes
-- professional responsibility — it is NOT a statutory approval or sanction.

create table if not exists reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete cascade,
  plan_hash      text not null,
  reviewer_name  text,
  reg_no         text,
  reg_type       text,               -- 'COA architect' | 'Licensed engineer' | 'Structural engineer'
  checklist      jsonb default '{}',
  stamp_data_url text,
  locked_at      timestamptz,
  created_at     timestamptz default now(),
  unique (user_id, plan_hash)        -- upsert target: one review per user per plan version
);
create index if not exists reviews_user_idx on reviews (user_id, created_at desc);

-- ---------- Row Level Security ----------
alter table reviews enable row level security;

create policy "own reviews" on reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

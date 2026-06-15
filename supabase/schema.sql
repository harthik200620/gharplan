-- GharPlan — Supabase schema (Postgres). Run in the Supabase SQL editor.
-- Auth is handled by Supabase Auth (auth.users). RLS restricts every row to its owner.

-- ---------- profiles (studio branding + billing state) ----------
create table if not exists profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  studio_name             text not null default 'Your Studio',
  address                 text not null default '',
  gstin                   text not null default '',
  phone                   text not null default '',
  email                   text not null default '',
  website                 text not null default '',
  logo_data_url           text,
  terms                   text not null default '',
  credits                 integer not null default 1,
  subscription_plan       text,
  subscription_status     text,
  subscription_period_end timestamptz,
  created_at              timestamptz not null default now()
);

-- ---------- projects (canonical Plan stored as JSONB) ----------
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Untitled project',
  client_name text,
  plan        jsonb not null,
  is_unlocked boolean not null default false,  -- one credit unlocks all exports for this plan
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_user_idx on projects (user_id, updated_at desc);

-- ---------- payments (Razorpay order/payment audit) ----------
create table if not exists payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  kind               text not null,          -- 'credit' | 'subscription'
  plan_id            text,                   -- e.g. solo_5 / solo_unlimited / credit_pack
  amount_inr         numeric not null,
  credits_granted    integer not null default 0,
  razorpay_order_id  text,
  razorpay_payment_id text,
  status             text not null default 'created',  -- created | paid | failed
  created_at         timestamptz not null default now()
);
create index if not exists payments_user_idx on payments (user_id, created_at desc);

-- ---------- atomic credit consumption (server-side gating) ----------
create or replace function consume_credit(p_user uuid)
returns boolean
language plpgsql
security definer
as $$
declare ok boolean;
begin
  update profiles set credits = credits - 1
  where id = p_user and credits > 0;
  get diagnostics ok = row_count;
  return ok;
end;
$$;

-- ---------- atomic credit grant (after a verified payment) ----------
create or replace function add_credits(p_user uuid, n integer)
returns void language plpgsql security definer as $$
begin
  update profiles set credits = credits + n where id = p_user;
end;
$$;

-- ---------- create a profile row automatically on signup ----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table projects enable row level security;
alter table payments enable row level security;

create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile write"  on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

create policy "own projects" on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own payments read"   on payments for select using (auth.uid() = user_id);
create policy "own payments insert" on payments for insert with check (auth.uid() = user_id);

-- ---------- rates (read-only reference; seed via fixtures/rates/rates_seed.sql) ----------
-- The engine reads rates from JSON; this table mirrors it for the web/admin if needed.
-- See fixtures/rates/rates_seed.sql for the seed insert.

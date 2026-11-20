-- Daily wellness scores computed on the iPhone from Apple Health, so the Mac
-- and web can show them. One row per person per day.
create table if not exists public.wellness_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  sleep_score int,
  recovery_score int,
  stress_score int,
  stress_level text,
  nutrition_score int,
  details jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.wellness_daily enable row level security;

drop policy if exists "wellness_daily select own" on public.wellness_daily;
create policy "wellness_daily select own" on public.wellness_daily
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "wellness_daily insert own" on public.wellness_daily;
create policy "wellness_daily insert own" on public.wellness_daily
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "wellness_daily update own" on public.wellness_daily;
create policy "wellness_daily update own" on public.wellness_daily
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "wellness_daily delete own" on public.wellness_daily;
create policy "wellness_daily delete own" on public.wellness_daily
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.wellness_daily to authenticated;

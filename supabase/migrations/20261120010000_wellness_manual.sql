-- Wellness numbers people enter by hand (sleep, resting heart rate, HRV, stress,
-- meals, water, weight, blood pressure). Merged into the same scores as Apple Health.
create table if not exists public.wellness_manual (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  kind text not null check (kind in ('sleep','resting_hr','hrv','stress','meal','water','weight','blood_pressure')),
  value numeric,
  value2 numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wellness_manual_user_logged_idx
  on public.wellness_manual (user_id, logged_at desc);

alter table public.wellness_manual enable row level security;

drop policy if exists "wellness_manual select own" on public.wellness_manual;
create policy "wellness_manual select own" on public.wellness_manual
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "wellness_manual insert own" on public.wellness_manual;
create policy "wellness_manual insert own" on public.wellness_manual
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "wellness_manual update own" on public.wellness_manual;
create policy "wellness_manual update own" on public.wellness_manual
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "wellness_manual delete own" on public.wellness_manual;
create policy "wellness_manual delete own" on public.wellness_manual
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.wellness_manual to authenticated;

-- Agents v2: Care Finder, Bill & Insurance Advocate, Rx Saver, Follow-Through, Research.
-- Run once in the Supabase SQL editor (project pniiscbwnrlwrckllwzq). Safe to re-run.
-- Old agent ids (appointments, medications, shopping) stay allowed so saved history keeps loading.

-- 1. Widen the agent and kind checks on the existing tables.
alter table public.agent_messages drop constraint if exists agent_messages_agent_check;
alter table public.agent_messages add constraint agent_messages_agent_check
  check (agent in ('care_finder', 'bill_advocate', 'rx_saver', 'follow_through', 'research', 'appointments', 'medications', 'shopping'));

alter table public.agent_tasks drop constraint if exists agent_tasks_agent_check;
alter table public.agent_tasks add constraint agent_tasks_agent_check
  check (agent in ('care_finder', 'bill_advocate', 'rx_saver', 'follow_through', 'research', 'appointments', 'medications', 'shopping'));

alter table public.agent_tasks drop constraint if exists agent_tasks_kind_check;
alter table public.agent_tasks add constraint agent_tasks_kind_check
  check (kind in ('appointment', 'med_reminder', 'refill_request', 'research_brief', 'shopping_list', 'care_options', 'bill_case', 'rx_savings', 'follow_up'));

-- 2. Agent memory: facts the person tells an agent (insurance plan name, ZIP, pharmacy, doctors).
-- Never ID, policy or card numbers; the API refuses long digit runs.
create table if not exists public.agent_memory (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key in ('insurance_plan', 'insurance_member_type', 'zip', 'city', 'preferred_pharmacy', 'doctors', 'budget_notes', 'other')),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.agent_memory enable row level security;

drop policy if exists "agent_memory_select_own" on public.agent_memory;
drop policy if exists "agent_memory_insert_own" on public.agent_memory;
drop policy if exists "agent_memory_update_own" on public.agent_memory;
drop policy if exists "agent_memory_delete_own" on public.agent_memory;
create policy "agent_memory_select_own" on public.agent_memory for select using (auth.uid() = user_id);
create policy "agent_memory_insert_own" on public.agent_memory for insert with check (auth.uid() = user_id);
create policy "agent_memory_update_own" on public.agent_memory for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent_memory_delete_own" on public.agent_memory for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.agent_memory to authenticated;

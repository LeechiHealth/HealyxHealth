-- Health agents: per-agent conversations and the task queue.
-- Run once in the Supabase SQL editor (project pniiscbwnrlwrckllwzq). Safe to re-run.
-- Row-level security limits every row to its owner; the API uses the signed-in user's token.

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent text not null check (agent in ('appointments', 'medications', 'research', 'shopping')),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_user_agent_created_idx
  on public.agent_messages (user_id, agent, created_at desc);

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent text not null check (agent in ('appointments', 'medications', 'research', 'shopping')),
  kind text not null check (kind in ('appointment', 'med_reminder', 'refill_request', 'research_brief', 'shopping_list')),
  title text not null check (char_length(title) <= 200),
  status text not null default 'todo' check (status in ('todo', 'waiting', 'done', 'dismissed')),
  due_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_tasks_user_status_created_idx
  on public.agent_tasks (user_id, status, created_at desc);

create or replace function public.touch_agent_task_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_tasks_touch_updated_at on public.agent_tasks;
create trigger agent_tasks_touch_updated_at
  before update on public.agent_tasks
  for each row execute function public.touch_agent_task_updated_at();

alter table public.agent_messages enable row level security;
alter table public.agent_tasks enable row level security;

drop policy if exists "agent_messages_select_own" on public.agent_messages;
drop policy if exists "agent_messages_insert_own" on public.agent_messages;
drop policy if exists "agent_messages_delete_own" on public.agent_messages;
create policy "agent_messages_select_own" on public.agent_messages for select using (auth.uid() = user_id);
create policy "agent_messages_insert_own" on public.agent_messages for insert with check (auth.uid() = user_id);
create policy "agent_messages_delete_own" on public.agent_messages for delete using (auth.uid() = user_id);

drop policy if exists "agent_tasks_select_own" on public.agent_tasks;
drop policy if exists "agent_tasks_insert_own" on public.agent_tasks;
drop policy if exists "agent_tasks_update_own" on public.agent_tasks;
drop policy if exists "agent_tasks_delete_own" on public.agent_tasks;
create policy "agent_tasks_select_own" on public.agent_tasks for select using (auth.uid() = user_id);
create policy "agent_tasks_insert_own" on public.agent_tasks for insert with check (auth.uid() = user_id);
create policy "agent_tasks_update_own" on public.agent_tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent_tasks_delete_own" on public.agent_tasks for delete using (auth.uid() = user_id);

-- Health agents, part 2: keep each reply's work history (steps, sources, time taken).
-- Run once in the Supabase SQL editor after 20261109_health_agents.sql. Safe to re-run.
-- Until it runs, conversations still save, just without the step history.

alter table public.agent_messages add column if not exists meta jsonb;

-- Excel matches establish initial ratings; future matches additionally use role challenges.
alter table public.matches add column rating_policy text not null default 'standard'
  check (rating_policy in ('baseline', 'standard'));
alter table public.matches add constraint baseline_requires_import
  check (rating_policy <> 'baseline' or import_batch_id is not null);

-- Before replacing derived events, preserve the previous ratings and full event history.
create table public.elo_recalculation_backups (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  previous_state jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.elo_recalculation_backups enable row level security;
revoke all on public.elo_recalculation_backups from anon, authenticated;

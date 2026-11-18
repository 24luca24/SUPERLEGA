-- One resumable scoreboard per creator. Operations are retried by mutation UUID.
create unique index matches_one_live_per_owner on public.matches(owner_user_id)
  where owner_user_id is not null and status in ('draft','live');
create table public.match_actions (
  id uuid primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  actor_id uuid not null references public.users(id),
  kind text not null check(kind in ('goal','undo','finalize','cancel')),
  player_id uuid references public.players(id),
  delta integer check(delta in(-1,1)),
  undo_of uuid unique references public.match_actions(id),
  version integer not null,
  created_at timestamptz not null default now(),
  unique(match_id,version),
  check((kind='goal' and player_id is not null and delta is not null and undo_of is null)
    or (kind='undo' and player_id is null and delta is null and undo_of is not null)
    or (kind in('finalize','cancel') and player_id is null and delta is null and undo_of is null))
);
create index match_actions_match_idx on public.match_actions(match_id,version desc);
alter table public.match_actions enable row level security;
revoke all on public.match_actions from anon,authenticated;

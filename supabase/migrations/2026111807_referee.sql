-- The referee is a login account, never an extra player in rankings.
alter table public.users drop constraint users_check;
alter table public.users add constraint users_enabled_identity check (
  not enabled or (username is not null and length(trim(username))>0 and password_hash is not null
    and (player_id is not null or (is_admin and username_norm='roberto')))
);
create unique index users_one_enabled_admin on public.users((is_admin)) where is_admin and enabled;
create table public.result_changes (
  id uuid primary key,
  match_id uuid not null references public.matches(id),
  actor_id uuid not null references public.users(id),
  kind text not null check(kind in('edit','delete')),
  requested_goals jsonb,
  previous_state jsonb not null,
  version_after integer not null,
  created_at timestamptz not null default now()
);
alter table public.result_changes enable row level security;
revoke all on public.result_changes from anon,authenticated;

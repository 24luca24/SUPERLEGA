-- Custom roster-only login replaces anonymous Supabase Auth.
-- All application data access goes through the Next.js server, never the public API.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  legacy_name text not null unique,
  player_id uuid unique references public.players(id),
  username text,
  username_norm text generated always as (lower(trim(username))) stored unique,
  password_hash text,
  enabled boolean not null default false,
  is_admin boolean not null default false,
  avatar_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or (player_id is not null and username is not null and length(trim(username)) > 0 and password_hash is not null))
);
create table public.user_sessions (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index user_sessions_user_idx on public.user_sessions(user_id);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_sha256 text not null unique,
  source_name text not null,
  raw_workbook jsonb not null,
  chronology_confirmed boolean not null default false,
  promoted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.import_match_rows (
  batch_id uuid not null references public.import_batches(id),
  source_row integer not null,
  data jsonb not null,
  primary key(batch_id, source_row)
);
alter table public.matches add column owner_user_id uuid references public.users(id);
alter table public.matches add column scorekeeper_user_id uuid references public.users(id);
alter table public.matches add column import_batch_id uuid references public.import_batches(id);
alter table public.matches add column source_row integer;
alter table public.matches add column history_order integer;
alter table public.matches add constraint matches_import_row_unique unique(import_batch_id, source_row);
alter table public.matches add constraint matches_import_source_check check ((import_batch_id is null) = (source_row is null));
alter table public.players add constraint players_elo_nonnegative check (current_elo >= 0);
alter table public.elo_events add constraint events_elo_nonnegative check (elo_before >= 0 and elo_after >= 0);
alter table public.elo_events add constraint events_opponent_fk foreign key(opponent_id) references public.players(id);

-- Public Supabase keys cannot read or modify the roster, hashes or match data.
alter table public.users enable row level security;
alter table public.user_sessions enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_match_rows enable row level security;
revoke all on public.users, public.user_sessions, public.import_batches, public.import_match_rows,
  public.players, public.profiles, public.seasons, public.matches, public.match_goals,
  public.gallery_images, public.elo_events from anon, authenticated;
-- Remove obsolete policies: admin access is checked by server sessions instead.
drop policy "public read players" on public.players;
drop policy "public read seasons" on public.seasons;
drop policy "public read matches" on public.matches;
drop policy "public read goals" on public.match_goals;
drop policy "public read elo events" on public.elo_events;
drop policy "public read gallery" on public.gallery_images;
drop policy "admin write players" on public.players;
drop policy "admin write matches" on public.matches;
drop policy "admin write goals" on public.match_goals;
drop policy "admin write gallery" on public.gallery_images;

create function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();
create trigger matches_touch before update on public.matches for each row execute function public.touch_updated_at();

create function public.validate_match_roster() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.players where id in (new.home_striker_id, new.away_striker_id) and role = 'striker') <> 2
     or (select count(*) from public.players where id in (new.home_defender_id, new.away_defender_id) and role = 'defender') <> 2 then
    raise exception 'Ruoli dei partecipanti non validi';
  end if;
  if new.status = 'completed' and new.completed_at is null and new.history_order is null then
    raise exception 'Una partita ufficiale richiede data o ordine storico';
  end if;
  return new;
end $$;
create trigger match_roster_check before insert or update on public.matches for each row execute function public.validate_match_roster();

create function public.validate_goal_roster() returns trigger language plpgsql set search_path = public as $$
declare target uuid; game public.matches;
begin
  if TG_TABLE_NAME = 'matches' then target := coalesce(new.id, old.id);
  else target := coalesce(new.match_id, old.match_id); end if;
  select * into game from public.matches where id = target;
  if not found then return null; end if;
  if (select count(*) from public.match_goals where match_id = target) <> 4
     or exists (select 1 from public.match_goals where match_id = target and player_id not in
       (game.home_striker_id, game.home_defender_id, game.away_striker_id, game.away_defender_id)) then
    raise exception 'Servono esattamente quattro contatori dei partecipanti';
  end if;
  return null;
end $$;
create constraint trigger match_goals_complete after insert or update on public.matches deferrable initially deferred for each row execute function public.validate_goal_roster();
create constraint trigger goals_roster_complete after insert or update or delete on public.match_goals deferrable initially deferred for each row execute function public.validate_goal_roster();

create function public.prevent_historical_role_change() returns trigger language plpgsql set search_path = public as $$
begin
  if new.role <> old.role and exists(select 1 from public.matches where old.id in
    (home_striker_id, home_defender_id, away_striker_id, away_defender_id)) then
    raise exception 'Ruolo bloccato: il giocatore ha partite nello storico';
  end if;
  return new;
end $$;
create trigger player_role_history before update on public.players for each row execute function public.prevent_historical_role_change();

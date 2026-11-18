create extension if not exists "pgcrypto";

create type public.player_role as enum ('striker', 'defender');
create type public.match_status as enum ('draft', 'live', 'completed', 'cancelled');

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  animal text not null,
  city text not null,
  display_name text not null,
  role public.player_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  current_elo numeric(8,2) not null default 100,
  animal_norm text generated always as (lower(trim(animal))) stored,
  city_norm text generated always as (lower(trim(city))) stored,
  unique (animal_norm, city_norm)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  status public.match_status not null default 'draft',
  season_id uuid not null references public.seasons(id),
  home_striker_id uuid not null references public.players(id),
  home_defender_id uuid not null references public.players(id),
  away_striker_id uuid not null references public.players(id),
  away_defender_id uuid not null references public.players(id),
  created_by uuid references auth.users(id),
  scorekeeper_id uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0,
  constraint distinct_match_players check (
    home_striker_id <> home_defender_id
    and home_striker_id <> away_striker_id
    and home_striker_id <> away_defender_id
    and home_defender_id <> away_striker_id
    and home_defender_id <> away_defender_id
    and away_striker_id <> away_defender_id
  )
);

create table if not exists public.match_goals (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  goals integer not null default 0 check (goals >= 0),
  primary key (match_id, player_id)
);

create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text unique not null,
  title text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.elo_events (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  opponent_id uuid,
  elo_before numeric(8,2) not null,
  performance_result_delta numeric(8,2) not null,
  challenge_gap_before numeric(8,2) not null,
  challenge_delta numeric(8,2) not null,
  total_requested_delta numeric(8,2) not null,
  actual_delta numeric(8,2) not null,
  elo_after numeric(8,2) not null,
  primary key (match_id, player_id)
);

alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_goals enable row level security;
alter table public.seasons enable row level security;
alter table public.gallery_images enable row level security;
alter table public.elo_events enable row level security;

create policy "public read players" on public.players for select to authenticated using (true);
create policy "public read seasons" on public.seasons for select to authenticated using (true);
create policy "public read matches" on public.matches for select to authenticated using (true);
create policy "public read goals" on public.match_goals for select to authenticated using (true);
create policy "public read elo events" on public.elo_events for select to authenticated using (true);
create policy "public read gallery" on public.gallery_images for select to authenticated using (true);

create policy "admin write players" on public.players for all to authenticated using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
);

create policy "admin write matches" on public.matches for all to authenticated using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
);

create policy "admin write goals" on public.match_goals for all to authenticated using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
);

create policy "admin write gallery" on public.gallery_images for all to authenticated using (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
) with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.is_admin)
);

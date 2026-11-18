-- A live score may be level; a completed result must always have a winner.
create function public.reject_completed_draw() returns trigger language plpgsql set search_path = public as $$
declare target uuid; game public.matches; home_goals integer; away_goals integer;
begin
  if TG_TABLE_NAME='matches' then target:=coalesce(new.id,old.id);
  else target:=coalesce(new.match_id,old.match_id); end if;
  select * into game from public.matches where id=target;
  if not found or game.status<>'completed' then return null; end if;
  select coalesce(sum(goals) filter(where player_id in(game.home_striker_id,game.home_defender_id)),0),
         coalesce(sum(goals) filter(where player_id in(game.away_striker_id,game.away_defender_id)),0)
    into home_goals,away_goals from public.match_goals where match_id=target;
  if home_goals=away_goals then raise exception 'Il pareggio non è ammesso: serve un vincitore'; end if;
  return null;
end $$;
create constraint trigger matches_no_draw after insert or update on public.matches
  deferrable initially deferred for each row execute function public.reject_completed_draw();
create constraint trigger goals_no_draw after insert or update or delete on public.match_goals
  deferrable initially deferred for each row execute function public.reject_completed_draw();
-- Refuse to install this rule over an inconsistent official history.
do $$ begin
  if exists(select 1 from public.matches m where status='completed' and
    (select coalesce(sum(case when player_id in(m.home_striker_id,m.home_defender_id) then goals else -goals end),0)
      from public.match_goals where match_id=m.id)=0) then
    raise exception 'Lo storico contiene pareggi ufficiali: verificare i risultati';
  end if;
end $$;

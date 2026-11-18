-- Owner correction: AIRAGHI/CAPOBRANCO striker, CHIODINI/BRACCONIERE defender.
-- Preserve goal ownership and swap lineup slots, never the actual participants or goals.
do $$
declare capo uuid; brac uuid;
begin
  lock table public.matches,public.players in share row exclusive mode;
  select player_id into capo from public.users where username_norm='gorilla-capobranco' and legacy_name='AIRAGHI';
  select player_id into brac from public.users where username_norm='gorilla-bracconiere' and legacy_name='CHIODINI';
  if capo is null and brac is null then return; end if; -- Fresh setup: provisioning already uses corrected roster.
  if capo is null or brac is null then raise exception 'Associazione Gorilla incompleta: nessuna correzione applicata'; end if;
  if (select role from public.players where id=capo)='striker' and (select role from public.players where id=brac)='defender' then return; end if;
  if (select role from public.players where id=capo)<>'defender' or (select role from public.players where id=brac)<>'striker' then
    raise exception 'Ruoli Gorilla inattesi: verificare il roster';
  end if;
  if exists(select 1 from public.matches where
    (capo in(home_striker_id,home_defender_id) or brac in(home_striker_id,home_defender_id))
      and not(home_striker_id=brac and home_defender_id=capo)
    or (capo in(away_striker_id,away_defender_id) or brac in(away_striker_id,away_defender_id))
      and not(away_striker_id=brac and away_defender_id=capo)) then
    raise exception 'Storico Gorilla con partner differenti: serve una correzione esplicita';
  end if;
  insert into public.elo_recalculation_backups(reason,previous_state)
  select 'Correzione proprietario: CAPOBRANCO attaccante, BRACCONIERE difensore',jsonb_build_object(
    'players',(select jsonb_agg(jsonb_build_object('id',id,'role',role,'current_elo',current_elo)) from public.players),
    'matches',(select jsonb_agg(to_jsonb(m)) from public.matches m),
    'events',(select jsonb_agg(to_jsonb(e)) from public.elo_events e));
  -- Exception restricted to this versioned correction, under transaction/table locks.
  alter table public.players disable trigger player_role_history;
  update public.players set role=case when id=capo then 'striker'::public.player_role else 'defender'::public.player_role end where id in(capo,brac);
  alter table public.players enable trigger player_role_history;
  update public.matches set home_striker_id=capo,home_defender_id=brac where home_striker_id=brac and home_defender_id=capo;
  update public.matches set away_striker_id=capo,away_defender_id=brac where away_striker_id=brac and away_defender_id=capo;
end $$;

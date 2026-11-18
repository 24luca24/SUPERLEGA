import "server-only";
import type { PoolClient } from "pg";
import { database } from "./db";
import { computeMatchEloDeltas } from "../domain/elo";
import { lastPartnersFromMatches, repeatsLastPartner } from "../domain/pairings";
import { validateHistoricalMatch } from "../domain/history";
import type { MatchRecord, Player, PlayerEloDelta } from "@/types/domain";
import type { CreateLiveMatch, LiveMatch, LiveMatchAction, MatchScreen } from "@/types/live-match";

export interface MatchActor { id: string; is_admin: boolean }
export interface MatchClient { query: PoolClient["query"]; release(): void }
export interface MatchDatabase { connect(): Promise<MatchClient> }
export class MatchError extends Error {
  constructor(public status: number, message: string, public match?: LiveMatch) { super(message); }
}
interface MatchRow {
  id: string; status: MatchRecord["status"]; season_id: string; history_order: number|null;
  home_striker_id: string; home_defender_id: string; away_striker_id: string; away_defender_id: string;
  owner_user_id: string | null; scorekeeper_user_id: string | null;
  rating_policy: "baseline" | "standard"; created_at: Date; completed_at: Date | null; version: number;
}
interface PlayerRow { id: string; animal: string; city: string; display_name: string; role: Player["role"]; active: boolean; current_elo: string }
interface EventRow { player_id: string; elo_before: string; performance_result_delta: string; challenge_delta: string; total_requested_delta: string; elo_after: string; actual_delta: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
const playersFromRows = (rows: PlayerRow[]): Player[] => rows.map((p) => ({ id: p.id, animal: p.animal, city: p.city, displayName: p.display_name, role: p.role, active: p.active, currentElo: Number(p.current_elo) }));

async function transaction<T>(pool: MatchDatabase, operation: (client: MatchClient) => Promise<T>, readOnly = false): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? "begin isolation level repeatable read read only" : "begin");
    if (!readOnly) await client.query("select pg_advisory_xact_lock(731809)");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { client.release(); }
}
async function requireActor(client: MatchClient, actor: MatchActor) {
  const user = await client.query<{ enabled: boolean; is_admin: boolean; username_norm: string }>("select enabled,is_admin,username_norm from public.users where id=$1", [actor.id]);
  if (!user.rows[0]?.enabled) throw new MatchError(401, "Accedi per gestire la partita.");
  // Recheck the stored role instead of accepting client-supplied privileges.
  return { id: actor.id, is_admin: user.rows[0].is_admin && user.rows[0].username_norm === "roberto" };
}
async function hydrate(client: MatchClient, row: MatchRow): Promise<LiveMatch> {
  const goals = await client.query<{ player_id: string; goals: number }>("select player_id,goals from public.match_goals where match_id=$1", [row.id]);
  const undo = await client.query(`select a.id from public.match_actions a where a.match_id=$1 and a.kind='goal'
    and not exists(select 1 from public.match_actions u where u.undo_of=a.id) limit 1`, [row.id]);
  const events = await client.query<EventRow>("select * from public.elo_events where match_id=$1 order by player_id", [row.id]);
  return {
    id: row.id, status: row.status, ratingPolicy: row.rating_policy, historyOrder: row.history_order??undefined,
    home: { strikerId: row.home_striker_id, defenderId: row.home_defender_id },
    away: { strikerId: row.away_striker_id, defenderId: row.away_defender_id },
    goals: Object.fromEntries(goals.rows.map((g) => [g.player_id, g.goals])),
    createdAt: new Date(row.created_at).toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    version: row.version, seasonId: row.season_id, scorekeeperId: row.scorekeeper_user_id ?? undefined,
    canUndo: row.status === "live" && !!undo.rowCount,
    eloDeltas: events.rows.map((e) => ({ playerId: e.player_id, eloBefore: Number(e.elo_before), performanceResultDelta: Number(e.performance_result_delta), challengeDelta: Number(e.challenge_delta), totalRequestedDelta: Number(e.total_requested_delta), eloAfter: Number(e.elo_after), actualDelta: Number(e.actual_delta) })),
  };
}
export async function getMatchScreen(actor: MatchActor, pool: MatchDatabase = database()): Promise<MatchScreen> {
  return transaction(pool, async (client) => {
    const storedActor = await requireActor(client, actor);
    const players = await client.query<PlayerRow>("select * from public.players order by animal");
    const active = await client.query<MatchRow>("select * from public.matches where status in('draft','live') order by created_at asc limit 1");
    return { canControl: storedActor.is_admin, players: playersFromRows(players.rows), match: active.rows[0] ? await hydrate(client, active.rows[0]) : null };
  }, true);
}
export async function createLiveMatch(actor: MatchActor, input: CreateLiveMatch, pool: MatchDatabase = database()): Promise<LiveMatch> {
  const ids = [input.home?.strikerId, input.home?.defenderId, input.away?.strikerId, input.away?.defenderId];
  if (!isUuid(input.id) || !ids.every(isUuid) || new Set(ids).size !== 4) throw new MatchError(400, "Seleziona quattro giocatori distinti.");
  return transaction(pool, async (client) => {
    const storedActor = await requireActor(client, actor);
    if (!storedActor.is_admin) throw new MatchError(403, "Solo l’arbitro ROBERTO può gestire la partita live.");
    await client.query("select id from public.users where id=$1 for update", [actor.id]);
    const existing = await client.query<MatchRow>("select * from public.matches where id=$1", [input.id]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.owner_user_id !== actor.id || row.home_striker_id !== ids[0] || row.home_defender_id !== ids[1] || row.away_striker_id !== ids[2] || row.away_defender_id !== ids[3]) throw new MatchError(409, "Richiesta di creazione già utilizzata.");
      return hydrate(client, row);
    }
    const active = await client.query<MatchRow>("select * from public.matches where status in('draft','live')");
    if (active.rows[0]) throw new MatchError(409, "Hai già una partita in corso. È stata ripristinata.", await hydrate(client, active.rows[0]));
    const roster = await client.query<PlayerRow>("select * from public.players where id=any($1::uuid[]) and active for share", [ids]);
    const players = playersFromRows(roster.rows);
    const expectedRoles = ["striker", "defender", "striker", "defender"];
    if (ids.some((id, i) => players.find((p) => p.id === id)?.role !== expectedRoles[i])) throw new MatchError(400, "Ogni squadra deve avere un attaccante e un difensore attivi.");
    if(input.fromGenerator) {
      const recent=await client.query<MatchRow & {history_order:number|null}>("select * from public.matches where status in('completed','live') order by history_order nulls last,created_at,id");
      const history: MatchRecord[]=recent.rows.map((r)=>({id:r.id,status:r.status,home:{strikerId:r.home_striker_id,defenderId:r.home_defender_id},away:{strikerId:r.away_striker_id,defenderId:r.away_defender_id},goals:{},historyOrder:r.history_order??undefined,createdAt:new Date(r.created_at).toISOString(),completedAt:r.completed_at?new Date(r.completed_at).toISOString():undefined,version:r.version,seasonId:r.season_id}));
      if(repeatsLastPartner(input,lastPartnersFromMatches(history))) throw new MatchError(409,"Lo storico è cambiato: rigenera le squadre per evitare di ripetere l’ultimo compagno.");
    }
    const seasons = await client.query<{ id: string }>("select id from public.seasons where active for share");
    if (seasons.rowCount !== 1) throw new MatchError(409, "Serve una sola stagione attiva per avviare la partita.");
    const created = await client.query<MatchRow>(`insert into public.matches(id,status,season_id,home_striker_id,home_defender_id,away_striker_id,away_defender_id,owner_user_id,scorekeeper_user_id,started_at,rating_policy)
      values($1,'live',$2,$3,$4,$5,$6,$7,$7,now(),'standard') returning *`, [input.id, seasons.rows[0].id, ...ids, actor.id]);
    for (const id of ids) await client.query("insert into public.match_goals(match_id,player_id,goals) values($1,$2,0)", [input.id, id]);
    return hydrate(client, created.rows[0]);
  });
}

export async function changeLiveMatch(actor: MatchActor, matchId: string, action: LiveMatchAction, pool: MatchDatabase = database()): Promise<LiveMatch> {
  if (!isUuid(matchId) || !isUuid(action.mutationId) || !Number.isSafeInteger(action.version) || action.version < 0) throw new MatchError(400, "Richiesta non valida.");
  if (!["goal", "undo", "finalize", "cancel"].includes(action.kind)) throw new MatchError(400, "Azione non valida.");
  if (action.kind === "goal" && (!isUuid(action.playerId) || ![1, -1].includes(action.delta))) throw new MatchError(400, "Variazione gol non valida.");
  return transaction(pool, async (client) => {
    const storedActor = await requireActor(client, actor);
    // Same lock as full history recalculation: all rating changes share one chronological order.
    const selected = await client.query<MatchRow>("select * from public.matches where id=$1 for update", [matchId]);
    const row = selected.rows[0];
    if (!row) throw new MatchError(404, "Partita non trovata.");
    if (!storedActor.is_admin) throw new MatchError(403, "Solo l’arbitro ROBERTO può gestire la partita live.");
    const prior = await client.query<{ match_id: string; actor_id: string; kind: string; player_id: string | null; delta: number | null }>("select * from public.match_actions where id=$1", [action.mutationId]);
    if (prior.rows[0]) {
      const saved = prior.rows[0];
      if (saved.match_id !== matchId || saved.actor_id !== actor.id || saved.kind !== action.kind || (action.kind === "goal" && (saved.player_id !== action.playerId || saved.delta !== action.delta))) throw new MatchError(409, "Identificativo azione già utilizzato.");
      return hydrate(client, row);
    }
    if (action.kind === "finalize" && row.status === "completed") return hydrate(client, row);
    if (action.kind === "cancel" && row.status === "cancelled") return hydrate(client, row);
    if (!["draft", "live"].includes(row.status)) throw new MatchError(409, "La partita è già terminata.", await hydrate(client, row));
    if (row.version !== action.version) throw new MatchError(409, "La partita è stata aggiornata da un’altra finestra. Punteggio sincronizzato: ripeti l’azione.", await hydrate(client, row));
    const match = await hydrate(client, row);
    let undoOf: string | null = null;
    if (action.kind === "goal") {
      if (!(action.playerId in match.goals)) throw new MatchError(400, "Il giocatore non partecipa alla partita.");
      if (match.goals[action.playerId] + action.delta < 0) throw new MatchError(400, "I gol non possono essere negativi.");
      await client.query("update public.match_goals set goals=goals+$1 where match_id=$2 and player_id=$3", [action.delta, matchId, action.playerId]);
    } else if (action.kind === "undo") {
      const last = await client.query<{ id: string; player_id: string; delta: number }>(`select a.id,a.player_id,a.delta from public.match_actions a where a.match_id=$1 and a.kind='goal'
        and not exists(select 1 from public.match_actions u where u.undo_of=a.id) order by a.version desc limit 1`, [matchId]);
      if (!last.rows[0]) throw new MatchError(400, "Non ci sono azioni da annullare.");
      undoOf = last.rows[0].id;
      await client.query("update public.match_goals set goals=goals-$1 where match_id=$2 and player_id=$3", [last.rows[0].delta, matchId, last.rows[0].player_id]);
    } else if (action.kind === "finalize") {
      const ids = [row.home_striker_id, row.home_defender_id, row.away_striker_id, row.away_defender_id];
      const roster = await client.query<PlayerRow>("select * from public.players where id=any($1::uuid[]) order by id for update", [ids]);
      const players = playersFromRows(roster.rows);
      validateHistoricalMatch(match, players);
      let deltas: PlayerEloDelta[];
      try { deltas = computeMatchEloDeltas(match, players); }
      catch { throw new MatchError(400, "Il pareggio non è ammesso: continua fino a ottenere un vincitore."); }
      for (const delta of deltas) {
        const opponentId = delta.playerId === row.home_striker_id ? row.away_striker_id : delta.playerId === row.away_striker_id ? row.home_striker_id : delta.playerId === row.home_defender_id ? row.away_defender_id : row.home_defender_id;
        const opponent = players.find((p) => p.id === opponentId)!;
        await client.query(`insert into public.elo_events(match_id,player_id,opponent_id,elo_before,performance_result_delta,challenge_gap_before,challenge_delta,total_requested_delta,actual_delta,elo_after)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [matchId, delta.playerId, opponentId, delta.eloBefore, delta.performanceResultDelta, Math.abs(delta.eloBefore - opponent.currentElo), delta.challengeDelta, delta.totalRequestedDelta, delta.actualDelta, delta.eloAfter]);
      }
      for (const delta of deltas) await client.query("update public.players set current_elo=$1 where id=$2", [delta.eloAfter, delta.playerId]);
    }
    const result = await client.query<MatchRow>(`update public.matches set version=version+1,
      status=case when $2='finalize' then 'completed'::public.match_status when $2='cancel' then 'cancelled'::public.match_status else 'live'::public.match_status end,
      completed_at=case when $2='finalize' then clock_timestamp() else completed_at end,
      history_order=case when $2='finalize' then (select coalesce(max(history_order),0)+1 from public.matches where season_id=$3) else history_order end
      where id=$1 returning *`, [matchId, action.kind, row.season_id]);
    await client.query("insert into public.match_actions(id,match_id,actor_id,kind,player_id,delta,undo_of,version) values($1,$2,$3,$4,$5,$6,$7,$8)", [action.mutationId, matchId, actor.id, action.kind, action.kind === "goal" ? action.playerId : null, action.kind === "goal" ? action.delta : null, undoOf, result.rows[0].version]);
    return hydrate(client, result.rows[0]);
  });
}

export async function getResultsScreen(actor: MatchActor, pool: MatchDatabase = database()): Promise<import("@/types/live-match").ResultScreen> {
  return transaction(pool, async (client) => {
    const stored=await requireActor(client,actor);
    if(!stored.is_admin)throw new MatchError(403,"Gestione risultati riservata all’arbitro Roberto.");
    const roster=await client.query<PlayerRow>("select * from public.players order by animal");
    const games=await client.query<MatchRow>("select * from public.matches where status='completed' order by history_order desc nulls last,completed_at desc,id");
    const goals=await client.query<{match_id:string;player_id:string;goals:number}>("select g.* from public.match_goals g join public.matches m on m.id=g.match_id where m.status='completed'");
    const scores=new Map<string,Record<string,number>>();
    for(const row of goals.rows){const score=scores.get(row.match_id)??{};score[row.player_id]=row.goals;scores.set(row.match_id,score);}
    return {players:playersFromRows(roster.rows),matches:games.rows.map((row)=>({id:row.id,status:row.status,ratingPolicy:row.rating_policy,historyOrder:row.history_order??undefined,home:{strikerId:row.home_striker_id,defenderId:row.home_defender_id},away:{strikerId:row.away_striker_id,defenderId:row.away_defender_id},goals:scores.get(row.id)??{},version:row.version,createdAt:new Date(row.created_at).toISOString(),completedAt:row.completed_at?new Date(row.completed_at).toISOString():undefined,seasonId:row.season_id,canUndo:false,eloDeltas:[]}))};
  },true);
}

async function rebuildOfficialRatings(client:MatchClient) {
  const seasons=await client.query("select distinct season_id from public.matches where status='completed'");
  if((seasons.rowCount??0)>1)throw new MatchError(409,"Ricalcolo di più stagioni da configurare prima di modificare risultati.");
  const roster=await client.query<PlayerRow>("select * from public.players order by id for update");
  const rows=await client.query<MatchRow & {history_order:number|null}>("select * from public.matches where status='completed'");
  const goals=await client.query<{match_id:string;player_id:string;goals:number}>("select * from public.match_goals");
  const scores=new Map<string,Record<string,number>>();
  for(const row of goals.rows){const score=scores.get(row.match_id)??{};score[row.player_id]=row.goals;scores.set(row.match_id,score);}
  const history=rows.rows.map((row)=>({id:row.id,status:row.status,ratingPolicy:row.rating_policy,historyOrder:row.history_order??undefined,home:{strikerId:row.home_striker_id,defenderId:row.home_defender_id},away:{strikerId:row.away_striker_id,defenderId:row.away_defender_id},goals:scores.get(row.id)??{},version:row.version,createdAt:new Date(row.created_at).toISOString(),completedAt:row.completed_at?new Date(row.completed_at).toISOString():undefined,seasonId:row.season_id}));
  const {recalculateHistory}=await import("../domain/history");
  const result=recalculateHistory(history,playersFromRows(roster.rows));
  await client.query("delete from public.elo_events");
  for(const e of result.events)await client.query(`insert into public.elo_events(match_id,player_id,opponent_id,elo_before,performance_result_delta,challenge_gap_before,challenge_delta,total_requested_delta,actual_delta,elo_after)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[e.matchId,e.playerId,e.opponentId,e.eloBefore,e.performanceResultDelta,e.challengeGapBefore,e.challengeDelta,e.totalRequestedDelta,e.actualDelta,e.eloAfter]);
  for(const player of result.players)await client.query("update public.players set current_elo=$1 where id=$2",[player.currentElo,player.id]);
}
export async function correctResult(actor:MatchActor, matchId:string, correction:import("@/types/live-match").ResultCorrection, pool:MatchDatabase=database()):Promise<LiveMatch> {
  if(!isUuid(matchId)||!isUuid(correction.mutationId)||!Number.isSafeInteger(correction.version)||correction.version<0||!["edit","delete"].includes(correction.kind))throw new MatchError(400,"Correzione non valida.");
  return transaction(pool,async(client)=>{
    const stored=await requireActor(client,actor);
    if(!stored.is_admin)throw new MatchError(403,"Solo l’arbitro Roberto può correggere i risultati.");
    const selected=await client.query<MatchRow>("select * from public.matches where id=$1 for update",[matchId]);
    const row=selected.rows[0];if(!row)throw new MatchError(404,"Partita non trovata.");
    const prior=await client.query<{match_id:string;actor_id:string;kind:string;requested_goals:Record<string,number>|null}>("select * from public.result_changes where id=$1",[correction.mutationId]);
    if(prior.rows[0]){
      const saved=prior.rows[0];
      const equalGoals=correction.kind!=="edit"||(correction.goals&&saved.requested_goals&&Object.keys(saved.requested_goals).length===Object.keys(correction.goals).length&&Object.keys(saved.requested_goals).every((id)=>saved.requested_goals![id]===correction.goals![id]));
      if(saved.match_id!==matchId||saved.actor_id!==actor.id||saved.kind!==correction.kind||!equalGoals)throw new MatchError(409,"Identificativo correzione già utilizzato.");
      return hydrate(client,row);
    }
    if(row.status!=="completed")throw new MatchError(409,"Si possono correggere solo partite concluse.");
    if(row.version!==correction.version)throw new MatchError(409,"Il risultato è stato modificato da un’altra finestra. Ricarica lo storico.",await hydrate(client,row));
    const before=await hydrate(client,row);
    if(correction.kind==="edit"){
      const ids=Object.keys(before.goals);
      if(!correction.goals||Object.keys(correction.goals).length!==4||ids.some((id)=>!Number.isInteger(correction.goals![id])||correction.goals![id]<0||correction.goals![id]>2147483647))throw new MatchError(400,"Inserisci quattro contatori interi, non negativi, dei partecipanti.");
      const home=correction.goals[row.home_striker_id]+correction.goals[row.home_defender_id],away=correction.goals[row.away_striker_id]+correction.goals[row.away_defender_id];
      if(home===away)throw new MatchError(400,"Il pareggio non è ammesso.");
    }
    await client.query(`insert into public.elo_recalculation_backups(reason,previous_state) select $1,jsonb_build_object(
      'players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'current_elo',current_elo)) from public.players),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.elo_events e),'[]'::jsonb))`,[`Correzione arbitro ${correction.kind}: ${matchId}`]);
    if(correction.kind==="edit")for(const [id,goals] of Object.entries(correction.goals!))await client.query("update public.match_goals set goals=$1 where match_id=$2 and player_id=$3",[goals,matchId,id]);
    const updated=await client.query<MatchRow>("update public.matches set version=version+1,status=case when $2='delete' then 'cancelled'::public.match_status else status end where id=$1 returning *",[matchId,correction.kind]);
    await rebuildOfficialRatings(client);
    await client.query("insert into public.result_changes(id,match_id,actor_id,kind,requested_goals,previous_state,version_after) values($1,$2,$3,$4,$5,$6,$7)",[correction.mutationId,matchId,actor.id,correction.kind,correction.kind==="edit"?correction.goals:null,before,updated.rows[0].version]);
    return hydrate(client,updated.rows[0]);
  });
}

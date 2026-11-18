import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { recalculateHistory, type HistoricalMatch } from "../src/lib/domain/history";
import { hashPassword, normalizeIdentity, verifyPassword } from "../src/lib/server/password";
import type { Player } from "../src/types/domain";

interface ImportRow { sourceRow: number; round: number; leg: string; homeTeam: string; awayTeam: string; participants: string[]; goals: (number | null)[]; status: string }
interface Workbook { sha256: string; sourceFile: string; chronologyConfirmed: boolean; players: { legacyName: string }[]; matches: ImportRow[]; sheets: Record<string, Record<string, unknown>> }
interface RosterEntry { legacyName: string; username: string | null; city: string | null; role: "striker" | "defender" | null }
const workbook: Workbook = JSON.parse(readFileSync("data/imports/superlega.json", "utf8"));
const command = process.argv[2];
if (!process.env.CONNECTION_STRING) throw new Error("Manca CONNECTION_STRING nel file .env.");
let connectionString = process.env.CONNECTION_STRING;
if (process.env.DB_PASSWORD) connectionString = connectionString.replace(/\[(?:YOUR-PASSWORD|PASSWORD)\]/g, encodeURIComponent(process.env.DB_PASSWORD));
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
let db: PoolClient | undefined;

function roster(): RosterEntry[] {
  const entries: RosterEntry[] = JSON.parse(readFileSync("data/roster.local.json", "utf8"));
  const names = workbook.players.map((p) => p.legacyName);
  if (entries.length !== names.length || new Set(entries.map((e) => e.legacyName)).size !== names.length || entries.some((e) => !names.includes(e.legacyName))) throw new Error("Il roster deve contenere solo ed esattamente i 14 giocatori del file Excel.");
  const usernames = entries.filter((e) => e.username).map((e) => normalizeIdentity(e.username!));
  if (new Set(usernames).size !== usernames.length) throw new Error("Username duplicati nel roster.");
  if (entries.some((e) => e.role && !["striker", "defender"].includes(e.role))) throw new Error("Ruolo non valido.");
  return entries;
}
async function setup(client: PoolClient) {
  await client.query(`create table if not exists public.superlega_schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`);
  await client.query("revoke all on public.superlega_schema_migrations from anon,authenticated");
  await client.query("alter table public.superlega_schema_migrations enable row level security");
  for (const name of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(`supabase/migrations/${name}`, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const prior = await client.query("select sha256 from public.superlega_schema_migrations where name=$1", [name]);
    if (prior.rowCount) {
      if (prior.rows[0].sha256 !== hash) throw new Error(`Migrazione già applicata ma modificata: ${name}`);
      continue;
    }
    const existing = await client.query("select to_regclass('public.matches') as matches");
    if (name.includes("1801_") && existing.rows[0].matches) {
      const expected = ["players", "profiles", "seasons", "matches", "match_goals", "gallery_images", "elo_events"];
      for (const table of expected) {
        const check = await client.query("select to_regclass($1) as name", [`public.${table}`]);
        if (!check.rows[0].name) throw new Error("Init parziale: ripristinare lo schema prima di procedere.");
      }
      console.log("Init già presente: registro la baseline esistente.");
    } else await client.query(sql);
    await client.query("insert into public.superlega_schema_migrations(name,sha256) values($1,$2)", [name, hash]);
    console.log(`Migrazione applicata: ${name}`);
  }
}
async function stage(client: PoolClient) {
  const batch = await client.query(`insert into public.import_batches(source_sha256,source_name,raw_workbook,chronology_confirmed)
    values($1,$2,$3,$4) on conflict(source_sha256) do update set source_name=excluded.source_name returning id`, [workbook.sha256, workbook.sourceFile, workbook, workbook.chronologyConfirmed]);
  const id = batch.rows[0].id;
  for (const row of workbook.matches) await client.query("insert into public.import_match_rows(batch_id,source_row,data) values($1,$2,$3) on conflict do nothing", [id, row.sourceRow, row]);
  for (const player of workbook.players) await client.query("insert into public.users(legacy_name) values($1) on conflict(legacy_name) do nothing", [player.legacyName]);
  console.log(`Archiviati ${workbook.matches.length} incontri e ${workbook.players.length} utenti; nessun risultato ancora ufficializzato.`);
}
async function provision(client: PoolClient) {
  const entries = roster();
  for (const entry of entries) {
    if (!entry.username || !entry.city) continue;
    const existing = await client.query("select player_id from public.users where legacy_name=$1 for update", [entry.legacyName]);
    if (!existing.rowCount) throw new Error("Eseguire prima db:stage.");
    let playerId = existing.rows[0].player_id;
    if (entry.role) {
      if (!playerId) {
        playerId = randomUUID();
        await client.query("insert into public.players(id,animal,city,display_name,role) values($1,$2,$3,$4,$5)", [playerId, entry.username, entry.city, `${entry.username} DI ${entry.city}`, entry.role]);
      } else await client.query("update public.players set animal=$1,city=$2,display_name=$3,role=$4 where id=$5", [entry.username, entry.city, `${entry.username} DI ${entry.city}`, entry.role, playerId]);
    }
    await client.query("update public.users set username=$1,password_hash=$2,player_id=$3,enabled=$4 where legacy_name=$5", [entry.username, hashPassword(entry.city), playerId, !!playerId && !!entry.role, entry.legacyName]);
    await client.query("delete from public.user_sessions where user_id=(select id from public.users where legacy_name=$1)", [entry.legacyName]);
  }
  const count = await client.query("select count(*)::int as enabled from public.users where enabled");
  console.log(`Account abilitati complessivi: ${count.rows[0].enabled}. Il roster contiene 14 giocatori.`);
}
async function provisionReferee(client: PoolClient) {
  const config: {username:string;password:string}=JSON.parse(readFileSync("data/referee.local.json","utf8"));
  if(normalizeIdentity(config.username)!=="roberto" || !config.password) throw new Error("Configurare il solo account arbitro ROBERTO.");
  const existing=await client.query("select player_id from public.users where username_norm='roberto'");
  if(existing.rows[0]?.player_id) throw new Error("ROBERTO è associato a un giocatore: verificare prima di modificare.");
  await client.query("update public.users set is_admin=false where is_admin and username_norm<>'roberto'");
  await client.query(`insert into public.users(legacy_name,username,password_hash,is_admin,enabled)
    values('ARBITRO','ROBERTO',$1,true,true) on conflict(username_norm) do update set password_hash=excluded.password_hash,is_admin=true,enabled=true`,[hashPassword(config.password)]);
  await client.query("delete from public.user_sessions where user_id=(select id from public.users where username_norm='roberto')");
  console.log("Account ROBERTO abilitato come unico arbitro. Nessun giocatore aggiunto al ranking.");
}

async function promote(client: PoolClient) {
  const entries = roster();
  if (entries.some((e) => !e.username || !e.city || !e.role)) throw new Error("Completare prima username, città e ruoli di tutti i giocatori.");
  if (!workbook.chronologyConfirmed) throw new Error("Ordine delle righe non ancora confermato.");
  const batch = await client.query("select id,promoted_at from public.import_batches where source_sha256=$1 for update", [workbook.sha256]);
  if (!batch.rowCount) throw new Error("Eseguire db:stage.");
  if (batch.rows[0].promoted_at) { console.log("Importazione già ufficializzata: nessun duplicato creato."); return; }
  const outsiders = await client.query("select count(*)::int as total from public.matches where status='completed'");
  if (outsiders.rows[0].total) throw new Error("Sono già presenti risultati ufficiali: importazione iniziale sospesa per evitare sovrascritture.");
  const seasonId = randomUUID();
  await client.query("insert into public.seasons(id,name,active) values($1,'Superlega — storico Excel',true)", [seasonId]);
  const users = await client.query("select u.legacy_name,p.* from public.users u join public.players p on p.id=u.player_id where u.enabled");
  const players: Player[] = users.rows.map((r) => ({ id: r.id, animal: r.animal, city: r.city, displayName: r.display_name, role: r.role, active: r.active, currentElo: 100 }));
  const lookup = new Map(users.rows.map((r) => [r.legacy_name, r]));
  const matches: HistoricalMatch[] = [];
  for (const row of workbook.matches.filter((m) => m.status === "completed")) {
    const team = (names: string[]) => {
      const members = names.map((name) => lookup.get(name));
      const striker = members.find((m) => m?.role === "striker"), defender = members.find((m) => m?.role === "defender");
      if (!striker || !defender) throw new Error(`Ruoli incompatibili alla riga ${row.sourceRow}`);
      return { strikerId: striker.id, defenderId: defender.id };
    };
    const match: HistoricalMatch = { id: randomUUID(), status: "completed", ratingPolicy: "baseline", home: team(row.participants.slice(0,2)), away: team(row.participants.slice(2)), goals: Object.fromEntries(row.participants.map((name,index) => [lookup.get(name)!.id, row.goals[index]!])), historyOrder: row.sourceRow, createdAt: new Date().toISOString(), seasonId, version: 1 };
    matches.push(match);
    await client.query(`insert into public.matches(id,status,season_id,home_striker_id,home_defender_id,away_striker_id,away_defender_id,import_batch_id,source_row,history_order,version,rating_policy)
      values($1,'completed',$2,$3,$4,$5,$6,$7,$8,$8,1,'baseline')`, [match.id,seasonId,match.home.strikerId,match.home.defenderId,match.away.strikerId,match.away.defenderId,batch.rows[0].id,row.sourceRow]);
    for (const [playerId, goals] of Object.entries(match.goals)) await client.query("insert into public.match_goals(match_id,player_id,goals) values($1,$2,$3)", [match.id,playerId,goals]);
  }
  const calculated = recalculateHistory(matches, players);
  for (const p of calculated.players) await client.query("update public.players set current_elo=$1 where id=$2", [p.currentElo,p.id]);
  for (const e of calculated.events) await client.query(`insert into public.elo_events(match_id,player_id,opponent_id,elo_before,performance_result_delta,challenge_gap_before,challenge_delta,total_requested_delta,actual_delta,elo_after)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [e.matchId,e.playerId,e.opponentId,e.eloBefore,e.performanceResultDelta,e.challengeGapBefore,e.challengeDelta,e.totalRequestedDelta,e.actualDelta,e.eloAfter]);
  await client.query("update public.import_batches set promoted_at=now(),chronology_confirmed=true where id=$1", [batch.rows[0].id]);
  console.log(`Ufficializzate ${matches.length} partite, ${calculated.events.length} eventi ELO. Le righe senza gol restano nell'archivio importazione.`);
}
async function recalculateDatabase(client: PoolClient) {
  // Migration + backup + replacement share this outer transaction.
  await setup(client);
  await client.query("lock table public.matches, public.match_goals, public.players, public.elo_events in share row exclusive mode");
  const seasons = await client.query("select distinct season_id from public.matches where status='completed'");
  if (seasons.rowCount && seasons.rowCount > 1) throw new Error("Ricalcolo multi-stagione da configurare prima di procedere.");
  await client.query(`insert into public.elo_recalculation_backups(reason,previous_state)
    select 'Excel come base ELO senza sfide; nuove partite con regole complete', jsonb_build_object(
      'players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'current_elo',current_elo)) from public.players),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.elo_events e),'[]'::jsonb),
      'policies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rating_policy',rating_policy)) from public.matches),'[]'::jsonb))`);
  await client.query("update public.matches set rating_policy='baseline' where import_batch_id is not null and rating_policy<>'baseline'");
  const rosterRows = await client.query("select * from public.players");
  const gameRows = await client.query("select * from public.matches where status='completed'");
  const goalRows = await client.query("select * from public.match_goals");
  const players: Player[] = rosterRows.rows.map((r)=>({id:r.id,animal:r.animal,city:r.city,displayName:r.display_name,role:r.role,active:r.active,currentElo:100}));
  const scores = new Map<string,Record<string,number>>();
  for(const row of goalRows.rows) {const score=scores.get(row.match_id)??{}; score[row.player_id]=row.goals; scores.set(row.match_id,score);}
  const matches: HistoricalMatch[] = gameRows.rows.map((r)=>({id:r.id,status:r.status,ratingPolicy:r.rating_policy,
    home:{strikerId:r.home_striker_id,defenderId:r.home_defender_id},away:{strikerId:r.away_striker_id,defenderId:r.away_defender_id},
    goals:scores.get(r.id)??{},historyOrder:r.history_order??undefined,createdAt:r.created_at.toISOString(),completedAt:r.completed_at?.toISOString(),seasonId:r.season_id,version:r.version}));
  const calculated = recalculateHistory(matches,players);
  await client.query("delete from public.elo_events");
  for(const player of calculated.players) await client.query("update public.players set current_elo=$1 where id=$2",[player.currentElo,player.id]);
  for(const e of calculated.events) await client.query(`insert into public.elo_events(match_id,player_id,opponent_id,elo_before,performance_result_delta,challenge_gap_before,challenge_delta,total_requested_delta,actual_delta,elo_after)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[e.matchId,e.playerId,e.opponentId,e.eloBefore,e.performanceResultDelta,e.challengeGapBefore,e.challengeDelta,e.totalRequestedDelta,e.actualDelta,e.eloAfter]);
  console.log(`Ricalcolate ${matches.length} partite e ${calculated.events.length} eventi. Salvata copia dei precedenti ELO/eventi. Sfide Excel: zero; nuove partite: regole complete.`);
}

async function main() {
try {
  if (command === "preview") {
    const entries = roster();
    if (!workbook.chronologyConfirmed || entries.some((e) => !e.role || !e.username)) throw new Error("Confermare prima ruoli, identità e ordine delle righe.");
    const players: Player[] = entries.map((e) => ({ id:e.legacyName, animal:e.username!, city:"", displayName:e.username!, role:e.role!, active:true, currentElo:100 }));
    const matches: HistoricalMatch[] = workbook.matches.filter((m) => m.status === "completed").map((m) => {
      const team = (ids:string[]) => {
        const strikerId=ids.find((id) => players.find((p) => p.id===id)?.role === "striker");
        const defenderId=ids.find((id) => players.find((p) => p.id===id)?.role === "defender");
        if (!strikerId || !defenderId) throw new Error(`Ruoli incompatibili: riga ${m.sourceRow}`);
        return {strikerId,defenderId};
      };
      return {id:`excel-row-${m.sourceRow}`, status:"completed", ratingPolicy:"baseline", home:team(m.participants.slice(0,2)), away:team(m.participants.slice(2)), goals:Object.fromEntries(m.participants.map((id,i) => [id,m.goals[i]!])), historyOrder:m.sourceRow, createdAt:"", seasonId:"excel", version:1};
    });
    const result=recalculateHistory(matches,players);
    const output={ratingPolicy:"Excel: prestazione e risultato, senza sfida; nuove partite: regolamento completo",sourceSha256:workbook.sha256, ordering:"Ordine delle righe confermato dal proprietario", completedMatches:matches.length, excludedMatches:workbook.matches.length-matches.length, events:result.events.length, players:result.players.sort((a,b)=>b.currentElo-a.currentElo).map((p)=>({legacyName:p.id,username:p.animal,role:p.role,elo:Number(p.currentElo.toFixed(1))}))};
    writeFileSync("data/imports/elo-preview.json", JSON.stringify(output,null,2)+"\n");
    console.log(`Calcolati ${matches.length} risultati, ${result.events.length} eventi ELO. Report: data/imports/elo-preview.json`);
    return;
  }
  db = await pool.connect();
  if (command === "verify") {
    const counts=await db.query(`select (select count(*)::int from public.users) users, (select count(*)::int from public.users where enabled) enabled, (select count(*)::int from public.matches where status='completed') completed, (select count(*)::int from public.elo_events) events, (select count(*)::int from public.import_match_rows) source_rows`);
    const actual=await db.query(`select u.legacy_name,u.username,u.password_hash,p.* from public.users u join public.players p on p.id=u.player_id`);
    const games=await db.query("select * from public.matches where status='completed'");
    const goals=await db.query("select * from public.match_goals");
    const currentRoster: Player[]=actual.rows.map((r)=>({id:r.id,animal:r.animal,city:r.city,displayName:r.display_name,role:r.role,active:r.active,currentElo:Number(r.current_elo)}));
    const scores=new Map<string,Record<string,number>>();
    for(const r of goals.rows) {const score=scores.get(r.match_id)??{};score[r.player_id]=r.goals;scores.set(r.match_id,score);}
    const history: HistoricalMatch[]=games.rows.map((r)=>({id:r.id,status:r.status,ratingPolicy:r.rating_policy,home:{strikerId:r.home_striker_id,defenderId:r.home_defender_id},away:{strikerId:r.away_striker_id,defenderId:r.away_defender_id},goals:scores.get(r.id)??{},historyOrder:r.history_order??undefined,createdAt:r.created_at.toISOString(),completedAt:r.completed_at?.toISOString(),version:r.version,seasonId:r.season_id}));
    const expected=recalculateHistory(history,currentRoster).players;
    for(const entry of roster()) {
      const row=actual.rows.find((r)=>r.legacy_name===entry.legacyName);
      if(!row || row.username!==entry.username || row.role!==entry.role || !verifyPassword(entry.city!,row.password_hash)) throw new Error("Verifica account fallita.");
      if(Math.abs(Number(row.current_elo)-expected.find((e)=>e.id===row.id)!.currentElo)>0.000001) throw new Error("Verifica ELO fallita.");
    }
    const policyCheck=await db.query(`select count(*)::int as invalid from public.matches m join public.elo_events e on e.match_id=m.id where m.import_batch_id is not null and (m.rating_policy<>'baseline' or e.challenge_delta<>0)`);
    if(policyCheck.rows[0].invalid) throw new Error("Sfide ELO applicate erroneamente allo storico Excel.");
    for(const role of ["anon","authenticated"]) {
      const access=await db.query("select has_table_privilege($1,'public.users','select') as users,has_table_privilege($1,'public.matches','update') as matches",[role]);
      if(access.rows[0].users || access.rows[0].matches) throw new Error("Permessi pubblici inattesi.");
    }
    const referee=await db.query("select username_norm,password_hash,player_id,is_admin,enabled from public.users where is_admin");
    const config: {password:string}=JSON.parse(readFileSync("data/referee.local.json","utf8"));
    if(referee.rowCount!==1 || referee.rows[0].username_norm!=="roberto" || referee.rows[0].player_id!==null || !referee.rows[0].enabled || !verifyPassword(config.password,referee.rows[0].password_hash)) throw new Error("Verifica arbitro fallita.");
    if(counts.rows[0].users!==15 || counts.rows[0].enabled!==15 || counts.rows[0].events!==counts.rows[0].completed*4 || counts.rows[0].source_rows!==40) throw new Error("Conteggi database inattesi.");
    console.log({...counts.rows[0],accounts_verified:true,elo_verified:true,public_access_blocked:true});
  } else if (command === "check") {
    const result = await db.query("select current_database() is not null as connected, to_regclass('public.users') is not null as users_table, to_regclass('public.matches') is not null as matches_table");
    console.log(result.rows[0]);
  } else {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(731809)");
    if (command === "setup") await setup(db);
    else if (command === "stage") await stage(db);
    else if (command === "provision") await provision(db);
    else if (command === "referee") { await setup(db); await provisionReferee(db); }
    else if (command === "promote") await promote(db);
    else if (command === "recalculate") await recalculateDatabase(db);
    else throw new Error("Comando: check | setup | stage | provision | promote | recalculate");
    await db.query("commit");
  }
} catch (error) {
  if (db) await db.query("rollback").catch(() => undefined);
  // Connection errors may contain usernames/hosts: never print connection strings.
  const code = (error as { code?: string }).code;
  console.error(code ? `Operazione database fallita (${code}). Nessun dato parzialmente salvato.` : error instanceof Error && !/password|postgres(?:ql)?:\/\//i.test(error.message) ? error.message : "Operazione database fallita. Verificare la configurazione locale.");
  process.exitCode = 1;
} finally { db?.release(); await pool.end(); }

}
void main();

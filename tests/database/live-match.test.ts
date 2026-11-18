import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { changeLiveMatch, createLiveMatch, getMatchScreen, correctResult, getResultsScreen, type MatchClient, type MatchDatabase } from "@/lib/server/match-store";
import { recalculateHistory, type HistoricalMatch } from "@/lib/domain/history";
import type { Player } from "@/types/domain";

let sql: PGlite;
const ids = Array.from({ length: 4 }, () => randomUUID());
const owner = { id: randomUUID(), is_admin: true }, other = { id: randomUUID(), is_admin: false };
const lineup = { home: { strikerId: ids[0], defenderId: ids[1] }, away: { strikerId: ids[2], defenderId: ids[3] } };
const client: MatchClient = {
  query: (async (statement: string, values?: unknown[]) => {
    const result = await sql.query(statement, values);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  }) as MatchClient["query"],
  release() {},
};
const pool: MatchDatabase = { async connect() { return client; } };
const goal = (version: number, playerId = ids[0], delta: 1 | -1 = 1) => ({ kind: "goal" as const, playerId, delta, mutationId: randomUUID(), version });

beforeAll(async () => {
  sql = new PGlite();
  await sql.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  for (const file of readdirSync("supabase/migrations").sort()) await sql.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
  for (const [index, id] of ids.entries()) await sql.query("insert into public.players(id,animal,city,display_name,role) values($1,$2,'C',$2,$3)", [id, `Player${index}`, index % 2 ? "defender" : "striker"]);
  await sql.query("insert into public.users(id,legacy_name,username,player_id,password_hash,enabled,is_admin) values($1,'ARBITRO','ROBERTO',null,'test-hash',true,true),($2,'Other','Other',$3,'test-hash',true,false)", [owner.id, other.id, ids[2]]);
  await sql.query("insert into public.seasons(name,active) values('Test',true)");
}, 20000);
beforeEach(async () => { await sql.exec("delete from public.result_changes; delete from public.matches; delete from public.elo_recalculation_backups; update public.players set current_elo=100;"); });
afterAll(async () => { await sql?.close(); });

describe("partita live su PostgreSQL", () => {
  it("serves ten spectators with one consistent query each and checks stored permissions", async () => {
    const match = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await changeLiveMatch(owner, match.id, goal(0), pool);
    const query = vi.fn(client.query);
    const release = vi.fn();
    const readers: MatchDatabase = { async connect() { return {query: query as unknown as MatchClient["query"], release}; } };
    const screens = await Promise.all(Array.from({length: 10}, () => getMatchScreen({...other, is_admin: true}, readers)));
    expect(query).toHaveBeenCalledTimes(10);
    expect(release).toHaveBeenCalledTimes(10);
    for (const screen of screens) {
      expect(screen.canControl).toBe(false);
      expect(screen.match?.goals[ids[0]]).toBe(1);
      expect(screen.match?.version).toBe(1);
    }
    await sql.query("update public.users set enabled=false where id=$1", [other.id]);
    try { await expect(getMatchScreen(other, readers)).rejects.toThrow(/Accedi/); }
    finally { await sql.query("update public.users set enabled=true where id=$1", [other.id]); }
    expect(release).toHaveBeenCalledTimes(11);
  });
  it("parte senza partita, crea quattro contatori e riprende i gol dal DB", async () => {
    expect((await getMatchScreen(owner, pool)).match).toBeNull();
    const input = { id: randomUUID(), ...lineup };
    const match = await createLiveMatch(owner, input, pool);
    expect(match.status).toBe("live");
    expect(Object.values(match.goals)).toEqual([0, 0, 0, 0]);
    expect((await createLiveMatch(owner, input, pool)).id).toBe(match.id);
    const saved = await changeLiveMatch(owner, match.id, goal(0), pool);
    expect(saved.goals[ids[0]]).toBe(1);
    expect((await getMatchScreen(owner, pool)).match).toEqual(saved);
    expect((await sql.query("select * from public.elo_events")).rows).toHaveLength(0);
  });
  it("rifiuta partecipanti duplicati, ruoli errati e seconda partita in corso", async () => {
    await expect(createLiveMatch(owner, { id: randomUUID(), ...lineup, away: lineup.home }, pool)).rejects.toThrow(/distinti/);
    await expect(createLiveMatch(owner, { id: randomUUID(), ...lineup, home: { strikerId: ids[1], defenderId: ids[0] } }, pool)).rejects.toThrow(/attaccante/);
    await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await expect(createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool)).rejects.toThrow(/già una partita/);
  });
  it("non duplica incrementi nei retry, gestisce versioni e undo dopo refresh", async () => {
    const match = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    const increment = goal(0);
    await changeLiveMatch(owner, match.id, increment, pool);
    const replayed = await changeLiveMatch(owner, match.id, increment, pool);
    expect(replayed.goals[ids[0]]).toBe(1);
    expect(replayed.version).toBe(1);
    await expect(changeLiveMatch(owner, match.id, goal(0), pool)).rejects.toThrow(/altra finestra/);
    const undone = await changeLiveMatch(owner, match.id, { kind: "undo", mutationId: randomUUID(), version: 1 }, pool);
    expect(undone.goals[ids[0]]).toBe(0);
    expect(undone.canUndo).toBe(false);
    await expect(changeLiveMatch(owner, match.id, goal(2, ids[0], -1), pool)).rejects.toThrow(/negativi/);
    await expect(changeLiveMatch(owner, match.id, goal(2, randomUUID()), pool)).rejects.toThrow(/partecipa/);
  });
  it("il proprietario conferma una sola volta, con quattro eventi e sfide standard", async () => {
    const match = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await expect(changeLiveMatch(owner, match.id, { kind: "finalize", mutationId: randomUUID(), version: 0 }, pool)).rejects.toThrow(/pareggio/);
    await changeLiveMatch(owner, match.id, goal(0), pool);
    const request = { kind: "finalize" as const, mutationId: randomUUID(), version: 1 };
    const done = await changeLiveMatch(owner, match.id, request, pool);
    expect(done.status).toBe("completed");
    expect(done.eloDeltas).toHaveLength(4);
    expect(done.eloDeltas.every((e) => Math.abs(e.challengeDelta) === 5)).toBe(true);
    expect((await changeLiveMatch(owner, match.id, request, pool)).eloDeltas).toEqual(done.eloDeltas);
    await changeLiveMatch(owner, match.id, { ...request, mutationId: randomUUID() }, pool);
    expect((await sql.query("select * from public.elo_events")).rows).toHaveLength(4);
    expect((await getMatchScreen(owner, pool)).match).toBeNull();
    await expect(changeLiveMatch(owner, match.id, goal(2), pool)).rejects.toThrow(/terminata/);
    const players = (await sql.query<{ id: string; current_elo: string }>("select id,current_elo from public.players")).rows;
    for (const event of done.eloDeltas) expect(Number(players.find((p) => p.id === event.playerId)?.current_elo)).toBeCloseTo(event.eloAfter, 8);
  });
  it("verifica il ruolo admin sul DB e blocca un altro giocatore", async () => {
    const match = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await expect(changeLiveMatch({ ...other, is_admin: true }, match.id, goal(0), pool)).rejects.toThrow(/Roberto|ROBERTO/);
    await expect(changeLiveMatch(other, match.id, { kind: "finalize", mutationId: randomUUID(), version: 0 }, pool)).rejects.toThrow(/Roberto|ROBERTO/);
    const observing=await getMatchScreen(other,pool);
    expect(observing.canControl).toBe(false);
    expect(observing.match?.id).toBe(match.id);
    await expect(createLiveMatch(other,{id:randomUUID(),...lineup},pool)).rejects.toThrow(/ROBERTO/);
    await expect(getResultsScreen(other,pool)).rejects.toThrow(/Roberto/);
  });
  it("annulla una partita senza effetti ELO e permette una nuova creazione", async () => {
    const match = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await changeLiveMatch(owner, match.id, goal(0), pool);
    const cancelled = await changeLiveMatch(owner, match.id, { kind: "cancel", mutationId: randomUUID(), version: 1 }, pool);
    expect(cancelled.status).toBe("cancelled");
    expect((await sql.query("select * from public.elo_events")).rows).toHaveLength(0);
    expect((await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool)).status).toBe("live");
  });
  it("un errore nel salvataggio ELO annulla anche stato, eventi e cache", async () => {
    const match = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await changeLiveMatch(owner, match.id, goal(0), pool);
    await sql.exec("create function public.fail_event() returns trigger language plpgsql as $$ begin raise exception 'errore simulato'; end $$; create trigger fail_event before insert on public.elo_events for each row execute function public.fail_event();");
    await expect(changeLiveMatch(owner, match.id, { kind: "finalize", mutationId: randomUUID(), version: 1 }, pool)).rejects.toThrow(/errore simulato/);
    await sql.exec("drop trigger fail_event on public.elo_events; drop function public.fail_event();");
    expect((await getMatchScreen(owner, pool)).match?.status).toBe("live");
    expect((await sql.query("select * from public.elo_events")).rows).toHaveLength(0);
    expect((await sql.query<{ current_elo: string }>("select current_elo from public.players")).rows.every((p) => Number(p.current_elo) === 100)).toBe(true);
  });
  it("assegna ordine crescente alle conferme, riconciliabile con il ricalcolo", async () => {
    const first = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await changeLiveMatch(owner, first.id, goal(0), pool);
    await changeLiveMatch(owner, first.id, { kind: "finalize", mutationId: randomUUID(), version: 1 }, pool);
    const second = await createLiveMatch(owner, { id: randomUUID(), ...lineup }, pool);
    await changeLiveMatch(owner, second.id, goal(0, ids[2]), pool);
    const done = await changeLiveMatch(owner, second.id, { kind: "finalize", mutationId: randomUUID(), version: 1 }, pool);
    const orders = await sql.query<{ id: string; history_order: number }>("select id,history_order from public.matches order by history_order");
    expect(orders.rows.map((r) => r.history_order)).toEqual([1, 2]);
    const roster: Player[] = ids.map((id, i) => ({ id, role: i % 2 ? "defender" : "striker", animal: id, city: "", displayName: id, active: true, currentElo: 100 }));
    const games: HistoricalMatch[] = [first, done].map((m, i) => ({ ...m, status: "completed", historyOrder: i + 1, goals: i === 0 ? { ...m.goals, [ids[0]]: 1 } : m.goals }));
    const reconstructed = recalculateHistory(games, roster);
    for (const event of done.eloDeltas) expect(reconstructed.players.find((p) => p.id === event.playerId)?.currentElo).toBeCloseTo(event.eloAfter, 8);
  });
  it("il generatore verifica il cambio compagno anche sul server",async()=>{
    const first=await createLiveMatch(owner,{id:randomUUID(),...lineup},pool);
    await changeLiveMatch(owner,first.id,goal(0),pool);
    await changeLiveMatch(owner,first.id,{kind:"finalize",mutationId:randomUUID(),version:1},pool);
    await expect(createLiveMatch(owner,{id:randomUUID(),...lineup,fromGenerator:true},pool)).rejects.toThrow(/ultimo compagno/);
    const alternative=await createLiveMatch(owner,{id:randomUUID(),home:{strikerId:ids[0],defenderId:ids[3]},away:{strikerId:ids[2],defenderId:ids[1]},fromGenerator:true},pool);
    expect(alternative.status).toBe("live");
  });
  it("solo Roberto corregge ed elimina risultati, ricalcolando gli ELO successivi una sola volta",async()=>{
    const first=await createLiveMatch(owner,{id:randomUUID(),...lineup},pool);
    await changeLiveMatch(owner,first.id,goal(0),pool);
    const firstDone=await changeLiveMatch(owner,first.id,{kind:"finalize",mutationId:randomUUID(),version:1},pool);
    const second=await createLiveMatch(owner,{id:randomUUID(),...lineup},pool);
    await changeLiveMatch(owner,second.id,goal(0),pool);
    const secondDone=await changeLiveMatch(owner,second.id,{kind:"finalize",mutationId:randomUUID(),version:1},pool);
    const correction={kind:"edit" as const,mutationId:randomUUID(),version:firstDone.version,goals:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:3,[ids[3]]:1}};
    await expect(correctResult(other,first.id,correction,pool)).rejects.toThrow(/Roberto/);
    const edited=await correctResult(owner,first.id,correction,pool);
    expect(edited.goals).toEqual(correction.goals);
    await correctResult(owner,first.id,correction,pool);
    expect((await sql.query("select * from public.result_changes")).rows).toHaveLength(1);
    const after=await sql.query<{elo_before:string}>("select elo_before from public.elo_events where match_id=$1 and player_id=$2",[second.id,ids[0]]);
    expect(Number(after.rows[0].elo_before)).not.toBe(secondDone.eloDeltas.find((e)=>e.playerId===ids[0])?.eloBefore);
    await expect(correctResult(owner,first.id,{...correction,mutationId:randomUUID(),version:edited.version,goals:Object.fromEntries(ids.map((id)=>[id,0]))},pool)).rejects.toThrow(/pareggio/);
    await correctResult(owner,first.id,{kind:"delete",mutationId:randomUUID(),version:edited.version},pool);
    expect((await getResultsScreen(owner,pool)).matches.map((m)=>m.id)).toEqual([second.id]);
    expect((await sql.query("select * from public.elo_events")).rows).toHaveLength(4);
    expect((await sql.query<{elo_before:string}>("select elo_before from public.elo_events where match_id=$1",[second.id])).rows.every((e)=>Number(e.elo_before)===100)).toBe(true);
    expect((await sql.query("select * from public.result_changes")).rows).toHaveLength(2);
  });

});

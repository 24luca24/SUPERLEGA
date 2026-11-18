import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createLiveMatch, changeLiveMatch, getMatchScreen, correctResult, type MatchClient, type MatchDatabase } from "../src/lib/server/match-store";

async function main() {
  if (!process.env.CONNECTION_STRING) throw new Error("Manca CONNECTION_STRING.");
  const connectionString = process.env.DB_PASSWORD ? process.env.CONNECTION_STRING.replace(/\[(?:YOUR-PASSWORD|PASSWORD)\]/g, encodeURIComponent(process.env.DB_PASSWORD)) : process.env.CONNECTION_STRING;
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
  const client = await pool.connect();
  const snapshot = async () => (await client.query(`select (select count(*) from public.matches)::text matches,
    (select count(*) from public.users)::text users,
    (select jsonb_agg(jsonb_build_object('id',id,'elo',current_elo) order by id) from public.players) ratings`)).rows[0];
  const before = await snapshot();
  const nested: MatchClient = {
    query: (async (statement: string, values?: unknown[]) => {
      if (statement.toLowerCase().startsWith("begin")) return client.query("savepoint scoreboard_smoke");
      if (statement === "commit") return client.query("release savepoint scoreboard_smoke");
      if (statement === "rollback") { await client.query("rollback to savepoint scoreboard_smoke"); return client.query("release savepoint scoreboard_smoke"); }
      return client.query(statement, values);
    }) as MatchClient["query"], release() {},
  };
  const store: MatchDatabase = { async connect() { return nested; } };
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(731809)");
    const ids = Array.from({ length: 4 }, () => randomUUID());
    for (const [index, id] of ids.entries()) await client.query("insert into public.players(id,animal,city,display_name,role) values($1,$2,'VERIFICA',$2,$3)", [id, `VERIFICA-${id}`, index % 2 ? "defender" : "striker"]);
    const referee=await client.query("select id from public.users where username_norm='roberto' and is_admin and enabled");
    if(!referee.rows[0])throw new Error("Arbitro non configurato.");
    const actor = { id:referee.rows[0].id,is_admin:true };
    assert.equal((await getMatchScreen(actor, store)).match, null);
    let game = await createLiveMatch(actor, { id: randomUUID(), home: { strikerId: ids[0], defenderId: ids[1] }, away: { strikerId: ids[2], defenderId: ids[3] } }, store);
    const increment = { kind: "goal" as const, playerId: ids[0], delta: 1 as const, mutationId: randomUUID(), version: game.version };
    game = await changeLiveMatch(actor, game.id, increment, store);
    const duplicate = await changeLiveMatch(actor, game.id, increment, store);
    assert.equal(duplicate.goals[ids[0]], 1);
    assert.equal((await getMatchScreen(actor, store)).match?.version, game.version);
    game = await changeLiveMatch(actor, game.id, { kind: "undo", mutationId: randomUUID(), version: game.version }, store);
    assert.equal(game.goals[ids[0]], 0);
    game = await changeLiveMatch(actor, game.id, { ...increment, mutationId: randomUUID(), version: game.version }, store);
    const finalize = { kind: "finalize" as const, mutationId: randomUUID(), version: game.version };
    game = await changeLiveMatch(actor, game.id, finalize, store);
    assert.equal(game.status, "completed"); assert.equal(game.eloDeltas.length, 4);
    assert(game.eloDeltas.every((e) => Math.abs(e.challengeDelta) === 5));
    const repeated = await changeLiveMatch(actor, game.id, finalize, store);
    assert.deepEqual(repeated.eloDeltas, game.eloDeltas);
    assert.equal((await client.query("select count(*)::int total from public.elo_events where match_id=$1", [game.id])).rows[0].total, 4);
    const edited=await correctResult(actor,game.id,{kind:"edit",mutationId:randomUUID(),version:game.version,goals:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:3,[ids[3]]:1}},store);
    assert.equal(edited.goals[ids[2]],3);assert.equal(edited.eloDeltas.length,4);
    const deleted=await correctResult(actor,game.id,{kind:"delete",mutationId:randomUUID(),version:edited.version},store);
    assert.equal(deleted.status,"cancelled");assert.equal(deleted.eloDeltas.length,0);
    await client.query("rollback");
    assert.deepEqual(await snapshot(), before);
    console.log("Supabase: creazione, gol, retry, ripresa, undo, conferma, correzione ed eliminazione verificati. Transazione annullata: nessun dato di prova conservato.");
  } finally { await client.query("rollback").catch(() => undefined); client.release(); await pool.end(); }
}
main().catch(() => { console.error("Verifica segnapunti su Supabase fallita; transazione annullata."); process.exitCode = 1; });

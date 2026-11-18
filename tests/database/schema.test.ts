import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  // PGlite has gen_random_uuid built in; pgcrypto is not available in this harness.
  await db.exec(readFileSync("supabase/migrations/2026111801_init_superlega.sql", "utf8").replace('create extension if not exists "pgcrypto";', ""));
  await db.exec(readFileSync("supabase/migrations/2026111802_real_roster.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/2026111803_excel_baseline.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/2026111805_no_draws.sql", "utf8"));
}, 20000);
afterAll(async () => { await db?.close(); });
describe("schema roster reale", () => {
  it("blocca letture di utenti, sessioni e risultati con le chiavi pubbliche", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of ["users", "user_sessions", "players", "matches", "match_goals", "import_batches", "elo_recalculation_backups"]) {
        await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
      }
      await db.exec("reset role");
    }
  });
  it("non abilita un utente incompleto e non accetta ELO negativi", async () => {
    await expect(db.query("insert into public.users(legacy_name,enabled) values('INCOMPLETO',true)")).rejects.toThrow(/check constraint/);
    await expect(db.query("insert into public.players(animal,city,display_name,role,current_elo) values('A','B','A','striker',-1)")).rejects.toThrow(/check constraint/);
  });
  it("conferma una partita solo con quattro contatori dei partecipanti e ruoli corretti", async () => {
    const ids = [1,2,3,4].map((n) => `00000000-0000-0000-0000-00000000000${n}`);
    for (const [index,id] of ids.entries()) await db.query("insert into public.players(id,animal,city,display_name,role) values($1,$2,'C',$2,$3)", [id, `P${index}`, index%2 ? "defender" : "striker"]);
    const season = (await db.query<{id:string}>("insert into public.seasons(name) values('Test') returning id")).rows[0].id;
    const insert = `insert into public.matches(season_id,home_striker_id,home_defender_id,away_striker_id,away_defender_id) values($1,$2,$3,$4,$5) returning id`;
    await expect(db.query(insert, [season,...ids])).rejects.toThrow(/quattro contatori/);
    await expect(db.query(insert, [season,ids[1],ids[0],ids[2],ids[3]])).rejects.toThrow(/Ruoli/);
    await db.exec("begin");
    const match = (await db.query<{id:string}>(insert, [season,...ids])).rows[0].id;
    for (const id of ids) await db.query("insert into public.match_goals(match_id,player_id,goals) values($1,$2,0)", [match,id]);
    await db.exec("commit");
    const policy = await db.query<{rating_policy:string}>("select rating_policy from public.matches where id=$1", [match]);
    expect(policy.rows[0].rating_policy).toBe("standard");
    await expect(db.query("update public.matches set status='completed',completed_at=now() where id=$1",[match])).rejects.toThrow(/pareggio/);
    await expect(db.query("update public.matches set rating_policy='baseline' where id=$1", [match])).rejects.toThrow(/baseline_requires_import/);
    await expect(db.query("delete from public.match_goals where match_id=$1 and player_id=$2", [match,ids[0]])).rejects.toThrow(/quattro contatori/);
    await expect(db.query("update public.players set role='defender' where id=$1", [ids[0]])).rejects.toThrow(/Ruolo bloccato/);
  });
  it("corregge i ruoli Gorilla conservando giocatori e gol, con backup e protezione storica", async () => {
    const brac="00000000-0000-0000-0000-000000000001", capo="00000000-0000-0000-0000-000000000002";
    await db.query("insert into public.users(legacy_name,username,player_id) values('AIRAGHI','GORILLA-CAPOBRANCO',$1),('CHIODINI','GORILLA-BRACCONIERE',$2)",[capo,brac]);
    await db.query("update public.match_goals set goals=case when player_id=$1 then 5 when player_id=$2 then 1 else 0 end",[capo,brac]);
    const before=await db.query("select player_id,goals from public.match_goals order by player_id");
    const migration=readFileSync("supabase/migrations/2026111804_correct_gorilla_roles.sql","utf8");
    await db.exec(migration);
    await db.exec(migration); // Rerunning the correction cannot swap the identities back.
    const after=await db.query("select player_id,goals from public.match_goals order by player_id");
    expect(after.rows).toEqual(before.rows);
    const roles=await db.query<{id:string;role:string}>("select id,role from public.players where id in($1,$2)",[capo,brac]);
    expect(roles.rows.find((r)=>r.id===capo)?.role).toBe("striker");
    expect(roles.rows.find((r)=>r.id===brac)?.role).toBe("defender");
    const match=await db.query<{home_striker_id:string;home_defender_id:string}>("select home_striker_id,home_defender_id from public.matches");
    expect(match.rows[0].home_striker_id).toBe(capo);
    expect(match.rows[0].home_defender_id).toBe(brac);
    expect((await db.query<{total:number}>("select count(*)::int total from public.elo_recalculation_backups")).rows[0].total).toBe(1);
    await expect(db.query("update public.players set role='defender' where id=$1",[capo])).rejects.toThrow(/Ruolo bloccato/);
  });

  it("rifiuta un pareggio dopo la conferma ma lo consente mentre si gioca", async () => {
    const row=(await db.query<{id:string}>("select id from public.matches")).rows[0];
    await db.query("update public.matches set status='completed',completed_at=now() where id=$1",[row.id]);
    await expect(db.query("update public.match_goals set goals=0 where match_id=$1",[row.id])).rejects.toThrow(/pareggio/);
    await db.query("update public.matches set status='live' where id=$1",[row.id]);
    await db.query("update public.match_goals set goals=0 where match_id=$1",[row.id]);
  });

});

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createLiveMatch, getMatchScreen, changeLiveMatch, correctResult, getResultsScreen, MatchError, type MatchClient, type MatchDatabase } from "../src/lib/server/match-store";
import type { CreateLiveMatch, LiveMatchAction, MatchScreen, ResultScreen, ResultCorrection } from "../src/types/live-match";

async function main() {
  const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3100";
  const server = process.env.SMOKE_ORIGIN ? undefined : spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], { stdio: ["ignore", "pipe", "pipe"] });
  let serverExited = false;
  server?.on("exit", () => { serverExited = true; });
  server?.stdout.on("data", () => undefined); server?.stderr.on("data", () => undefined);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sql = new PGlite();
  let authenticated = false;
  try {
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline && !serverExited) {
      try { ready = (await context.request.get(`${origin}/login`, { timeout: 4000 })).status() === 200; if (ready) break; } catch { /* Wait for the server. */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(ready, "Server locale non disponibile. Impostare SMOKE_ORIGIN se un server Next è già attivo.");
    const referee:{username:string;password:string}=JSON.parse(readFileSync("data/referee.local.json","utf8"));
    const login=await context.request.post(`${origin}/api/auth/login`,{form:referee,headers:{origin},maxRedirects:0});
    assert.equal(login.status(),303);authenticated=true;
    const real=await context.request.get(`${origin}/api/matches`);assert.equal(real.status(),200);
    const screen:MatchScreen=await real.json();assert(screen.canControl,"Account arbitro non configurato.");
    assert(!screen.match,"C’è una partita reale in corso: prova interfaccia rinviata per non interferire.");
    const resultsResponse=await context.request.get(`${origin}/api/results`);assert.equal(resultsResponse.status(),200);
    const realResults:ResultScreen=await resultsResponse.json();
    await sql.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';");
    for (const file of readdirSync("supabase/migrations").sort()) await sql.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
    for (const player of screen.players) await sql.query("insert into public.players(id,animal,city,display_name,role,current_elo) values($1,$2,$3,$4,$5,$6)", [player.id, player.animal, player.city, player.displayName, player.role, player.currentElo]);
    const actor = { id: randomUUID(), is_admin: true };
    const observer={id:randomUUID(),is_admin:false};
    await sql.query("insert into public.users(id,legacy_name,username,player_id,password_hash,enabled,is_admin) values($1,'ARBITRO','ROBERTO',null,'test-hash',true,true),($2,'OBSERVER','OBSERVER',$3,'test-hash',true,false)",[actor.id,observer.id,screen.players[0].id]);
    const season=(await sql.query<{id:string}>("insert into public.seasons(name,active) values('Browser test',true) returning id")).rows[0].id;
    const batch=(await sql.query<{id:string}>("insert into public.import_batches(source_sha256,source_name,raw_workbook) values('browser-test','browser-test','{}') returning id")).rows[0].id;
    for(const [index,game] of [...realResults.matches].reverse().entries()){
      await sql.exec("begin");
      await sql.query(`insert into public.matches(id,status,season_id,home_striker_id,home_defender_id,away_striker_id,away_defender_id,version,history_order,rating_policy,import_batch_id,source_row)
        values($1,'completed',$2,$3,$4,$5,$6,$7,$8,'baseline',$9,$8)`,[game.id,season,game.home.strikerId,game.home.defenderId,game.away.strikerId,game.away.defenderId,game.version,index+1,batch]);
      for(const [id,goals] of Object.entries(game.goals))await sql.query("insert into public.match_goals(match_id,player_id,goals) values($1,$2,$3)",[game.id,id,goals]);
      await sql.exec("commit");
    }
    const client: MatchClient = { query: (async (statement: string, values?: unknown[]) => { const result = await sql.query(statement, values); return { ...result, rowCount: result.rows.length || result.affectedRows || 0 }; }) as MatchClient["query"], release() {} };
    const pool: MatchDatabase = { async connect() { return client; } };
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Browser writes use the actual store against isolated PostgreSQL; no test scores go to Supabase.
    await page.route("**/api/matches", async (route) => {
      try {
        const response = route.request().method() === "POST" ? { match: await createLiveMatch(actor, route.request().postDataJSON() as CreateLiveMatch, pool) } : await getMatchScreen(actor, pool);
        await route.fulfill({ status: 200, json: response });
      } catch (error) { await route.fulfill({ status: error instanceof MatchError ? error.status : 500, json: { error: error instanceof Error ? error.message : "Errore", match: error instanceof MatchError ? error.match : undefined } }); }
    });
    let droppedFirstGoal = false;
    await page.route("**/api/matches/*", async (route) => {
      try {
        const action = route.request().postDataJSON() as LiveMatchAction;
        const id = new URL(route.request().url()).pathname.split("/").pop()!;
        const match = await changeLiveMatch(actor, id, action, pool);
        if (action.kind === "goal" && !droppedFirstGoal) { droppedFirstGoal = true; await route.abort("failed"); return; }
        await route.fulfill({ status: 200, json: { match } });
      } catch (error) { await route.fulfill({ status: error instanceof MatchError ? error.status : 500, json: { error: error instanceof Error ? error.message : "Errore", match: error instanceof MatchError ? error.match : undefined } }); }
    });
    await page.route("**/api/results",async(route)=>{await route.fulfill({status:200,json:await getResultsScreen(actor,pool)});});
    await page.route("**/api/results/*",async(route)=>{
      try{const id=new URL(route.request().url()).pathname.split("/").pop()!;await route.fulfill({status:200,json:{match:await correctResult(actor,id,route.request().postDataJSON() as ResultCorrection,pool)}});}
      catch(error){await route.fulfill({status:error instanceof MatchError?error.status:500,json:{error:error instanceof Error?error.message:"Errore"}});}
    });
    await page.goto(`${origin}/generatore`);
    await page.getByRole("button",{name:"Seleziona tutti",exact:true}).click();
    await page.getByRole("button",{name:"Genera partita",exact:true}).click();
    await page.getByRole("heading",{name:"Proposta partita",exact:true}).waitFor();
    assert.equal(await page.getByRole("checkbox").count(),screen.players.filter((p)=>p.active).length);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:"/private/tmp/superlega-generatore.png",fullPage:true});
    await page.goto(`${origin}/partita`);
    await page.getByRole("button", { name: "Crea partita", exact: true }).waitFor();
    assert.equal(await page.locator("main select").count(), 0);
    await page.getByRole("button", { name: "Crea partita", exact: true }).click();
    await page.getByRole("button", { name: "Inizia partita", exact: true }).waitFor();
    assert(await page.getByRole("button", { name: "Inizia partita", exact: true }).isDisabled());
    const strikers = screen.players.filter((p) => p.role === "striker"), defenders = screen.players.filter((p) => p.role === "defender");
    await page.getByLabel("Attaccante squadra A", { exact: true }).selectOption(strikers[0].id);
    assert(await page.getByLabel("Attaccante squadra B", { exact: true }).locator(`option[value="${strikers[0].id}"]`).isDisabled());
    await page.getByLabel("Difensore squadra A", { exact: true }).selectOption(defenders[0].id);
    await page.getByLabel("Attaccante squadra B", { exact: true }).selectOption(strikers[1].id);
    await page.getByLabel("Difensore squadra B", { exact: true }).selectOption(defenders[1].id);
    await page.getByRole("button", { name: "Inizia partita", exact: true }).click();
    const finish = page.getByRole("button", { name: "Termina partita", exact: true });
    await finish.waitFor(); assert(await finish.isDisabled());
    const plus = page.getByRole("button", { name: `Aggiungi un gol a ${strikers[0].animal}`, exact: true });
    await plus.click();
    await page.getByLabel("Squadra A 1, Squadra B 0", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('button[aria-label^="Aggiungi un gol"]')?.hasAttribute("disabled"));
    // The committed response was dropped once; retry must still display exactly one goal.
    assert.equal((await getMatchScreen(actor, pool)).match?.goals[strikers[0].id], 1);
    await page.getByRole("button", { name: "Annulla ultima azione", exact: true }).click();
    await page.getByLabel("Squadra A 0, Squadra B 0", { exact: true }).waitFor();
    assert(await page.getByRole("button", { name: `Togli un gol a ${strikers[0].animal}`, exact: true }).isDisabled());
    await plus.click();
    await page.getByLabel("Squadra A 1, Squadra B 0", { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Layout mobile troppo largo.");
    await page.screenshot({ path: "/private/tmp/superlega-partita-live.png", fullPage: true });
    const regular:{username:string;city:string}=JSON.parse(readFileSync("data/roster.local.json","utf8"))[0];
    const viewer=await browser.newContext({viewport:{width:390,height:844}});
    try{
      const logged=await viewer.request.post(`${origin}/api/auth/login`,{form:{username:regular.username,password:regular.city},headers:{origin},maxRedirects:0});assert.equal(logged.status(),303);
      assert.equal((await viewer.request.get(`${origin}/api/results`)).status(),403);
      assert.equal((await viewer.request.post(`${origin}/api/matches`,{headers:{origin},data:{id:randomUUID(),home:{strikerId:strikers[0].id,defenderId:defenders[0].id},away:{strikerId:strikers[1].id,defenderId:defenders[1].id}}})).status(),403);
      const watching=await viewer.newPage();
      await watching.route("**/api/matches",async(route)=>{await route.fulfill({status:200,json:await getMatchScreen(observer,pool)});});
      await watching.goto(`${origin}/partita`);await watching.getByLabel("Squadra A 1, Squadra B 0",{exact:true}).waitFor({timeout:12000});
      assert.equal(await watching.getByRole("button",{name:/Aggiungi un gol|Togli un gol|Crea partita/}).count(),0);
      await viewer.request.post(`${origin}/api/auth/logout`,{headers:{origin},maxRedirects:0});
    }finally{await viewer.close();}

    await finish.click();
    await page.getByRole("button", { name: "Riprendi partita", exact: true }).click();
    await finish.click();
    await page.getByRole("button", { name: "Conferma risultato", exact: true }).click();
    await page.getByRole("heading", { name: "Risultato salvato", exact: true }).waitFor();
    const totals = await sql.query<{ games: number; events: number }>("select (select count(*)::int from public.matches where status='completed') games,(select count(*)::int from public.elo_events) events");
    assert.deepEqual(totals.rows[0], { games: realResults.matches.length+1, events: 4 });
    await page.getByRole("button", { name: "Nuova partita", exact: true }).click();
    await page.getByRole("button", { name: "Crea partita", exact: true }).waitFor();
    assert.equal(await page.locator("main select").count(), 0);
    const target=realResults.matches[0];
    if(target){
      await page.goto(`${origin}/arbitro`);
      await page.locator(`[data-match-id="${target.id}"]`).getByRole("button",{name:"Correggi",exact:true}).click();
      const goalInput=page.getByRole("spinbutton").first();await goalInput.fill(String(Number(await goalInput.inputValue())+50));
      await page.getByRole("button",{name:"Conferma correzione",exact:true}).click();
      await page.locator(`[data-match-id="${target.id}"]`).waitFor();
      await page.locator(`[data-match-id="${target.id}"]`).getByRole("button",{name:"Elimina",exact:true}).click();
      await page.getByRole("button",{name:"Conferma eliminazione",exact:true}).click();
      await page.getByRole("button",{name:"Correggi",exact:true}).first().waitFor();
      assert.equal(await page.locator(`[data-match-id="${target.id}"]`).count(),0);
      assert.equal((await sql.query<{total:number}>("select count(*)::int total from public.result_changes")).rows[0].total,2);
    }
    assert.deepEqual(pageErrors, []);
    console.log("Browser mobile: arbitro, osservatore senza contatori, generatore reale, contatori, correzione ed eliminazione verificati su PostgreSQL isolato. Nessun risultato di prova su Supabase.");
  } finally {
    if (authenticated) await context.request.post(`${origin}/api/auth/logout`, { headers: { origin }, maxRedirects: 0 }).catch(() => undefined);
    await browser.close(); await sql.close(); server?.kill("SIGTERM");
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Verifica browser fallita."); process.exitCode = 1; });

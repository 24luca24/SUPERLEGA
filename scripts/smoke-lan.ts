import {chromium} from "playwright";
import {Pool} from "pg";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import type {CreateLiveMatch,MatchScreen} from "../src/types/live-match";

async function main(){
 const origin=process.env.SMOKE_ORIGIN??"http://192.168.1.19:3001";
 if(!process.env.CONNECTION_STRING)throw new Error("Manca CONNECTION_STRING.");
 const connectionString=process.env.DB_PASSWORD?process.env.CONNECTION_STRING.replace(/\[(?:YOUR-PASSWORD|PASSWORD)\]/g,encodeURIComponent(process.env.DB_PASSWORD)):process.env.CONNECTION_STRING;
 const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:8000});
 const snapshot=async()=>(await pool.query(`select (select count(*) from public.matches)::text matches,(select count(*) from public.elo_events)::text events,
  (select jsonb_agg(jsonb_build_object('id',id,'elo',current_elo) order by id) from public.players) ratings`)).rows[0];
 const before=await snapshot();
 const browser=await chromium.launch({channel:"chrome",headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const created=new Set<string>();const errors:string[]=[];let signedIn=false;
 let lastInput:CreateLiveMatch|undefined;
 try{
  const login=await context.request.post(`${origin}/api/auth/login`,{form:JSON.parse(readFileSync("data/referee.local.json","utf8")),headers:{origin},maxRedirects:0});assert.equal(login.status(),303);signedIn=true;
  const current=await context.request.get(`${origin}/api/matches`);assert.equal(current.status(),200);const screen:MatchScreen=await current.json();
  assert(screen.canControl,"Serve l’arbitro per la verifica.");assert(!screen.match,"Partita reale in corso: verifica rinviata per non interferire.");
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(new URL(request.url()).pathname==="/api/matches"&&request.method()==="POST"){
   const input=request.postDataJSON() as CreateLiveMatch;if(/^[0-9a-f-]{36}$/i.test(input.id)){created.add(input.id);lastInput=input;}
  }});
  await page.goto(`${origin}/partita`,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Crea partita",exact:true}).click();
  await page.getByRole("button",{name:"Inizia partita",exact:true}).waitFor();
  const strikers=screen.players.filter(p=>p.active&&p.role==="striker"),defenders=screen.players.filter(p=>p.active&&p.role==="defender");
  await page.getByLabel("Attaccante squadra A",{exact:true}).selectOption(strikers[0].id);
  await page.getByLabel("Difensore squadra A",{exact:true}).selectOption(defenders[0].id);
  await page.getByLabel("Attaccante squadra B",{exact:true}).selectOption(strikers[1].id);
  await page.getByLabel("Difensore squadra B",{exact:true}).selectOption(defenders[1].id);
  await page.getByRole("button",{name:"Inizia partita",exact:true}).click();
  await page.getByLabel("Squadra A 0, Squadra B 0",{exact:true}).waitFor();
  await page.getByRole("button",{name:`Aggiungi un gol a ${strikers[0].animal}`,exact:true}).click();
  await page.getByLabel("Squadra A 1, Squadra B 0",{exact:true}).waitFor();
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByLabel("Squadra A 1, Squadra B 0",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Annulla ultima azione",exact:true}).click();
  await page.getByLabel("Squadra A 0, Squadra B 0",{exact:true}).waitFor();
  async function cancel(){await page.getByRole("button",{name:"Annulla partita",exact:true}).click();await page.getByRole("button",{name:"Sì, annulla partita",exact:true}).click();await page.getByRole("button",{name:"Crea partita",exact:true}).waitFor();}
  await cancel();
  // Navigate through the app so any previously prefetched empty scoreboard is exercised.
  await page.getByRole("link",{name:"Generatore",exact:true}).click();
  await page.getByRole("button",{name:"Genera partita",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"Servono almeno"}).waitFor();
  await page.getByRole("button",{name:"Seleziona tutti",exact:true}).click();
  await page.getByRole("button",{name:"Genera partita",exact:true}).click();
  await page.getByRole("heading",{name:"Proposta partita",exact:true}).waitFor();
  await page.waitForFunction(()=>{const h=[...document.querySelectorAll("h2")].find(node=>node.textContent==="Proposta partita");if(!h)return false;const r=h.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;});
  await page.getByRole("button",{name:"Avvia partita",exact:true}).click();
  await page.waitForURL(url=>url.pathname==="/partita"&&url.searchParams.has("match"));
  await page.getByLabel("Squadra A 0, Squadra B 0",{exact:true}).waitFor();
  const resumed:MatchScreen=await (await context.request.get(`${origin}/api/matches`)).json();
  assert(resumed.match&&lastInput);assert.equal(resumed.match.id,lastInput.id);assert.deepEqual(resumed.match.home,lastInput.home);assert.deepEqual(resumed.match.away,lastInput.away);
  await page.screenshot({path:"/private/tmp/superlega-lan-generata.png",fullPage:true});
  await cancel();
  assert.deepEqual(errors,[]);
  assert.equal(created.size,2);
  console.log("LAN reale: crea manuale, gol persistito, refresh, undo, genera e avvio della partita corretta verificati senza intercettare le API.");
 }finally{
  if(signedIn)await context.request.post(`${origin}/api/auth/logout`,{headers:{origin},maxRedirects:0}).catch(()=>undefined);
  await context.close();await browser.close();
  // Remove only the two known test drafts/cancelled games; never remove an official result.
  const client=await pool.connect();
  try{
   await client.query("begin");await client.query("select pg_advisory_xact_lock(731809)");
   for(const id of created){
    const row=await client.query("select m.status,u.username_norm from public.matches m join public.users u on u.id=m.owner_user_id where m.id=$1 for update of m",[id]);
    if(!row.rows[0])continue;
    if(row.rows[0].username_norm!=="roberto"||row.rows[0].status==="completed")throw new Error("Risultato ufficiale o proprietario inatteso: nessuna rimozione automatica.");
    await client.query("delete from public.matches where id=$1 and status<>'completed'",[id]);
   }
   await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}
  finally{client.release();}
  const after=await snapshot();await pool.end();assert.deepEqual(after,before,"Lo storico o gli ELO reali sono cambiati durante la verifica.");
  console.log("Partite temporanee rimosse. Storico ed ELO reali invariati.");
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Verifica LAN fallita");process.exitCode=1;});

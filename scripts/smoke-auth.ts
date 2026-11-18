import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
async function main() {
  const origin=process.env.SMOKE_ORIGIN??"http://127.0.0.1:3100";
  const server=process.env.SMOKE_ORIGIN ? undefined : spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3100"],{stdio:["ignore","pipe","pipe"]});
  let exited=false;
  server?.on("exit",()=>{exited=true;});
  // Consume output without printing possible request/session details.
  server?.stdout.on("data",()=>undefined); server?.stderr.on("data",()=>undefined);
  let cookie="";
  try {
    const deadline=Date.now()+90000;
    let ready=false;
    while(Date.now()<deadline && !exited) {
      try { ready=(await fetch(`${origin}/login`,{signal:AbortSignal.timeout(5000)})).status===200; if(ready) break; } catch { /* Wait for the development server. */ }
      await new Promise((resolve)=>setTimeout(resolve,500));
    }
    assert(ready,"Server di prova non disponibile.");
    const unauthenticated=await fetch(`${origin}/profilo`,{redirect:"manual"});
    assert([200,307].includes(unauthenticated.status)); // Streaming can encode a redirect in the HTML.
    const before=await fetch(`${origin}/api/auth/me`);
    assert.equal((await before.json()).authenticated,false);
    const post=(username:string,password:string,session="")=>fetch(`${origin}/api/auth/login`,{method:"POST",redirect:"manual",headers:{origin,"Content-Type":"application/x-www-form-urlencoded",...(session?{cookie:session}:{})},body:new URLSearchParams({username,password})});
    const unknown=await post("NON-NEL-ROSTER","INVALIDA");
    assert(unknown.headers.get("location")?.includes("errore=credenziali"), `Utente estraneo: risposta HTTP ${unknown.status}, redirect mancante.`);
    const entry=JSON.parse(readFileSync("data/roster.local.json","utf8"))[0];
    const valid=await post(entry.username,entry.city);
    assert(valid.headers.get("location")?.endsWith("/profilo"), `Login valido: risposta HTTP ${valid.status}, redirect ${valid.headers.get("location")??"assente"}.`);
    cookie=valid.headers.get("set-cookie")?.split(";")[0]??"";
    assert(cookie.startsWith("superlega_session="));
    const me=await fetch(`${origin}/api/auth/me`,{headers:{cookie}});
    assert.equal((await me.json()).username,entry.username);
    for(const path of ["/profilo","/classifica","/ranking","/ranking?mode=goals"]) {
      const response=await fetch(`${origin}${path}`,{headers:{cookie}});
      assert.equal(response.status,200,`${path} non disponibile`);
      const html=await response.text();
      assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),`${path} errore di rendering`);
      assert(html.includes(path==="/profilo"?"Il tuo profilo":path==="/classifica"?"Classifica individuale":"Attaccanti"));
      if(path.startsWith("/ranking")) {
        const unit=path.includes("goals")?"gol":"ELO";
        assert(html.includes(`<title`) && html.includes(`Attaccanti: ranking per ${unit}`), "Grafico attaccanti assente.");
        assert(html.includes(`Difensori: ranking per ${unit}`), "Grafico difensori assente.");
        assert(html.includes("var(--gold)") && html.includes("var(--silver)") && html.includes("var(--bronze)"), "Colori del podio assenti.");
      }
    }
    const forbidden=await fetch(`${origin}/api/profile/photo`,{method:"POST",headers:{origin},body:new FormData()});
    assert.equal(forbidden.status,401);
    const out=await fetch(`${origin}/api/auth/logout`,{method:"POST",headers:{origin,cookie},redirect:"manual"});
    assert.equal(out.status,303);
    const after=await fetch(`${origin}/api/auth/me`,{headers:{cookie}});
    assert.equal((await after.json()).authenticated,false);
    cookie="";
    console.log("Verificati: login roster, rifiuto utenti estranei, sessione, profilo, classifiche reali, upload non autenticato e logout.");
  } finally {
    if(cookie) await fetch(`${origin}/api/auth/logout`,{method:"POST",headers:{origin,cookie},redirect:"manual"}).catch(()=>undefined);
    server?.kill("SIGTERM");
  }
}
main().catch((error)=>{ console.error(error instanceof assert.AssertionError ? error.message : "Verifica HTTP fallita."); process.exitCode=1; });

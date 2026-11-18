"use client";
import { requestId } from "@/lib/client/request-id";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import type {LiveMatch,ResultCorrection,ResultScreen} from "@/types/live-match";
export function ResultsManager({initial}:{initial:ResultScreen}){
  const router=useRouter();const [matches,setMatches]=useState(initial.matches);const [selected,setSelected]=useState<LiveMatch|null>(null);
  const [goals,setGoals]=useState<Record<string,number>>({});const [removing,setRemoving]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState("");
  const [pending,setPending]=useState<{matchId:string;body:ResultCorrection}|null>(null);const busy=useRef(false);
  const name=(id:string)=>initial.players.find((p)=>p.id===id)?.displayName??id;
  const score=(game:LiveMatch)=>[(game.goals[game.home.strikerId]??0)+(game.goals[game.home.defenderId]??0),(game.goals[game.away.strikerId]??0)+(game.goals[game.away.defenderId]??0)];
  async function save(){
    if(!selected||busy.current)return;busy.current=true;setSaving(true);setError("");
    try{
      const request=pending??{matchId:selected.id,body:{kind:removing?"delete" as const:"edit" as const,mutationId:requestId(),version:selected.version,...(!removing?{goals}:{})}};setPending(request);
      const response=await fetch(`/api/results/${request.matchId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(request.body),signal:AbortSignal.timeout(20000)});const body=await response.json();
      if(!response.ok){if(response.status<500)setPending(null);throw new Error(body.error??"Salvataggio non riuscito.");}
      const refreshed=await fetch("/api/results",{cache:"no-store"});if(!refreshed.ok)throw new Error("Correzione salvata. Riprova per aggiornare lo storico.");
      setMatches((await refreshed.json()).matches);setSelected(null);setPending(null);router.refresh();
    }catch(problem){setError(problem instanceof Error?problem.message:"Salvataggio non riuscito. Riprova.");}
    finally{busy.current=false;setSaving(false);}
  }
  return <div className="space-y-4"><section className="panel space-y-3 p-4 sm:p-6"><h1 className="text-4xl text-gold">Arbitro · Risultati</h1><p className="text-sm text-text-muted">Correggi o rimuovi un risultato. Gli ELO delle partite successive vengono ricalcolati automaticamente.</p><Link href="/partita" className="inline-block rounded-xl bg-accent px-4 py-3 font-bold text-white">Vai alla partita live</Link></section>
    {error&&<p role="alert" className="panel p-4">{error}</p>}
    {selected?<section className="panel space-y-4 p-4 sm:p-6"><h2 className="text-3xl text-gold">{removing?"Elimina risultato":"Correggi risultato"}</h2><p className="text-sm text-text-muted">{removing?"La partita verrà esclusa dalle classifiche e dall’ELO. Rimarrà conservata nello storico delle correzioni.":"I gol restano attribuiti ai partecipanti originali. Non sono ammessi pareggi."}</p>
      <div className="grid gap-4 sm:grid-cols-2">{[{label:"Squadra A",ids:[selected.home.strikerId,selected.home.defenderId]},{label:"Squadra B",ids:[selected.away.strikerId,selected.away.defenderId]}].map((team)=><fieldset key={team.label} disabled={saving||!!pending||removing} className="space-y-3 rounded-xl bg-panel-soft p-4"><legend className="px-2 text-xl">{team.label}</legend>{team.ids.map((id)=><label key={id} className="block text-sm">{name(id)}<input aria-label={`Gol ${name(id)}`} type="number" min={0} max={2147483647} step={1} value={goals[id]??0} onChange={(event)=>setGoals((current)=>({...current,[id]:Number(event.target.value)}))} className="mt-2 block w-full rounded-xl border border-white/15 bg-panel px-3 py-3"/></label>)}</fieldset>)}</div>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={()=>void save()} className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-40">{saving?"Salvataggio…":pending?"Riprova salvataggio":removing?"Conferma eliminazione":"Conferma correzione"}</button><button type="button" disabled={saving||!!pending} onClick={()=>{setSelected(null);setError("");}} className="rounded-xl border border-white/15 px-5 py-3 disabled:opacity-40">Indietro</button></div></section>:<div className="space-y-3">{matches.map((game)=><article key={game.id} data-match-id={game.id} className="panel space-y-3 p-4"><p className="text-xs text-text-muted">{game.ratingPolicy==="baseline"?"Storico torneo":"Partita ufficiale"}{game.completedAt?` · ${new Date(game.completedAt).toLocaleDateString("it-IT",{timeZone:"Europe/Zurich"})}`:""}</p><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><p className="text-sm">{name(game.home.strikerId)}<br/>{name(game.home.defenderId)}</p><strong className="whitespace-nowrap text-2xl text-gold">{score(game).join(" – ")}</strong><p className="text-right text-sm">{name(game.away.strikerId)}<br/>{name(game.away.defenderId)}</p></div><div className="flex gap-3"><button type="button" onClick={()=>{setSelected(game);setGoals({...game.goals});setRemoving(false);setError("");}} className="rounded-xl border border-white/15 px-4 py-2">Correggi</button><button type="button" onClick={()=>{setSelected(game);setGoals({...game.goals});setRemoving(true);setError("");}} className="rounded-xl border border-red-400/40 px-4 py-2 text-red-300">Elimina</button></div></article>)}{!matches.length&&<p className="panel p-4">Nessun risultato ufficiale.</p>}</div>}
  </div>;
}

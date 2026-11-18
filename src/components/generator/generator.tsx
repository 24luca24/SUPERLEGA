"use client";
import { requestId } from "@/lib/client/request-id";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateBalancedPairing, proposalKey } from "@/lib/domain/pairings";
import type { PairingResult, Player } from "@/types/domain";
export function MatchGenerator({players,partners,canControl}:{players:Player[];partners:Record<string,string>;canControl:boolean}) {
  const router=useRouter();
  const feedback=useRef<HTMLDivElement>(null);
  const busy=useRef(false);
  const [present,setPresent]=useState<string[]>([]);
  const [result,setResult]=useState<PairingResult|null>(null);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [pending,setPending]=useState<{id:string;home:{strikerId:string;defenderId:string};away:{strikerId:string;defenderId:string}}|null>(null);
  const roster=players.filter((p)=>p.active).sort((a,b)=>a.animal.localeCompare(b.animal,"it"));
  const name=(id:string)=>players.find((p)=>p.id===id)?.displayName??id;
  const elo=(value:number)=>value.toLocaleString("it-IT",{maximumFractionDigits:1,minimumFractionDigits:1});
  useEffect(()=>{
    if(!result&&!error)return;
    feedback.current?.scrollIntoView({behavior:"smooth",block:"start"});
    feedback.current?.focus({preventScroll:true});
  },[result,error]);
  function change(ids:string[]) {setPresent(ids);setResult(null);setError("");setPending(null);}
  function generate() {
    try {
      const seed=crypto.getRandomValues(new Uint32Array(1))[0];
      setResult(generateBalancedPairing(roster.filter((p)=>present.includes(p.id)),{seed,tolerance:5,topN:8,lastPartnerByPlayer:partners,previousProposalKey:result?.ok?proposalKey(result.best):undefined}));
      setError("");setPending(null);
    }catch(problem){setError(problem instanceof Error?problem.message:"Generazione non riuscita. Riprova.");}
  }
  async function start() {
    if(!result?.ok || busy.current || !canControl)return;
    busy.current=true;setSaving(true);setError("");
    try {
      const input=pending??{id:requestId(),home:result.best.home,away:result.best.away};
      setPending(input);
      const response=await fetch("/api/matches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...input,fromGenerator:true}),signal:AbortSignal.timeout(12000)});
      const body=await response.json();
      if(!response.ok) {if(response.status<500)setPending(null);throw new Error(body.error??"Avvio non riuscito.");}
      const createdId=body.match?.id;
      if(!createdId)throw new Error("Il server non ha restituito la partita. Riprova l’avvio.");
      router.push(`/partita?match=${encodeURIComponent(createdId)}`);
    } catch(problem) {setError(problem instanceof Error?problem.message:"Avvio non riuscito. Riprova.");}
    finally {busy.current=false;setSaving(false);}
  }
  return <div className="space-y-4">
    <section className="panel space-y-4 p-4 sm:p-6"><h1 className="text-4xl text-gold">Generatore bilanciato</h1><p className="text-sm text-text-muted">Seleziona chi è presente. Ogni squadra ha un attaccante e un difensore; nessuno ripete il compagno della propria ultima partita.</p>
      <div className="flex flex-wrap gap-3"><button disabled={saving||!!pending} type="button" onClick={()=>change(roster.map((p)=>p.id))} className="rounded-xl border border-white/15 px-4 py-2 disabled:opacity-40">Seleziona tutti</button><button disabled={saving||!!pending} type="button" onClick={()=>change([])} className="rounded-xl border border-white/15 px-4 py-2 disabled:opacity-40">Azzera</button><span className="self-center text-sm text-text-muted">{present.length} presenti</span></div>
      <div className="grid gap-2 sm:grid-cols-2">{roster.map((player)=><label key={player.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-panel-soft p-3"><input type="checkbox" checked={present.includes(player.id)} disabled={saving||!!pending} onChange={(event)=>change(event.target.checked?[...present,player.id]:present.filter((id)=>id!==player.id))} className="h-5 w-5 accent-red-500"/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{player.displayName}</span><span className="text-xs text-text-muted">{player.role==="striker"?"Attaccante":"Difensore"} · {elo(player.currentElo)} ELO</span></span></label>)}</div>
      <button disabled={saving||!!pending} type="button" onClick={generate} className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-40">{result?.ok?"Rigenera":"Genera partita"}</button>
    </section>
    {(result||error)&&<div ref={feedback} tabIndex={-1} className="scroll-mt-4 space-y-4 outline-none">
    {error&&<p className="panel p-4" role="alert">{error}{pending&&<button type="button" disabled={saving} onClick={()=>void start()} className="ml-3 underline">Riprova avvio</button>}</p>}
    {result&&!result.ok&&<p className="panel p-4" role="alert">{result.error}</p>}
    {result?.ok&&<section className="panel space-y-4 p-4 sm:p-6"><h2 className="text-3xl text-gold">Proposta partita</h2><div className="grid gap-4 sm:grid-cols-2">{[{label:"Squadra A",team:result.best.home,elo:result.best.eloHome},{label:"Squadra B",team:result.best.away,elo:result.best.eloAway}].map((side)=><article key={side.label} className="space-y-2 rounded-xl bg-panel-soft p-4"><h3 className="text-xl">{side.label} · {elo(side.elo)} ELO</h3><p className="text-sm">{name(side.team.strikerId)} <span className="text-text-muted">· ATT</span></p><p className="text-sm">{name(side.team.defenderId)} <span className="text-text-muted">· DIF</span></p></article>)}</div><p>Differenza: <strong>{elo(result.best.eloGap)} ELO</strong></p><p className="text-xs text-text-muted">ELO squadra = somma dei due ELO individuali. Sorteggio fra abbinamenti entro 5 punti dal miglior equilibrio consentito.</p>{result.availableAlternatives===1&&<p className="text-sm text-text-muted">È l’unico abbinamento che rispetta il cambio compagno.</p>}{canControl?<button type="button" disabled={saving} onClick={()=>void start()} className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-40">{saving?"Avvio…":"Avvia partita"}</button>:<p className="text-sm text-text-muted">L’arbitro Roberto può avviare la partita e segnare i gol. <Link href="/partita" className="underline">Segui la partita live</Link></p>}</section>}
    </div>}
  </div>;
}

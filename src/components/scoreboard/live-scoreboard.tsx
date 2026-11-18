"use client";
import { requestId } from "@/lib/client/request-id";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, RotateCcw, Check, LoaderCircle } from "lucide-react";
import { computeMatchEloDeltas } from "@/lib/domain/elo";
import type { Player, PlayerEloDelta, Role } from "@/types/domain";
import type { LiveMatch, LiveMatchAction, MatchScreen } from "@/types/live-match";

interface PendingSave { url: string; method: "POST" | "PATCH"; body: object }
const formatElo = (value: number) => value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const slots = [
  { key: "homeStriker", team: "A", role: "striker" },
  { key: "homeDefender", team: "A", role: "defender" },
  { key: "awayStriker", team: "B", role: "striker" },
  { key: "awayDefender", team: "B", role: "defender" },
] as const;

export function LiveScoreboard({ initial }: { initial: MatchScreen }) {
  const router = useRouter();
  const canControl = initial.canControl;
  const [match, setMatch] = useState<LiveMatch | null>(initial.match);
  const [players, setPlayers] = useState<Player[]>(initial.players);
  const [stage, setStage] = useState<"empty" | "setup" | "live" | "review" | "cancel" | "saved">(initial.match ? "live" : "empty");
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [retry, setRetry] = useState<PendingSave | null>(null);
  const busy = useRef(false);
  const operationRevision = useRef(0);
  const createId = useRef<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const find = (id: string) => players.find((player) => player.id === id);
  useEffect(() => {
    if (canControl && (retry || !["empty", "live"].includes(stage))) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    let failures = 0;
    async function poll() {
      if (!active) return;
      if (document.visibilityState === "visible" && !busy.current) {
        const revision = operationRevision.current;
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 10000);
        try {
          const response = await fetch("/api/matches", {cache:"no-store", signal:controller.signal});
          if (response.status === 401) { router.replace("/login"); return; }
          if (!response.ok) throw new Error("Live temporaneamente disconnesso. Riconnessione automatica…");
          const screen: MatchScreen = await response.json();
          if (active && !busy.current && revision === operationRevision.current) {
            failures = 0; setSyncError("");
            setPlayers(screen.players); setMatch(screen.match); setStage(screen.match ? "live" : "empty");
          }
        } catch {
          if (active) { failures++; setSyncError("Live temporaneamente disconnesso. Riconnessione automatica…"); }
        } finally { clearTimeout(timeout); }
      }
      // Schedule after completion: slow requests never accumulate on mobile.
      if (active) timer = setTimeout(() => void poll(), Math.min(15000, 3000 * (1 + failures)) + Math.random() * 500);
    }
    timer = setTimeout(() => void poll(), Math.random() * 500);
    return () => {active=false;clearTimeout(timer);controller?.abort();};
  }, [canControl, stage, retry, router]);

  async function save(request: PendingSave) {
    if (busy.current) return;
    operationRevision.current++;
    busy.current = true;
    setSaving(true); setError("");
    try {
      // Reuse the UUID after a timeout: a committed goal must never be counted twice.
      let response: Response | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch(request.url, { method: request.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body), signal: AbortSignal.timeout(12000) });
          if (response.status < 500) break;
        } catch { /* The same request can safely be retried. */ }
      }
      if (!response || response.status >= 500) throw new Error("Connessione interrotta. Riprova il salvataggio prima di continuare.");
      const result: { match?: LiveMatch; error?: string } = await response.json();
      if (response.status === 401) { router.push("/login"); return; }
      setRetry(null);
      if (result.match) {
        setMatch(result.match);
        setStage(result.match.status === "completed" ? "saved" : result.match.status === "cancelled" ? "empty" : "live");
        if (result.match.status === "cancelled") setMatch(null);
      }
      if (!response.ok) { setError(result.error ?? "Operazione non riuscita."); return; }
      if (result.match?.status === "completed") router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Salvataggio non riuscito.");
      setRetry(request);
    } finally { busy.current = false; setSaving(false); }
  }
  function action(kind: LiveMatchAction["kind"], playerId?: string, delta?: 1 | -1) {
    if (!canControl || !match || retry || busy.current) return;
    try { void save({ url: `/api/matches/${match.id}`, method: "PATCH", body: { kind, playerId, delta, mutationId: requestId(), version: match.version } }); }
    catch(problem) {setError(problem instanceof Error?problem.message:"Azione non riuscita. Riprova.");}
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (retry || busy.current) return;
    try {
      createId.current ??= requestId();
      void save({ url: "/api/matches", method: "POST", body: { id: createId.current, home: { strikerId: selection.homeStriker, defenderId: selection.homeDefender }, away: { strikerId: selection.awayStriker, defenderId: selection.awayDefender } } });
    }catch(problem){setError(problem instanceof Error?problem.message:"Creazione non riuscita. Riprova.");}
  }
  async function beginSetup() {
    if (busy.current) return;
    operationRevision.current++;
    busy.current = true; setRefreshing(true); setError("");
    try {
      const response = await fetch("/api/matches", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) throw new Error("Impossibile caricare il roster. Riprova.");
      const screen: MatchScreen = await response.json();
      setPlayers(screen.players); setMatch(screen.match);
      setSelection({}); createId.current = null;
      setStage(screen.match ? "live" : "setup");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Impossibile caricare il roster."); }
    finally { busy.current = false; setRefreshing(false); }
  }

  const locked = saving || !!retry;
  const homeTotal = match ? (match.goals[match.home.strikerId] ?? 0) + (match.goals[match.home.defenderId] ?? 0) : 0;
  const awayTotal = match ? (match.goals[match.away.strikerId] ?? 0) + (match.goals[match.away.defenderId] ?? 0) : 0;
  const tied = homeTotal === awayTotal;
  const banner = (error || syncError) && <div className="panel space-y-3 border-red-400/50 p-4" role="alert"><p>{error || syncError}</p>{retry && <button type="button" disabled={saving} onClick={() => void save(retry)} className="rounded-xl bg-accent px-4 py-3 font-bold disabled:opacity-50">Riprova salvataggio</button>}</div>;

  if (stage === "empty" && !canControl) return <div className="space-y-4">{banner}<section className="panel p-6"><h1 className="text-4xl text-gold">Partita live</h1><p className="mt-3 text-text-muted">Nessuna partita in corso. La segnatura è riservata all’arbitro Roberto.</p></section></div>;
  if (stage === "empty") return <div className="space-y-4">{banner}<div className="flex min-h-64 items-center justify-center"><h1 className="sr-only">Partita live</h1><button type="button" disabled={refreshing} onClick={() => void beginSetup()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-4 text-lg font-bold text-white disabled:opacity-50">{refreshing ? <LoaderCircle className="animate-spin" size={22} /> : <Plus size={22} />}Crea partita</button></div></div>;

  if (stage === "setup") return <div className="space-y-4">
    {banner}
    <form onSubmit={create} className="panel space-y-5 p-4 sm:p-6">
      <h1 className="text-4xl text-gold">Crea partita</h1>
      <p className="text-sm text-text-muted">Scegli un attaccante e un difensore per squadra.</p>
      <div className="grid gap-5 sm:grid-cols-2">{(["A", "B"] as const).map((team) => <fieldset key={team} disabled={locked} className="space-y-4 rounded-xl bg-panel-soft p-4">
        <legend className="px-2 text-xl font-bold">Squadra {team}</legend>
        {slots.filter((slot) => slot.team === team).map((slot) => <label key={slot.key} className="block text-sm">
          {slot.role === "striker" ? "Attaccante" : "Difensore"}
          <select aria-label={`${slot.role === "striker" ? "Attaccante" : "Difensore"} squadra ${team}`} required value={selection[slot.key] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [slot.key]: event.target.value }))} className="mt-2 w-full min-w-0 rounded-xl border border-white/15 bg-panel px-3 py-3 text-text-primary">
            <option value="">Seleziona giocatore</option>
            {players.filter((player) => player.active && player.role === (slot.role as Role)).map((player) => <option key={player.id} value={player.id} disabled={Object.entries(selection).some(([key, value]) => key !== slot.key && value === player.id)}>{player.displayName}</option>)}
          </select>
        </label>)}
      </fieldset>)}</div>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={locked || slots.some((slot) => !selection[slot.key])} className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-40">{saving ? "Creazione…" : "Inizia partita"}</button><button type="button" disabled={locked} onClick={() => { setStage("empty"); setError(""); }} className="rounded-xl border border-white/15 px-5 py-3">Indietro</button></div>
    </form>
  </div>;

  if (!match) return banner;
  const teams = [{ label: "Squadra A", ids: [match.home.strikerId, match.home.defenderId] }, { label: "Squadra B", ids: [match.away.strikerId, match.away.defenderId] }];
  let preview: PlayerEloDelta[] = [];
  if (!tied && stage === "review") preview = computeMatchEloDeltas(match, players);
  const displayedDeltas = stage === "saved" ? match.eloDeltas : preview;

  return <div className="space-y-4">
    {banner}
    {canControl ? <Link href="/arbitro" className="inline-block text-sm text-text-muted underline">Gestisci risultati</Link> : <p className="text-sm text-text-muted">Segna l’arbitro Roberto · Aggiornamento automatico</p>}
    <section className="panel p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h1 className="text-4xl text-gold">{stage === "saved" ? "Risultato salvato" : stage === "review" ? "Riepilogo partita" : "Partita live"}</h1><span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-text-muted">{saving ? <><LoaderCircle size={14} className="animate-spin" />Salvataggio…</> : retry ? "Salvataggio da riprovare" : <><Check size={14} />Salvato</>}</span></div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center" aria-label={`Squadra A ${homeTotal}, Squadra B ${awayTotal}`}>
        <div><p className="text-sm text-text-muted">SQUADRA A</p><strong className="text-6xl text-gold sm:text-7xl">{homeTotal}</strong></div><span className="text-3xl text-text-muted">–</span><div><p className="text-sm text-text-muted">SQUADRA B</p><strong className="text-6xl text-gold sm:text-7xl">{awayTotal}</strong></div>
      </div>
      {stage === "live" && <div className="mt-6 grid gap-4 sm:grid-cols-2">{teams.map((team) => <section key={team.label} aria-label={team.label} className="space-y-3"><h2 className="text-xl">{team.label}</h2>{team.ids.map((id, index) => <article key={id} className="rounded-xl bg-panel-soft p-4"><p className="text-xs text-text-muted">{index === 0 ? "Attaccante" : "Difensore"}</p><h3 className="mb-4 mt-1 text-lg font-semibold">{find(id)?.displayName}</h3><div className="flex items-center justify-between gap-3">{canControl && <button type="button" aria-label={`Togli un gol a ${find(id)?.animal}`} disabled={locked || match.goals[id] === 0} onClick={() => action("goal", id, -1)} className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/15 disabled:opacity-30"><Minus size={24} /></button>}<strong className="text-4xl tabular-nums" aria-live="polite">{match.goals[id]}</strong>{canControl && <button type="button" aria-label={`Aggiungi un gol a ${find(id)?.animal}`} disabled={locked} onClick={() => action("goal", id, 1)} className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-white disabled:opacity-40"><Plus size={24} /></button>}</div></article>)}</section>)}</div>}
      {(stage === "review" || stage === "saved") && <div className="mt-6 space-y-4"><p className="text-lg font-bold">Vince la squadra {homeTotal > awayTotal ? "A" : "B"}</p>{teams.map((team) => <section key={team.label}><h2 className="text-xl text-gold">{team.label}</h2>{team.ids.map((id) => {
        const delta = displayedDeltas.find((item) => item.playerId === id);
        return <div key={id} className="mt-2 flex flex-wrap justify-between gap-2 rounded-xl bg-panel-soft p-3"><span>{find(id)?.displayName} · {match.goals[id]} gol</span>{delta && <span className="tabular-nums">ELO {formatElo(delta.eloBefore)} → {formatElo(delta.eloAfter)} <strong className={delta.actualDelta >= 0 ? "text-green-400" : "text-red-400"}>({delta.actualDelta >= 0 ? "+" : ""}{formatElo(delta.actualDelta)})</strong></span>}</div>;
      })}</section>)}{stage === "review" && <p className="text-xs text-text-muted">Le variazioni ELO sono una stima: il salvataggio usa i punteggi aggiornati al momento della conferma.</p>}</div>}
      {stage === "live" && canControl && <div className="mt-6 space-y-3"><div className="flex flex-wrap gap-3"><button type="button" disabled={locked || !match.canUndo} onClick={() => action("undo")} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 disabled:opacity-30"><RotateCcw size={18} />Annulla ultima azione</button><button type="button" disabled={locked || tied} onClick={() => setStage("review")} className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-40">Termina partita</button></div>{tied && <p className="text-sm text-text-muted">Per terminare serve un vincitore: il pareggio non è ammesso.</p>}<button type="button" disabled={locked} onClick={() => setStage("cancel")} className="py-2 text-sm text-text-muted underline disabled:opacity-30">Annulla partita</button></div>}
      {stage === "review" && <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={locked} onClick={() => action("finalize")} className="rounded-xl bg-accent px-5 py-3 font-bold text-white disabled:opacity-40">{saving ? "Salvataggio risultato…" : "Conferma risultato"}</button><button type="button" disabled={locked} onClick={() => setStage("live")} className="rounded-xl border border-white/15 px-5 py-3">Riprendi partita</button></div>}
      {stage === "cancel" && <div className="mt-6 space-y-3"><p>Annullare questa partita? Non entrerà nelle classifiche.</p><div className="flex flex-wrap gap-3"><button type="button" disabled={locked} onClick={() => action("cancel")} className="rounded-xl bg-accent px-5 py-3 font-bold">Sì, annulla partita</button><button type="button" disabled={locked} onClick={() => setStage("live")} className="rounded-xl border border-white/15 px-5 py-3">Continua a giocare</button></div></div>}
      {stage === "saved" && <div className="mt-6 flex flex-wrap gap-3"><Link href="/classifica" className="rounded-xl border border-white/15 px-5 py-3">Vedi classifica</Link><button type="button" onClick={() => { setMatch(null); setStage("empty"); setError(""); }} className="rounded-xl bg-accent px-5 py-3 font-bold text-white">Nuova partita</button></div>}
    </section>
  </div>;
}

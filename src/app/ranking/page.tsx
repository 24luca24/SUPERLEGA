import Link from "next/link";
import { Suspense } from "react";
import { loadTournament } from "@/lib/server/tournament";
import { buildIndividualStandings } from "@/lib/domain/standings";
import { RankingBarChart } from "@/components/ranking/ranking-bar-chart";

async function Ranking({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { players, matches } = await loadTournament();
  const params = await searchParams;
  const mode = params.mode === "goals" ? "goals" : "elo";
  const standings = buildIndividualStandings(matches, players);
  const names = new Map(players.map((player) => [player.id, player.animal]));
  const value = (row: typeof standings[number]) => mode === "elo" ? row.elo : row.goalsFor;
  const values = standings.map(value);
  const maximumValue = Math.max(mode === "elo" ? 100 : 1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(maximumValue));
  const increment = magnitude / 2;
  const maximum = Math.ceil(maximumValue / increment) * increment;
  const minimum = Math.min(0, Math.floor(Math.min(0, ...values) / increment) * increment);

  return <div className="space-y-5">
    <section className="panel flex flex-wrap items-end justify-between gap-4 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Superlega · {matches.length} partite concluse</p>
        <h1 className="mt-1 text-4xl text-gold">Ranking individuale</h1>
        <p className="mt-2 text-sm text-text-muted">Un punteggio per giocatore, due ruoli a confronto.</p>
      </div>
      <nav aria-label="Metrica del ranking" className="flex gap-2 rounded-xl bg-panel-soft p-1">
        {([['elo', 'ELO'], ['goals', 'Gol']] as const).map(([key, label]) => <Link key={key} href={`/ranking?mode=${key}`} prefetch={true} aria-current={mode === key ? "page" : undefined} className={`rounded-lg px-5 py-2 text-sm font-semibold ${mode === key ? "bg-accent text-white" : "text-text-muted hover:text-white"}`}>{label}</Link>)}
      </nav>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      {(["striker", "defender"] as const).map((role) => {
        const title = role === "striker" ? "Attaccanti" : "Difensori";
        const ranked = standings.filter((row) => row.role === role).sort((a, b) => value(b) - value(a) || a.displayName.localeCompare(b.displayName, "it"));
        return <section key={role} className="panel min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-3xl text-gold">{title}</h2>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-text-muted">{ranked.length} giocatori · {mode === "elo" ? "ELO" : "Gol"}</span>
          </div>
          <RankingBarChart title={`${title}: ranking per ${mode === "elo" ? "ELO" : "gol"}`} rows={ranked.map((row) => ({ id: row.playerId, label: names.get(row.playerId) ?? row.displayName, value: value(row), description: `${row.displayName}, ${row.matches} partite` }))} minimum={minimum} maximum={maximum} unit={mode === "elo" ? "ELO" : "gol"} />
          <details className="mt-4 border-t border-white/10 pt-3">
            <summary className="cursor-pointer text-sm text-text-muted">Statistiche dei giocatori</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Statistiche {title.toLocaleLowerCase("it")}</caption>
                <thead className="text-text-muted"><tr><th scope="col" className="py-2 pr-3">Giocatore</th><th scope="col" className="pr-3">Partite</th><th scope="col" className="pr-3">Gol</th><th scope="col" className="pr-3">Media gol</th>{role === "defender" && <><th scope="col" className="pr-3">Subiti</th><th scope="col">Media subiti</th></>}</tr></thead>
                <tbody>{ranked.map((row) => <tr key={row.playerId} className="border-t border-white/5"><th scope="row" className="py-3 pr-3 font-medium">{names.get(row.playerId) ?? row.displayName}</th><td>{row.matches}</td><td>{row.goalsFor}</td><td>{(row.matches ? row.goalsFor / row.matches : 0).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>{role === "defender" && <><td>{row.goalsAgainst}</td><td>{(row.matches ? row.goalsAgainst / row.matches : 0).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td></>}</tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>;
      })}
    </div>
    <details className="panel p-4"><summary className="cursor-pointer">Come funziona l’ELO?</summary><p className="mt-3 text-sm leading-6 text-text-muted">Si parte da 100, con minimo zero. Le partite storiche dell’Excel costruiscono la base ELO con prestazione e risultato, senza scambi sfida. Le nuove partite partono da questa base e applicano anche le sfide per ruolo. Attaccanti: +1 per gol e −0,5 sotto 4 gol. Difensori: +2 per gol, −0,3 per gol subito dalla squadra e +0,5 se i subiti sono meno di 4. Vittoria +2, sconfitta −2. Solo per le nuove partite si aggiunge la sfida con l’avversario dello stesso ruolo: ±5 con gap sotto 10, ±10 con gap da 10 a meno di 20, ±20 da 20 in su. Il gap usa gli ELO prima della partita. Non sono ammessi pareggi: il risultato può essere confermato soltanto con un vincitore.</p></details>
  </div>;
}

export default function RankingPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<div className="panel p-6" role="status">Caricamento ranking…</div>}><Ranking {...props} /></Suspense>;
}

import { buildIndividualStandings, buildPairStandings } from "@/lib/domain/standings";
import { loadTournament } from "@/lib/server/tournament";
import { Suspense } from "react";

async function Standings() {
  const {matches,players}=await loadTournament();
  const names=new Map(players.map((p)=>[p.id,p.displayName]));
  const pairRows = buildPairStandings(matches);
  const individualRows = buildIndividualStandings(matches, players);

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h1 className="text-4xl text-gold">Classifica coppie</h1>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr>
                <th>#</th>
                <th>Coppia</th>
                <th>Pt</th>
                <th>V</th>
                <th>P</th>
                <th>GF</th>
                <th>GS</th>
                <th>DR</th>
              </tr>
            </thead>
            <tbody>
              {pairRows.map((row, index) => (
                <tr key={row.key} className="border-t border-white/8">
                  <td className="py-2">{index + 1}</td>
                  <td>{row.members.map((id)=>names.get(id)??id).join(" + ")}</td>
                  <td>{row.points}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td>{row.goalDifference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-4xl text-gold">Classifica individuale</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-text-muted">
              <tr>
                <th>#</th>
                <th>Giocatore</th>
                <th>Ruolo</th>
                <th>P</th>
                <th>V</th>
                <th>S</th>
                <th>Gol</th>
                <th>ELO</th>
              </tr>
            </thead>
            <tbody>
              {individualRows.map((row, index) => (
                <tr key={row.playerId} className="border-t border-white/8">
                  <td className="py-2">{index + 1}</td>
                  <td>{row.displayName}</td>
                  <td>{row.role === "striker" ? "Attaccante" : "Difensore"}</td>
                  <td>{row.matches}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.elo.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function ClassificaPage() {
  return <Suspense fallback={<p>Caricamento classifiche…</p>}><Standings /></Suspense>;
}

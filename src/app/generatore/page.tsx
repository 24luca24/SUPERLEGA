import { Suspense } from "react";
import { currentUser } from "@/lib/server/auth";
import { loadTournament } from "@/lib/server/tournament";
import { lastPartnersFromMatches } from "@/lib/domain/pairings";
import { MatchGenerator } from "@/components/generator/generator";
async function GeneratorContent() {
  const {players,matches}=await loadTournament();
  const user=await currentUser();
  return <MatchGenerator players={players} partners={lastPartnersFromMatches(matches)} canControl={!!user?.is_admin&&user.username.toLocaleLowerCase("it")==="roberto"}/>;
}
export default function GeneratorePage() {return <Suspense fallback={<p role="status">Caricamento generatore…</p>}><GeneratorContent/></Suspense>;}

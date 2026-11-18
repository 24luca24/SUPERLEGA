import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { getMatchScreen } from "@/lib/server/match-store";
import { LiveScoreboard } from "@/components/scoreboard/live-scoreboard";
type MatchPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
async function MatchPageContent({ searchParams }: MatchPageProps) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const key = typeof params.match === "string" ? params.match : "manual";
  return <LiveScoreboard key={key} initial={await getMatchScreen(user)} />;
}
export default function PartitaPage(props: MatchPageProps) {
  return <Suspense fallback={<p role="status">Caricamento partita…</p>}><MatchPageContent {...props} /></Suspense>;
}

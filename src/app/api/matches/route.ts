import { NextResponse } from "next/server";
import { createLiveMatch, getMatchScreen, isUuid, MatchError } from "@/lib/server/match-store";
import { matchActor, matchBody, matchResponseError } from "@/lib/server/match-http";
export async function GET() {
  try { return NextResponse.json(await getMatchScreen(await matchActor()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return matchResponseError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await matchActor(request);
    const body = await matchBody(request);
    const home = body.home as Record<string, unknown> | undefined, away = body.away as Record<string, unknown> | undefined;
    if (!isUuid(body.id) || !isUuid(home?.strikerId) || !isUuid(home?.defenderId) || !isUuid(away?.strikerId) || !isUuid(away?.defenderId)) throw new MatchError(400, "Seleziona tutti e quattro i giocatori.");
    const match = await createLiveMatch(actor, { fromGenerator: body.fromGenerator === true, id: body.id, home: { strikerId: home.strikerId, defenderId: home.defenderId }, away: { strikerId: away.strikerId, defenderId: away.defenderId } });
    return NextResponse.json({ match }, { status: 201 });
  } catch (error) { return matchResponseError(error); }
}

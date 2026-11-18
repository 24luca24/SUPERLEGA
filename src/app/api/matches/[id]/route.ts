import { NextResponse } from "next/server";
import { changeLiveMatch, isUuid, MatchError } from "@/lib/server/match-store";
import { matchActor, matchBody, matchResponseError } from "@/lib/server/match-http";
import type { LiveMatchAction } from "@/types/live-match";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await matchActor(request);
    const { id } = await params;
    const body = await matchBody(request);
    if (!isUuid(body.mutationId) || typeof body.version !== "number" || !Number.isSafeInteger(body.version) || body.version < 0) throw new MatchError(400, "Azione non valida.");
    let action: LiveMatchAction;
    if (body.kind === "goal" && isUuid(body.playerId) && (body.delta === 1 || body.delta === -1)) action = { kind: "goal", playerId: body.playerId, delta: body.delta, mutationId: body.mutationId, version: body.version };
    else if (body.kind === "undo" || body.kind === "finalize" || body.kind === "cancel") action = { kind: body.kind, mutationId: body.mutationId, version: body.version };
    else throw new MatchError(400, "Azione non valida.");
    return NextResponse.json({ match: await changeLiveMatch(actor, id, action) });
  } catch (error) { return matchResponseError(error); }
}

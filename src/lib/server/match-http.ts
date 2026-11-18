import "server-only";
import { NextResponse } from "next/server";
import { currentUser, isSameOrigin } from "./auth";
import { MatchError } from "./match-store";
export async function matchActor(request?: Request) {
  if (request && !isSameOrigin(request)) throw new MatchError(403, "Origine non valida.");
  const user = await currentUser();
  if (!user) throw new MatchError(401, "Accedi per gestire la partita.");
  return user;
}
export async function matchBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 4096) throw new MatchError(400, "Richiesta troppo grande.");
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new MatchError(400, "Dati della partita non validi."); }
}
export function matchResponseError(error: unknown) {
  if (error instanceof MatchError) return NextResponse.json({ error: error.message, match: error.match }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Match request failed", { code: (error as { code?: string })?.code ?? "unknown", type: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: "Connessione temporaneamente non disponibile. Riprova: la partita resta recuperabile." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3" } });
}

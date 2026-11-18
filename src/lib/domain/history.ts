import { computeMatchEloDeltas } from "./elo";
import { SUPERLEGA_ELO_CONFIG } from "./trophies";
import type { MatchRecord, Player, PlayerEloDelta } from "@/types/domain";

export type HistoricalMatch = MatchRecord & { historyOrder?: number };
export type HistoricalEvent = PlayerEloDelta & { matchId: string; opponentId: string; challengeGapBefore: number };

export function validateHistoricalMatch(match: MatchRecord, players: Player[]) {
  if (match.ratingPolicy !== undefined && !["baseline", "standard"].includes(match.ratingPolicy)) throw new Error("Regolamento ELO non valido.");
  const ids = [match.home.strikerId, match.home.defenderId, match.away.strikerId, match.away.defenderId];
  if (new Set(ids).size !== 4) throw new Error("Partecipanti duplicati.");
  const roles = ["striker", "defender", "striker", "defender"];
  ids.forEach((id, index) => {
    if (players.find((p) => p.id === id)?.role !== roles[index]) throw new Error(`Ruolo mancante o errato: ${id}`);
    if (!Number.isSafeInteger(match.goals[id]) || match.goals[id] < 0) throw new Error(`Gol non validi: ${id}`);
  });
  if (Object.keys(match.goals).length !== 4) throw new Error("Sono richiesti quattro contatori.");
}

/** Imported matches use confirmed source order; subsequent matches use completion time + id. */
export function recalculateHistory(matches: HistoricalMatch[], roster: Player[]) {
  if (new Set(roster.map((p) => p.id)).size !== roster.length) throw new Error("Roster duplicato.");
  const players = roster.map((p) => ({ ...p, currentElo: SUPERLEGA_ELO_CONFIG.baseElo as number }));
  const official = matches.filter((m) => m.status === "completed");
  if (new Set(official.map((m) => m.id)).size !== official.length) throw new Error("Partita duplicata.");
  official.forEach((match) => {
    validateHistoricalMatch(match, players);
    if (match.historyOrder === undefined && (!match.completedAt || !Number.isFinite(Date.parse(match.completedAt)))) {
      throw new Error("Manca un ordine storico attendibile.");
    }
    if (match.historyOrder !== undefined && !Number.isSafeInteger(match.historyOrder)) throw new Error("Ordine storico non valido.");
  });
  official.sort((a, b) => {
    if (a.historyOrder !== undefined || b.historyOrder !== undefined) {
      if (a.historyOrder === undefined) return 1;
      if (b.historyOrder === undefined) return -1;
      return a.historyOrder - b.historyOrder || a.id.localeCompare(b.id);
    }
    return Date.parse(a.completedAt!) - Date.parse(b.completedAt!) || a.id.localeCompare(b.id);
  });
  const events: HistoricalEvent[] = [];
  for (const match of official) {
    const deltas = computeMatchEloDeltas(match, players);
    // Snapshot all opponents before updating any of the four ratings.
    for (const delta of deltas) {
      const opponentId = delta.playerId === match.home.strikerId ? match.away.strikerId
        : delta.playerId === match.away.strikerId ? match.home.strikerId
          : delta.playerId === match.home.defenderId ? match.away.defenderId : match.home.defenderId;
      const opponent = players.find((p) => p.id === opponentId)!;
      events.push({ ...delta, matchId: match.id, opponentId, challengeGapBefore: Math.abs(delta.eloBefore - opponent.currentElo) });
    }
    for (const delta of deltas) players.find((p) => p.id === delta.playerId)!.currentElo = delta.eloAfter;
  }
  return { players, events };
}

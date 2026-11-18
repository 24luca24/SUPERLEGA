import { computeMatchEloDeltas } from "@/lib/domain/elo";
import type { MatchRecord, MatchStatus, Player, TeamLineup } from "@/types/domain";

export interface DraftMatchInput {
  id: string;
  home: TeamLineup;
  away: TeamLineup;
  seasonId: string;
  scorekeeperId?: string;
}

export interface FinalizationResult {
  match: MatchRecord;
  deltas: ReturnType<typeof computeMatchEloDeltas>;
  idempotent: boolean;
}

function validStatus(status: MatchStatus): boolean {
  return status === "draft" || status === "live" || status === "completed";
}

export function createDraftMatch(input: DraftMatchInput): MatchRecord {
  const ids = [input.home.strikerId, input.home.defenderId, input.away.strikerId, input.away.defenderId];

  if (new Set(ids).size !== 4) {
    throw new Error("I quattro giocatori devono essere distinti.");
  }

  return {
    id: input.id,
    status: "draft",
    ratingPolicy: "standard",
    home: input.home,
    away: input.away,
    goals: {
      [input.home.strikerId]: 0,
      [input.home.defenderId]: 0,
      [input.away.strikerId]: 0,
      [input.away.defenderId]: 0,
    },
    createdAt: new Date().toISOString(),
    version: 0,
    seasonId: input.seasonId,
    scorekeeperId: input.scorekeeperId,
  };
}

export function applyGoalChange(match: MatchRecord, playerId: string, delta: 1 | -1): MatchRecord {
  if (!validStatus(match.status) || match.status === "completed") {
    throw new Error("La partita non e modificabile.");
  }

  const current = match.goals[playerId] ?? 0;
  const next = Math.max(0, current + delta);

  return {
    ...match,
    status: "live",
    goals: {
      ...match.goals,
      [playerId]: next,
    },
    version: match.version + 1,
  };
}

export function finalizeMatch(match: MatchRecord, players: Player[]): FinalizationResult {
  if (match.status === "completed") {
    return {
      match,
      deltas: [],
      idempotent: true,
    };
  }

  const completedMatch: MatchRecord = {
    ...match,
    status: "completed",
    completedAt: new Date().toISOString(),
    version: match.version + 1,
  };

  return {
    match: completedMatch,
    deltas: computeMatchEloDeltas(completedMatch, players),
    idempotent: false,
  };
}

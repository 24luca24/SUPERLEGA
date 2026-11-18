import { SUPERLEGA_ELO_CONFIG, challengePointsFromGap } from "./trophies";
import type { EloInput, MatchRecord, MatchResult, Player, PlayerEloDelta, RoleChallengeInput } from "@/types/domain";

function outcomeDelta(result: MatchResult): number {
  if (result === "win") {
    return SUPERLEGA_ELO_CONFIG.winBonus;
  }

  if (result === "loss") {
    return -SUPERLEGA_ELO_CONFIG.lossPenalty;
  }

  return 0;
}

export function eloPerformanceResultDelta(input: EloInput): number {
  const performance =
    input.role === "striker"
      ? input.goalsScored * SUPERLEGA_ELO_CONFIG.strikerGoalBonus -
        (input.goalsScored < 4 ? SUPERLEGA_ELO_CONFIG.strikerUnderFourPenalty : 0)
      : input.goalsScored * SUPERLEGA_ELO_CONFIG.defenderGoalBonus -
        input.teamGoalsConceded * SUPERLEGA_ELO_CONFIG.defenderConcededPenalty +
        (input.teamGoalsConceded < 4 ? SUPERLEGA_ELO_CONFIG.defenderUnderFourConcededBonus : 0);

  return performance + outcomeDelta(input.result);
}

export function roleChallengeDeltas(input: RoleChallengeInput): Record<string, number> {
  const gap = Math.abs(input.winnerEloBefore - input.loserEloBefore);
  const points = challengePointsFromGap(gap);

  return {
    [input.winnerRolePlayerId]: points,
    [input.loserRolePlayerId]: -points,
  };
}

export function clampElo(value: number): number {
  return Math.max(SUPERLEGA_ELO_CONFIG.minimumElo, value);
}

export function matchResultFromGoals(homeGoals: number, awayGoals: number): MatchResult {
  if (homeGoals > awayGoals) {
    return "win";
  }

  if (homeGoals < awayGoals) {
    return "loss";
  }

  throw new Error("Il pareggio non è ammesso: serve un vincitore.");
}

export function computeMatchEloDeltas(match: MatchRecord, players: Player[]): PlayerEloDelta[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  const homeIds = [match.home.strikerId, match.home.defenderId];
  const awayIds = [match.away.strikerId, match.away.defenderId];

  const homeGoals = homeIds.reduce((sum, id) => sum + (match.goals[id] ?? 0), 0);
  const awayGoals = awayIds.reduce((sum, id) => sum + (match.goals[id] ?? 0), 0);

  const homeResult = matchResultFromGoals(homeGoals, awayGoals);
  const awayResult = matchResultFromGoals(awayGoals, homeGoals);

  const challengeMap: Record<string, number> = {
    [match.home.strikerId]: 0,
    [match.home.defenderId]: 0,
    [match.away.strikerId]: 0,
    [match.away.defenderId]: 0,
  };

  if (match.ratingPolicy !== "baseline") {
    const homeWin = homeResult === "win";

    const strikerChallenge = roleChallengeDeltas({
      winnerRolePlayerId: homeWin ? match.home.strikerId : match.away.strikerId,
      loserRolePlayerId: homeWin ? match.away.strikerId : match.home.strikerId,
      winnerEloBefore: byId.get(homeWin ? match.home.strikerId : match.away.strikerId)?.currentElo ?? 0,
      loserEloBefore: byId.get(homeWin ? match.away.strikerId : match.home.strikerId)?.currentElo ?? 0,
    });

    const defenderChallenge = roleChallengeDeltas({
      winnerRolePlayerId: homeWin ? match.home.defenderId : match.away.defenderId,
      loserRolePlayerId: homeWin ? match.away.defenderId : match.home.defenderId,
      winnerEloBefore: byId.get(homeWin ? match.home.defenderId : match.away.defenderId)?.currentElo ?? 0,
      loserEloBefore: byId.get(homeWin ? match.away.defenderId : match.home.defenderId)?.currentElo ?? 0,
    });

    Object.entries({ ...strikerChallenge, ...defenderChallenge }).forEach(([playerId, delta]) => {
      challengeMap[playerId] = delta;
    });
  }

  const allIds = [...homeIds, ...awayIds];

  return allIds.map((playerId) => {
    const player = byId.get(playerId);

    if (!player) {
      throw new Error(`Giocatore non trovato: ${playerId}`);
    }

    const isHome = homeIds.includes(playerId);
    const goalsScored = match.goals[playerId] ?? 0;
    const conceded = isHome ? awayGoals : homeGoals;
    const result = isHome ? homeResult : awayResult;

    const performanceResultDelta = eloPerformanceResultDelta({
      role: player.role,
      goalsScored,
      teamGoalsConceded: conceded,
      result,
    });

    const challengeDelta = challengeMap[playerId] ?? 0;
    const totalRequestedDelta = performanceResultDelta + challengeDelta;
    const eloAfter = clampElo(player.currentElo + totalRequestedDelta);

    return {
      playerId,
      eloBefore: player.currentElo,
      performanceResultDelta,
      challengeDelta,
      totalRequestedDelta,
      eloAfter,
      actualDelta: eloAfter - player.currentElo,
    };
  });
}

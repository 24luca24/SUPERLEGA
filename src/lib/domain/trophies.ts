export const SUPERLEGA_ELO_CONFIG = {
  baseElo: 100,
  minimumElo: 0,
  strikerGoalBonus: 1,
  strikerUnderFourPenalty: 0.5,
  defenderGoalBonus: 2,
  defenderConcededPenalty: 0.3,
  defenderUnderFourConcededBonus: 0.5,
  winBonus: 2,
  lossPenalty: 2,
  challengeBands: {
    low: 5,
    medium: 10,
    high: 20,
  },
} as const;

export function challengePointsFromGap(gap: number): number {
  if (gap < 10) {
    return SUPERLEGA_ELO_CONFIG.challengeBands.low;
  }

  if (gap < 20) {
    return SUPERLEGA_ELO_CONFIG.challengeBands.medium;
  }

  return SUPERLEGA_ELO_CONFIG.challengeBands.high;
}

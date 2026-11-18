export type Role = "striker" | "defender";

export type MatchResult = "win" | "loss";

export type MatchStatus = "draft" | "live" | "completed" | "cancelled";

export interface Player {
  id: string;
  animal: string;
  city: string;
  displayName: string;
  role: Role;
  active: boolean;
  currentElo: number;
}

export interface TeamLineup {
  strikerId: string;
  defenderId: string;
}

export interface MatchGoals {
  [playerId: string]: number;
}

export type RatingPolicy = "baseline" | "standard";

export interface MatchRecord {
  historyOrder?: number;
  ratingPolicy?: RatingPolicy;
  id: string;
  status: MatchStatus;
  home: TeamLineup;
  away: TeamLineup;
  goals: MatchGoals;
  createdAt: string;
  completedAt?: string;
  version: number;
  scorekeeperId?: string;
  seasonId: string;
}

export interface EloInput {
  role: Role;
  goalsScored: number;
  teamGoalsConceded: number;
  result: MatchResult;
}

export interface RoleChallengeInput {
  winnerRolePlayerId: string;
  loserRolePlayerId: string;
  winnerEloBefore: number;
  loserEloBefore: number;
}

export interface PlayerEloDelta {
  playerId: string;
  eloBefore: number;
  performanceResultDelta: number;
  challengeDelta: number;
  totalRequestedDelta: number;
  eloAfter: number;
  actualDelta: number;
}

export interface PairingProposal {
  home: TeamLineup;
  away: TeamLineup;
  eloHome: number;
  eloAway: number;
  eloGap: number;
  cost: number;
}

export interface PairingOptions {
  tolerance: number;
  topN: number;
  seed: number;
  recentPairings?: string[];
  recentQuartets?: string[];
  lastPartnerByPlayer?: Record<string, string>;
  previousProposalKey?: string;
}

export interface PairingError {
  ok: false;
  error: string;
}

export interface PairingSuccess {
  ok: true;
  best: PairingProposal;
  candidates: PairingProposal[];
  availableAlternatives: number;
}

export type PairingResult = PairingError | PairingSuccess;

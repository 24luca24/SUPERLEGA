import type { MatchRecord, Player, PlayerEloDelta, TeamLineup } from "./domain";
export interface LiveMatch extends MatchRecord {
  canUndo: boolean;
  eloDeltas: PlayerEloDelta[];
}
export interface MatchScreen { players: Player[]; match: LiveMatch | null; canControl: boolean }
export interface CreateLiveMatch { fromGenerator?: boolean; id: string; home: TeamLineup; away: TeamLineup }
export type LiveMatchAction =
  | { kind: "goal"; playerId: string; delta: 1 | -1; mutationId: string; version: number }
  | { kind: "undo" | "finalize" | "cancel"; mutationId: string; version: number };
export interface ResultScreen { players: Player[]; matches: LiveMatch[] }
export interface ResultCorrection { kind: "edit" | "delete"; mutationId: string; version: number; goals?: Record<string,number> }

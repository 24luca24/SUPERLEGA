import { SUPERLEGA_ELO_CONFIG } from "@/lib/domain/trophies";
import type { MatchRecord, Player } from "@/types/domain";

export const mockPlayers: Player[] = [
  { id: "p1", animal: "Gorilla", city: "Gorla", displayName: "GORILLA DI GORLA", role: "striker", active: true, currentElo: 124.5 },
  { id: "p2", animal: "Gufo", city: "Lecco", displayName: "GUFO DI LECCO", role: "defender", active: true, currentElo: 119.7 },
  { id: "p3", animal: "Tigre", city: "Catania", displayName: "TIGRE DI CATANIA", role: "striker", active: true, currentElo: 112.2 },
  { id: "p4", animal: "Blatta", city: "Milano", displayName: "BLATTA DI MILANO", role: "defender", active: true, currentElo: 106.4 },
  { id: "p5", animal: "Falco", city: "Roma", displayName: "FALCO DI ROMA", role: "striker", active: true, currentElo: SUPERLEGA_ELO_CONFIG.baseElo },
  { id: "p6", animal: "Lince", city: "Bergamo", displayName: "LINCE DI BERGAMO", role: "defender", active: true, currentElo: SUPERLEGA_ELO_CONFIG.baseElo },
];

export const mockMatches: MatchRecord[] = [
  {
    id: "m1",
    status: "completed",
    home: { strikerId: "p1", defenderId: "p2" },
    away: { strikerId: "p3", defenderId: "p4" },
    goals: { p1: 4, p2: 2, p3: 3, p4: 1 },
    createdAt: "2026-10-01T10:00:00.000Z",
    completedAt: "2026-10-01T10:15:00.000Z",
    version: 3,
    seasonId: "s1",
  },
  {
    id: "m2",
    status: "completed",
    home: { strikerId: "p5", defenderId: "p6" },
    away: { strikerId: "p1", defenderId: "p2" },
    goals: { p5: 1, p6: 2, p1: 2, p2: 2 },
    createdAt: "2026-10-02T10:00:00.000Z",
    completedAt: "2026-10-02T10:12:00.000Z",
    version: 2,
    seasonId: "s1",
  },
];

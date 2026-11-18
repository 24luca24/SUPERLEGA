import { describe, expect, it } from "vitest";
import { computeMatchEloDeltas, eloPerformanceResultDelta } from "@/lib/domain/elo";
import { SUPERLEGA_ELO_CONFIG } from "@/lib/domain/trophies";
import type { MatchRecord, Player } from "@/types/domain";

describe("eloPerformanceResultDelta", () => {
  it("caso 1: attaccante 3 gol e vittoria = +4.5", () => {
    const delta = eloPerformanceResultDelta({
      role: "striker",
      goalsScored: 3,
      teamGoalsConceded: 2,
      result: "win",
    });

    expect(delta).toBe(4.5);
  });

  it("caso 2: attaccante 4 gol e sconfitta = +2", () => {
    const delta = eloPerformanceResultDelta({
      role: "striker",
      goalsScored: 4,
      teamGoalsConceded: 5,
      result: "loss",
    });

    expect(delta).toBe(2);
  });

  it("caso 3: difensore 1 gol, 3 subiti, vince = +3.6", () => {
    const delta = eloPerformanceResultDelta({
      role: "defender",
      goalsScored: 1,
      teamGoalsConceded: 3,
      result: "win",
    });

    expect(delta).toBeCloseTo(3.6, 6);
  });

  it("caso 4: difensore 0 gol, 4 subiti, perde = -3.2", () => {
    const delta = eloPerformanceResultDelta({
      role: "defender",
      goalsScored: 0,
      teamGoalsConceded: 4,
      result: "loss",
    });

    expect(delta).toBeCloseTo(-3.2, 6);
  });
});

describe("computeMatchEloDeltas", () => {
  const players: Player[] = [
    { id: "aS", animal: "A", city: "A", displayName: "A", role: "striker", active: true, currentElo: 120 },
    { id: "aD", animal: "B", city: "B", displayName: "B", role: "defender", active: true, currentElo: 100 },
    { id: "bS", animal: "C", city: "C", displayName: "C", role: "striker", active: true, currentElo: 115 },
    { id: "bD", animal: "D", city: "D", displayName: "D", role: "defender", active: true, currentElo: 76 },
  ];

  it("caso 5: totale 6-4 e gol subiti corretti ai difensori", () => {
    const match: MatchRecord = {
      id: "m1",
      status: "completed",
      home: { strikerId: "aS", defenderId: "aD" },
      away: { strikerId: "bS", defenderId: "bD" },
      goals: { aS: 4, aD: 2, bS: 3, bD: 1 },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      version: 1,
      seasonId: "s1",
    };

    const deltas = computeMatchEloDeltas(match, players);
    const aD = deltas.find((d) => d.playerId === "aD");
    const bD = deltas.find((d) => d.playerId === "bD");

    expect(aD?.performanceResultDelta).toBeCloseTo(4.8, 6);
    expect(bD?.performanceResultDelta).toBeCloseTo(-1.8, 6);
  });

  it("rifiuta una partita ufficiale in pareggio 0-0", () => {
    const match: MatchRecord = {
      id: "m2",
      status: "completed",
      home: { strikerId: "aS", defenderId: "aD" },
      away: { strikerId: "bS", defenderId: "bD" },
      goals: { aS: 0, aD: 0, bS: 0, bD: 0 },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      version: 1,
      seasonId: "s1",
    };

    expect(() => computeMatchEloDeltas(match, players)).toThrow(/pareggio/);
  });

  it("casi 12-13-16: bonus sfida per gap ruolo con base 100 e fasce 5/10/20", () => {
    const balancedPlayers: Player[] = players.map((player) => ({
      ...player,
      currentElo: SUPERLEGA_ELO_CONFIG.baseElo,
    }));
    balancedPlayers.find((p) => p.id === "aS")!.currentElo = 109.9;
    balancedPlayers.find((p) => p.id === "bS")!.currentElo = 100;
    balancedPlayers.find((p) => p.id === "aD")!.currentElo = 110;
    balancedPlayers.find((p) => p.id === "bD")!.currentElo = 90;

    const match: MatchRecord = {
      id: "m3",
      status: "completed",
      home: { strikerId: "aS", defenderId: "aD" },
      away: { strikerId: "bS", defenderId: "bD" },
      goals: { aS: 4, aD: 2, bS: 3, bD: 1 },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      version: 1,
      seasonId: "s1",
    };

    const deltas = computeMatchEloDeltas(match, balancedPlayers);

    expect(deltas.find((d) => d.playerId === "aS")?.challengeDelta).toBe(5);
    expect(deltas.find((d) => d.playerId === "bS")?.challengeDelta).toBe(-5);
    expect(deltas.find((d) => d.playerId === "aD")?.challengeDelta).toBe(20);
    expect(deltas.find((d) => d.playerId === "bD")?.challengeDelta).toBe(-20);
  });

  it("caso 15: il punteggio non scende mai sotto zero", () => {
    const lowPlayers: Player[] = [
      { ...players[0], currentElo: 100 },
      { ...players[1], currentElo: 3 },
      { ...players[2], currentElo: 100 },
      { ...players[3], currentElo: 100 },
    ];

    const match: MatchRecord = {
      id: "m4",
      status: "completed",
      home: { strikerId: "aS", defenderId: "aD" },
      away: { strikerId: "bS", defenderId: "bD" },
      goals: { aS: 0, aD: 0, bS: 4, bD: 4 },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      version: 1,
      seasonId: "s1",
    };

    const deltas = computeMatchEloDeltas(match, lowPlayers);
    const target = deltas.find((d) => d.playerId === "aD");

    expect(target?.eloAfter).toBe(0);
    expect((target?.totalRequestedDelta ?? 0) < 0).toBe(true);
  });
});

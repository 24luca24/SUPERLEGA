import { describe, expect, it } from "vitest";
import { applyGoalChange, createDraftMatch, finalizeMatch } from "@/lib/domain/match";
import type { Player } from "@/types/domain";

const players: Player[] = [
  { id: "aS", animal: "A", city: "A", displayName: "A", role: "striker", active: true, currentElo: 100 },
  { id: "aD", animal: "B", city: "B", displayName: "B", role: "defender", active: true, currentElo: 100 },
  { id: "bS", animal: "C", city: "C", displayName: "C", role: "striker", active: true, currentElo: 100 },
  { id: "bD", animal: "D", city: "D", displayName: "D", role: "defender", active: true, currentElo: 100 },
];

describe("match workflow", () => {
  it("caso 7: +1 e poi -1 torna allo stato iniziale senza negativi", () => {
    let match = createDraftMatch({
      id: "m1",
      home: { strikerId: "aS", defenderId: "aD" },
      away: { strikerId: "bS", defenderId: "bD" },
      seasonId: "s1",
    });

    match = applyGoalChange(match, "aS", 1);
    expect(match.goals.aS).toBe(1);

    match = applyGoalChange(match, "aS", -1);
    expect(match.goals.aS).toBe(0);

    match = applyGoalChange(match, "aS", -1);
    expect(match.goals.aS).toBe(0);
  });

  it("caso 8: doppia conferma match e idempotente", () => {
    const match = createDraftMatch({
      id: "m2",
      home: { strikerId: "aS", defenderId: "aD" },
      away: { strikerId: "bS", defenderId: "bD" },
      seasonId: "s1",
    });

    expect(() => finalizeMatch(match, players)).toThrow(/pareggio/);
    const first = finalizeMatch(applyGoalChange(match, "aS", 1), players);
    expect(first.idempotent).toBe(false);
    expect(first.deltas).toHaveLength(4);

    const second = finalizeMatch(first.match, players);
    expect(second.idempotent).toBe(true);
    expect(second.deltas).toHaveLength(0);
  });
});

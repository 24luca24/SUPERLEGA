import { describe, expect, it } from "vitest";
import { recalculateHistory, type HistoricalMatch } from "@/lib/domain/history";
import { createDraftMatch } from "@/lib/domain/match";
import type { Player, Role } from "@/types/domain";
import workbook from "../../data/imports/superlega.json";
import roster from "../../data/roster.example.json";

const players: Player[] = ["s1", "d1", "s2", "d2"].map((id, i) => ({ id, role: i % 2 ? "defender" : "striker", animal: id, city: "", displayName: id, active: true, currentElo: 100 }));
const baseline: HistoricalMatch = { id: "excel", status: "completed", ratingPolicy: "baseline", home: { strikerId: "s1", defenderId: "d1" }, away: { strikerId: "s2", defenderId: "d2" }, goals: { s1: 4, d1: 2, s2: 3, d2: 1 }, createdAt: "", historyOrder: 1, seasonId: "season", version: 1 };

describe("storico Excel come base per nuove partite", () => {
  it("lo storico applica prestazione e risultato senza sfide", () => {
    const result = recalculateHistory([baseline], players);
    expect(result.events.every((event) => event.challengeDelta === 0)).toBe(true);
    expect(result.players.find((p) => p.id === "s1")?.currentElo).toBe(106);
    expect(result.players.find((p) => p.id === "d1")?.currentElo).toBeCloseTo(104.8, 8);
  });
  it("una partita nuova eredita la base Excel e applica le sfide senza duplicare lo storico", () => {
    const match: HistoricalMatch = { ...baseline, id: "new", ratingPolicy: "standard", historyOrder: undefined, completedAt: "2026-11-18T13:00:00Z" };
    const result = recalculateHistory([match, baseline], players);
    const next = result.events.find((e) => e.matchId === "new" && e.playerId === "s1")!;
    expect(next.eloBefore).toBe(106);
    expect(next.challengeDelta).toBe(5);
    expect(next.eloAfter).toBe(117);
    expect(result.events.filter((e) => e.matchId === "excel").every((e) => e.challengeDelta === 0)).toBe(true);
    expect(createDraftMatch({ id: "draft", home: baseline.home, away: baseline.away, seasonId: "season" }).ratingPolicy).toBe("standard");
  });
  it("mantiene il minimo zero anche per lo storico", () => {
    const games = Array.from({ length: 20 }, (_, i) => ({ ...baseline, id: `loss-${i}`, historyOrder: i, goals: { s1: 0, d1: 0, s2: 20, d2: 0 } }));
    const result = recalculateHistory(games, players);
    expect(result.players.find((p) => p.id === "d1")?.currentElo).toBe(0);
    expect(result.events.every((e) => e.challengeDelta === 0 && e.eloAfter >= 0)).toBe(true);
  });
  it("i 30 risultati reali coincidono con i valori attesi dal Python fornito", () => {
    const importedPlayers: Player[] = roster.map((p) => ({ id: p.legacyName, animal: p.username, city: "", displayName: p.username, role: p.role as Role, active: true, currentElo: 100 }));
    const matches: HistoricalMatch[] = workbook.matches.filter((m) => m.status === "completed").map((m) => {
      const team = (ids: string[]) => ({ strikerId: ids.find((id) => importedPlayers.find((p) => p.id === id)?.role === "striker")!, defenderId: ids.find((id) => importedPlayers.find((p) => p.id === id)?.role === "defender")! });
      return { id: `row-${m.sourceRow}`, status: "completed", ratingPolicy: "baseline", home: team(m.participants.slice(0, 2)), away: team(m.participants.slice(2)), goals: Object.fromEntries(m.participants.map((id, i) => [id, m.goals[i]!])), createdAt: "", historyOrder: m.sourceRow, seasonId: "excel", version: 1 };
    });
    const result = recalculateHistory(matches, importedPlayers);
    expect(result.events).toHaveLength(120);
    expect(result.events.every((e) => e.challengeDelta === 0)).toBe(true);
    const expected: Record<string, number> = { AIRAGHI: 189.5, VOLPARI: 171, PETILLO: 165, CILIBERTO: 162, BOTARELLI: 154.8, CHIODINI: 132.8, TARENZI: 128, BAGGETTO: 127.5, TRENTADUE: 115.5, BOLGIANI: 109.8, TAGLIAFERRI: 107.7, BRESCIANI: 107.5, ASTEGIANO: 101.5, DEIDIER: 86 };
    result.players.forEach((p) => expect(p.currentElo).toBeCloseTo(expected[p.id], 8));
  });
});

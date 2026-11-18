import { describe, expect, it } from "vitest";
import { generateBalancedPairing, lastPartnersFromMatches, repeatsLastPartner } from "@/lib/domain/pairings";
import type { Player } from "@/types/domain";

const players: Player[] = [
  { id: "s1", animal: "A", city: "A", displayName: "A", role: "striker", active: true, currentElo: 120 },
  { id: "s2", animal: "B", city: "B", displayName: "B", role: "striker", active: true, currentElo: 110 },
  { id: "d1", animal: "C", city: "C", displayName: "C", role: "defender", active: true, currentElo: 100 },
  { id: "d2", animal: "D", city: "D", displayName: "D", role: "defender", active: true, currentElo: 130 },
];

describe("generateBalancedPairing", () => {
  it("caso 10: confronta i due abbinamenti con 2 attaccanti e 2 difensori", () => {
    const result = generateBalancedPairing(players, { seed: 1, topN: 2, tolerance: 30 });
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.candidates.length).toBeGreaterThanOrEqual(2);

    const gaps = result.candidates.map((candidate) => candidate.eloGap);
    expect(gaps).toContain(Math.abs((120 + 100) - (110 + 130)));
    expect(gaps).toContain(Math.abs((120 + 130) - (110 + 100)));
  });

  it("caso 10b: errore chiaro con ruoli insufficienti", () => {
    const missing = players.filter((player) => player.id !== "d2");
    const result = generateBalancedPairing(missing, { seed: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("almeno 2 attaccanti e 2 difensori");
    }
  });

  it("seed deterministico: a parita di seed risultato stabile", () => {
    const one = generateBalancedPairing(players, { seed: 99, tolerance: 20, topN: 2 });
    const two = generateBalancedPairing(players, { seed: 99, tolerance: 20, topN: 2 });

    expect(one).toEqual(two);
  });
  it("esclude l’ultimo compagno anche quando il giocatore ha saltato delle partite",()=>{
    const history=[{id:"a",status:"completed" as const,home:{strikerId:"s1",defenderId:"d1"},away:{strikerId:"s2",defenderId:"d2"},goals:{},createdAt:"2026-01-01",historyOrder:1,version:1,seasonId:"s"},
      {id:"b",status:"completed" as const,home:{strikerId:"s3",defenderId:"d3"},away:{strikerId:"s4",defenderId:"d4"},goals:{},createdAt:"2026-01-02",historyOrder:2,version:1,seasonId:"s"}];
    const partners=lastPartnersFromMatches(history);
    const result=generateBalancedPairing(players,{lastPartnerByPlayer:partners,tolerance:100});
    expect(result.ok).toBe(true);
    if(result.ok)result.candidates.forEach((proposal)=>expect(repeatsLastPartner(proposal,partners)).toBe(false));
    expect(partners.s1).toBe("d1");
  });
  it("blocca il caso senza soluzioni anziché ripetere una coppia",()=>{
    const result=generateBalancedPairing(players,{lastPartnerByPlayer:{s1:"d1",d2:"s1"}});
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.error).toContain("ultimo compagno");
  });

});

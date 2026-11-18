import type { PairingOptions, PairingProposal, PairingResult, Player, MatchRecord } from "@/types/domain";

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function quartetKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

export function proposalKey(proposal: Pick<PairingProposal,"home"|"away">): string {
  return [pairKey(proposal.home.strikerId,proposal.home.defenderId),pairKey(proposal.away.strikerId,proposal.away.defenderId)].sort().join("::");
}
export function lastPartnersFromMatches(matches: MatchRecord[]): Record<string,string> {
  const ordered=matches.filter((m)=>m.status==="completed"||m.status==="live").sort((a,b)=> {
    if(a.historyOrder!==undefined || b.historyOrder!==undefined) {
      if(a.historyOrder===undefined) return 1;
      if(b.historyOrder===undefined) return -1;
      return a.historyOrder-b.historyOrder || a.id.localeCompare(b.id);
    }
    return Date.parse(a.completedAt??a.createdAt)-Date.parse(b.completedAt??b.createdAt) || a.id.localeCompare(b.id);
  });
  const partners: Record<string,string>={};
  for(const match of ordered) for(const team of [match.home,match.away]) {
    partners[team.strikerId]=team.defenderId; partners[team.defenderId]=team.strikerId;
  }
  return partners;
}
export function repeatsLastPartner(proposal: Pick<PairingProposal,"home"|"away">, partners:Record<string,string>): boolean {
  return [proposal.home,proposal.away].some((team)=>partners[team.strikerId]===team.defenderId || partners[team.defenderId]===team.strikerId);
}

function chunkCombinations<T>(items: T[], pick: number): T[][] {
  const out: T[][] = [];

  function walk(start: number, partial: T[]) {
    if (partial.length === pick) {
      out.push([...partial]);
      return;
    }

    for (let i = start; i < items.length; i += 1) {
      partial.push(items[i]);
      walk(i + 1, partial);
      partial.pop();
    }
  }

  walk(0, []);
  return out;
}

function pairingCost(proposal: PairingProposal, options: PairingOptions): number {
  const recentPairings = new Set(options.recentPairings ?? []);
  const recentQuartets = new Set(options.recentQuartets ?? []);

  const pairPenalty =
    (recentPairings.has(pairKey(proposal.home.strikerId, proposal.home.defenderId)) ? 2 : 0) +
    (recentPairings.has(pairKey(proposal.away.strikerId, proposal.away.defenderId)) ? 2 : 0);

  const quartetPenalty =
    recentQuartets.has(
      quartetKey([
        proposal.home.strikerId,
        proposal.home.defenderId,
        proposal.away.strikerId,
        proposal.away.defenderId,
      ]),
    )
      ? 3
      : 0;

  return proposal.eloGap + pairPenalty + quartetPenalty;
}

export function generateBalancedPairing(
  players: Player[],
  options: Partial<PairingOptions> = {},
): PairingResult {
  const resolvedOptions: PairingOptions = {
    tolerance: options.tolerance ?? 5,
    topN: options.topN ?? 4,
    seed: options.seed ?? 42,
    recentPairings: options.recentPairings ?? [],
    recentQuartets: options.recentQuartets ?? [],
    lastPartnerByPlayer: options.lastPartnerByPlayer ?? {},
    previousProposalKey: options.previousProposalKey,
  };

  const available = players.filter((player) => player.active);
  const strikers = available.filter((player) => player.role === "striker");
  const defenders = available.filter((player) => player.role === "defender");

  if (strikers.length < 2 || defenders.length < 2) {
    return {
      ok: false,
      error: "Servono almeno 2 attaccanti e 2 difensori attivi.",
    };
  }

  const strikerPairs = chunkCombinations(strikers, 2);
  const defenderPairs = chunkCombinations(defenders, 2);
  const candidates: PairingProposal[] = [];

  strikerPairs.forEach(([s1, s2]) => {
    defenderPairs.forEach(([d1, d2]) => {
      const proposalA: PairingProposal = {
        home: { strikerId: s1.id, defenderId: d1.id },
        away: { strikerId: s2.id, defenderId: d2.id },
        eloHome: s1.currentElo + d1.currentElo,
        eloAway: s2.currentElo + d2.currentElo,
        eloGap: Math.abs(s1.currentElo + d1.currentElo - (s2.currentElo + d2.currentElo)),
        cost: 0,
      };

      const proposalB: PairingProposal = {
        home: { strikerId: s1.id, defenderId: d2.id },
        away: { strikerId: s2.id, defenderId: d1.id },
        eloHome: s1.currentElo + d2.currentElo,
        eloAway: s2.currentElo + d1.currentElo,
        eloGap: Math.abs(s1.currentElo + d2.currentElo - (s2.currentElo + d1.currentElo)),
        cost: 0,
      };

      proposalA.cost = pairingCost(proposalA, resolvedOptions);
      proposalB.cost = pairingCost(proposalB, resolvedOptions);

      candidates.push(proposalA, proposalB);
    });
  });

  const valid=candidates.filter((candidate)=>!repeatsLastPartner(candidate,resolvedOptions.lastPartnerByPlayer??{}));
  if(!valid.length) return {ok:false,error:"Nessun abbinamento possibile senza ripetere l’ultimo compagno di un giocatore. Modifica i presenti e riprova."};
  valid.sort((a,b)=>a.eloGap-b.eloGap || a.cost-b.cost);
  const minCost = valid[0].eloGap;
  const shortlist = valid
    .filter((candidate) => candidate.eloGap <= minCost + resolvedOptions.tolerance)
    .sort((a,b)=>a.cost-b.cost)
    .slice(0, Math.max(1,resolvedOptions.topN));
  const different=shortlist.filter((candidate)=>proposalKey(candidate)!==resolvedOptions.previousProposalKey);
  const choices=different.length ? different : shortlist;

  const random = seededRandom(resolvedOptions.seed);
  const index = Math.floor(random() * choices.length);

  return {
    ok: true,
    best: choices[index],
    availableAlternatives: valid.length,
    candidates: shortlist,
  };
}

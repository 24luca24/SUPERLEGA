import { matchResultFromGoals } from "./elo";
import type { MatchRecord, Player } from "@/types/domain";

export interface IndividualStandingRow {
  playerId: string;
  displayName: string;
  role: "striker" | "defender";
  matches: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  elo: number;
}

export interface PairStandingRow {
  key: string;
  members: string[];
  matches: number;
  wins: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

function incrementResult(row: { wins: number; losses: number }, result: "win" | "loss") {
  if (result === "win") {
    row.wins += 1;
    return;
  }

  if (result === "loss") {
    row.losses += 1;
    return;
  }

}

export function buildIndividualStandings(matches: MatchRecord[], players: Player[]): IndividualStandingRow[] {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const rows = new Map<string, IndividualStandingRow>();

  players.forEach((player) => {
    rows.set(player.id, {
      playerId: player.id,
      displayName: player.displayName,
      role: player.role,
      matches: 0,
      wins: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      elo: player.currentElo,
    });
  });

  matches
    .filter((match) => match.status === "completed")
    .forEach((match) => {
      const homeIds = [match.home.strikerId, match.home.defenderId];
      const awayIds = [match.away.strikerId, match.away.defenderId];
      const homeGoals = homeIds.reduce((sum, id) => sum + (match.goals[id] ?? 0), 0);
      const awayGoals = awayIds.reduce((sum, id) => sum + (match.goals[id] ?? 0), 0);

      const homeResult = matchResultFromGoals(homeGoals, awayGoals);
      const awayResult = matchResultFromGoals(awayGoals, homeGoals);

      homeIds.forEach((playerId) => {
        const row = rows.get(playerId);
        const player = playerById.get(playerId);

        if (!row || !player) {
          return;
        }

        row.matches += 1;
        row.goalsFor += match.goals[playerId] ?? 0;
        row.goalsAgainst += awayGoals;
        incrementResult(row, homeResult);
      });

      awayIds.forEach((playerId) => {
        const row = rows.get(playerId);
        const player = playerById.get(playerId);

        if (!row || !player) {
          return;
        }

        row.matches += 1;
        row.goalsFor += match.goals[playerId] ?? 0;
        row.goalsAgainst += homeGoals;
        incrementResult(row, awayResult);
      });
    });

  return [...rows.values()].sort((a, b) => b.elo - a.elo || b.wins - a.wins);
}

export function buildPairStandings(matches: MatchRecord[]): PairStandingRow[] {
  const rows = new Map<string, PairStandingRow>();

  matches
    .filter((match) => match.status === "completed")
    .forEach((match) => {
      const homeMembers = [match.home.strikerId, match.home.defenderId].sort();
      const awayMembers = [match.away.strikerId, match.away.defenderId].sort();
      const homeKey = homeMembers.join("|");
      const awayKey = awayMembers.join("|");

      const homeGoals = (match.goals[match.home.strikerId] ?? 0) + (match.goals[match.home.defenderId] ?? 0);
      const awayGoals = (match.goals[match.away.strikerId] ?? 0) + (match.goals[match.away.defenderId] ?? 0);

      if (!rows.has(homeKey)) {
        rows.set(homeKey, {
          key: homeKey,
          members: homeMembers,
          matches: 0,
          wins: 0,
              losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        });
      }

      if (!rows.has(awayKey)) {
        rows.set(awayKey, {
          key: awayKey,
          members: awayMembers,
          matches: 0,
          wins: 0,
              losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        });
      }

      const home = rows.get(homeKey)!;
      const away = rows.get(awayKey)!;

      home.matches += 1;
      away.matches += 1;
      home.goalsFor += homeGoals;
      home.goalsAgainst += awayGoals;
      away.goalsFor += awayGoals;
      away.goalsAgainst += homeGoals;

      const result = matchResultFromGoals(homeGoals, awayGoals);
      if (result === "win") {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
      } else {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
      }

      home.goalDifference = home.goalsFor - home.goalsAgainst;
      away.goalDifference = away.goalsFor - away.goalsAgainst;
    });

  return [...rows.values()].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
}

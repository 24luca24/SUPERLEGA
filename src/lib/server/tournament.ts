import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "./auth";
import { database } from "./db";
import type { MatchRecord, Player } from "@/types/domain";
export async function loadTournament(): Promise<{ players:Player[]; matches:MatchRecord[] }> {
  if (!await currentUser()) redirect("/login");
  const pool=database();
  const [roster,games,goals]=await Promise.all([
    pool.query("select id,animal,city,display_name,role,active,current_elo from public.players"),
    pool.query("select * from public.matches where status='completed' order by history_order nulls last,completed_at,id"),
    pool.query("select g.match_id,g.player_id,g.goals from public.match_goals g join public.matches m on m.id=g.match_id where m.status='completed'")
  ]);
  const players:Player[]=roster.rows.map((r)=>({id:r.id,animal:r.animal,city:r.city,displayName:r.display_name,role:r.role,active:r.active,currentElo:Number(r.current_elo)}));
  const scoreByMatch=new Map<string,Record<string,number>>();
  for(const row of goals.rows) {
    const score=scoreByMatch.get(row.match_id)??{};
    score[row.player_id]=row.goals;
    scoreByMatch.set(row.match_id,score);
  }
  const matches:MatchRecord[]=games.rows.map((r)=>({id:r.id,status:r.status,ratingPolicy:r.rating_policy,historyOrder:r.history_order??undefined,home:{strikerId:r.home_striker_id,defenderId:r.home_defender_id},away:{strikerId:r.away_striker_id,defenderId:r.away_defender_id},goals:scoreByMatch.get(r.id)??{},createdAt:r.created_at.toISOString(),completedAt:r.completed_at?.toISOString(),version:r.version,seasonId:r.season_id}));
  return {players,matches};
}

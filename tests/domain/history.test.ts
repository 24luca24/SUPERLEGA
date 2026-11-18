import { describe, expect, it } from "vitest";
import { recalculateHistory, type HistoricalMatch } from "@/lib/domain/history";
import type { Player } from "@/types/domain";
const players: Player[] = ["s1","d1","s2","d2"].map((id,i) => ({id,role:i%2 ? "defender" : "striker",animal:id,city:"",displayName:id,active:true,currentElo:999}));
const game = (id:string, order:number):HistoricalMatch => ({id,status:"completed",home:{strikerId:"s1",defenderId:"d1"},away:{strikerId:"s2",defenderId:"d2"},goals:{s1:4,d1:2,s2:3,d2:1},createdAt:"",historyOrder:order,seasonId:"s",version:1});
describe("ricostruzione ELO", () => {
  it("riparte da 100, crea quattro eventi e usa l'ordine storico confermato", () => {
    const a=game("a",1), b=game("b",2);
    const one=recalculateHistory([b,a],players), two=recalculateHistory([a,b],players);
    expect(one).toEqual(two);
    expect(one.events).toHaveLength(8);
    expect(one.events.slice(0,4).every((e)=>e.eloBefore===100 && Math.abs(e.challengeDelta)===5)).toBe(true);
    expect(players.every((p)=>p.currentElo===999)).toBe(true);
  });
  it("ricalcola le partite successive dopo correzione o eliminazione", () => {
    const a=game("a",1), b=game("b",2);
    const original=recalculateHistory([a,b],players);
    const edited={...a,goals:{s1:0,d1:0,s2:8,d2:2}};
    const corrected=recalculateHistory([edited,b],players);
    expect(corrected.events.find((e)=>e.matchId==="b" && e.playerId==="s1")?.eloBefore).not.toBe(original.events.find((e)=>e.matchId==="b" && e.playerId==="s1")?.eloBefore);
    expect(recalculateHistory([b],players).events.every((e)=>e.eloBefore===100)).toBe(true);
  });
  it("il cambio partner mantiene il rating individuale", () => {
    const a=game("a",1), b={...game("b",2),goals:{s1:5,d1:2,s2:3,d2:1},home:{strikerId:"s1",defenderId:"d2"},away:{strikerId:"s2",defenderId:"d1"}};
    const result=recalculateHistory([a,b],players);
    for (const id of ["s1","d1","s2","d2"]) expect(result.events.find((e)=>e.matchId==="b" && e.playerId===id)?.eloBefore).toBe(result.events.find((e)=>e.matchId==="a" && e.playerId===id)?.eloAfter);
  });
  it("esclude bozze e rifiuta contatori extra, ruoli errati e dati negativi", () => {
    expect(recalculateHistory([{...game("a",1),status:"draft"}],players).events).toHaveLength(0);
    expect(()=>recalculateHistory([{...game("a",1),goals:{s1:-1,d1:0,s2:0,d2:0}}],players)).toThrow(/Gol/);
    expect(()=>recalculateHistory([{...game("a",1),goals:{s1:0,d1:0,s2:0,d2:0,extra:1}}],players)).toThrow(/quattro/);
    expect(()=>recalculateHistory([{...game("a",1),home:{strikerId:"d1",defenderId:"s1"}}],players)).toThrow(/Ruolo/);
  });
});

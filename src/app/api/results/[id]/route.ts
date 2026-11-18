import { NextResponse } from "next/server";
import { correctResult,MatchError,isUuid } from "@/lib/server/match-store";
import { matchActor,matchBody,matchResponseError } from "@/lib/server/match-http";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await matchActor(request);const {id}=await params;const body=await matchBody(request);
    if((body.kind!=="edit"&&body.kind!=="delete")||!isUuid(body.mutationId)||typeof body.version!=="number")throw new MatchError(400,"Correzione non valida.");
    if(body.kind==="edit"&&(!body.goals||typeof body.goals!=="object"||Array.isArray(body.goals)))throw new MatchError(400,"Contatori non validi.");
    return NextResponse.json({match:await correctResult(actor,id,{kind:body.kind,mutationId:body.mutationId,version:body.version,goals:body.goals as Record<string,number>|undefined})});
  }catch(error){return matchResponseError(error);}
}

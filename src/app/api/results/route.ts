import { NextResponse } from "next/server";
import { getResultsScreen } from "@/lib/server/match-store";
import { matchActor,matchResponseError } from "@/lib/server/match-http";
export async function GET(){try{return NextResponse.json(await getResultsScreen(await matchActor()),{headers:{"Cache-Control":"no-store"}});}catch(error){return matchResponseError(error);}}

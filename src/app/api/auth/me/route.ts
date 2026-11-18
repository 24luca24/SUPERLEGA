import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";
export async function GET() {
  const user=await currentUser();
  return NextResponse.json(user ? { username:user.username, authenticated:true, isReferee:user.is_admin && user.username.toLocaleLowerCase("it")==="roberto" } : { authenticated:false }, { headers:{"Cache-Control":"no-store"} });
}

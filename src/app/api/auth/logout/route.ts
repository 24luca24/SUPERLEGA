import { NextResponse } from "next/server";
import { isSameOrigin, redirectUrl, logout } from "@/lib/server/auth";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine non valida." }, { status: 403 });
  await logout();
  return NextResponse.redirect(redirectUrl("/login", request), 303);
}

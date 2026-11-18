import { NextResponse } from "next/server";
import { isSameOrigin, redirectUrl, login } from "@/lib/server/auth";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine non valida." }, { status: 403 });
  try {
    const form = await request.formData();
    const username = form.get("username"), password = form.get("password");
    if (typeof username !== "string" || typeof password !== "string" || username.length > 100 || password.length > 100) {
      return NextResponse.redirect(redirectUrl("/login?errore=credenziali", request), 303);
    }
    if (!await login(username, password)) return NextResponse.redirect(redirectUrl("/login?errore=credenziali", request), 303);
    return NextResponse.redirect(redirectUrl("/profilo", request), 303);
  } catch {
    return NextResponse.redirect(redirectUrl("/login?errore=connessione", request), 303);
  }
}

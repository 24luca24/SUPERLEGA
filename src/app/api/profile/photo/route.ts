import { NextResponse } from "next/server";
import { currentUser, isSameOrigin, redirectUrl } from "@/lib/server/auth";
import { database } from "@/lib/server/db";
import { deleteAvatar, uploadAvatar } from "@/lib/server/storage";
import { avatarType } from "@/lib/domain/avatar";
import { uploadLimit } from "@/lib/server/storage-config";
export async function POST(request: Request) {
  const maxBytes=uploadLimit();
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine non valida." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Accedi per caricare la tua foto." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > maxBytes + 65536) return NextResponse.json({ error: "Foto troppo grande." }, { status: 413 });
  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size > maxBytes) return NextResponse.redirect(redirectUrl("/profilo?errore=formato", request), 303);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { avatarType(bytes,maxBytes); } catch { return NextResponse.redirect(redirectUrl("/profilo?errore=formato", request), 303); }
  let uploaded: string | undefined;
  try {
    uploaded = await uploadAvatar(user.id, bytes);
    const result = await database().query("update public.users set avatar_key=$1 where id=$2 and enabled", [uploaded, user.id]);
    if (result.rowCount !== 1) throw new Error("Utente non disponibile");
  } catch {
    if (uploaded) await deleteAvatar(uploaded).catch(() => undefined);
    return NextResponse.redirect(redirectUrl("/profilo?errore=storage", request), 303);
  }
  if (user.avatar_key) await deleteAvatar(user.avatar_key).catch(() => undefined);
  return NextResponse.redirect(redirectUrl("/profilo?foto=ok", request), 303);
}

import Link from "next/link";
import { uploadLimit } from "@/lib/server/storage-config";
import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server/auth";
import { avatarUrl } from "@/lib/server/storage";
import { Suspense } from "react";

async function Profile({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const maxMiB=(uploadLimit()/1024**2).toLocaleString("it-IT",{maximumFractionDigits:2});
  let photo: string | undefined;
  if (user.avatar_key) photo = await avatarUrl(user.avatar_key).catch(() => undefined);
  return <section className="panel mx-auto max-w-lg space-y-4 p-6">
    <h1 className="text-4xl text-gold">Il tuo profilo</h1>
    <p className="text-xl">{user.username}</p>
    {user.is_admin&&<Link href="/arbitro" className="inline-block rounded-xl border border-white/15 px-4 py-3">Arbitro · Gestisci risultati</Link>}
    {photo && <Image unoptimized width={128} height={128} src={photo} alt={`Foto di ${user.username}`} className="h-32 w-32 rounded-full object-cover" />}
    {params.foto === "ok" && <p role="status">Foto aggiornata.</p>}
    {params.errore && <p role="alert">{params.errore === "formato" ? `Scegli una foto JPG, PNG o WebP di massimo ${maxMiB} MB.` : "Caricamento non riuscito. Verifica la configurazione S3."}</p>}
    <form action="/api/profile/photo" method="post" encType="multipart/form-data" className="space-y-3">
      <label htmlFor="photo" className="block">La tua foto (JPG, PNG o WebP, massimo {maxMiB} MB)</label>
      <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="w-full" />
      <button className="rounded-xl bg-accent px-4 py-3 text-white">Salva foto</button>
    </form>
    <details className="rounded-xl border border-white/10 p-4">
      <summary className="cursor-pointer font-semibold">Aggiungi Superlega alla Home</summary>
      <div className="mt-3 space-y-3 text-sm text-text-muted">
        <Image src="/icons/superlega-192.png" alt="Icona dell’app Superlega" width={64} height={64} className="rounded-xl" />
        <p><strong>iPhone:</strong> apri Superlega in Safari, tocca Condividi e poi Aggiungi alla schermata Home. Attiva Apri come app web, se disponibile.</p>
        <p><strong>Android:</strong> apri Superlega in Chrome, tocca il menu ⋮ e scegli Installa o Aggiungi alla schermata Home.</p>
        <p>Per l’installazione completa usa l’indirizzo pubblico HTTPS di Superlega.</p>
      </div>
    </details>
    <form action="/api/auth/logout" method="post"><button className="rounded-xl border border-white/20 px-4 py-3">Esci</button></form>
  </section>;
}
export default function ProfilePage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<p>Caricamento profilo…</p>}><Profile {...props} /></Suspense>;
}

import { Suspense } from "react";
async function LoginForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <div className="flex min-h-screen items-center justify-center p-4">
    <section className="panel w-full max-w-md p-6">
      <p className="mb-1 text-xs uppercase tracking-[0.35em] text-text-muted">Superlega</p>
      <h1 className="mb-6 text-5xl text-gold">Entra nell&apos;arena</h1>
      {params.errore && <p role="alert" className="mb-4">{params.errore === "connessione" ? "Accesso non disponibile. Verifica la connessione al database." : "Nome o password non corretti, oppure account non ancora abilitato."}</p>}
      <form action="/api/auth/login" method="post" className="space-y-3">
        <label className="block" htmlFor="username">Nome / animale</label>
        <input id="username" name="username" autoComplete="username" required maxLength={100} className="w-full rounded-xl border border-white/10 bg-panel-soft px-3 py-3" />
        <label className="block" htmlFor="password">Password / città</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={100} className="w-full rounded-xl border border-white/10 bg-panel-soft px-3 py-3" />
        <button className="w-full rounded-xl bg-accent px-3 py-3 font-bold text-white">Entra nell&apos;arena</button>
      </form>
      <p className="mt-4 text-xs text-text-muted">Accesso riservato ai giocatori e all’arbitro. Per i giocatori: animale e città.</p>
    </section>
  </div>;
}
export default function LoginPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<p>Caricamento…</p>}><LoginForm {...props} /></Suspense>;
}

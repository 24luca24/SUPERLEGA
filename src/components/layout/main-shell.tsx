"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GalleryHorizontal, ListOrdered, LogOut, Shield, Swords, Trophy } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const links = [
  { href: "/classifica", label: "Classifica", icon: Trophy },
  { href: "/ranking", label: "Ranking", icon: ListOrdered },
  { href: "/partita", label: "Partita", icon: Swords },
  { href: "/generatore", label: "Generatore", icon: Shield },
  { href: "/galleria", label: "Galleria", icon: GalleryHorizontal },
];

export function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [isReferee, setIsReferee] = useState(false);
  useEffect(() => {
    let active=true;
    fetch("/api/auth/me", {cache:"no-store"}).then((r)=>r.json()).then((user)=>{ if(active) { setUsername(user.authenticated ? user.username : null); setIsReferee(!!user.isReferee); } }).catch(()=>{ if(active) setUsername(null); });
    return ()=>{active=false;};
  }, [pathname]);
  const hideNavigation = pathname === "/login";

  if (hideNavigation) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="superlega-shell mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-4 p-4 pb-24 md:grid-cols-[220px_1fr] md:pb-4">
      <aside className="panel hidden p-4 md:block">
        <h1 className="text-3xl text-gold">SUPERLEGA</h1>
        <p className="mb-6 text-sm text-text-muted">Arena interna di calciobalilla</p>
        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname.startsWith(link.href) || (link.href === "/partita" && pathname.startsWith("/arbitro"));
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 transition ${
                  active ? "bg-accent text-white" : "bg-panel-soft text-text-primary hover:bg-[#243145]"
                }`}
              >
                <Icon size={18} />
                {isReferee && link.href === "/partita" ? "Arbitro" : link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="space-y-4">
        <header className="panel flex items-center justify-between p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-text-muted">Identita attiva</p>
            <Link href={username ? "/profilo" : "/login"} className="text-lg font-bold">{username ?? "Accedi con il tuo animale"}</Link>
          </div>
          {username && <form action="/api/auth/logout" method="post">
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-panel-soft px-3 py-2 text-sm">
              <LogOut size={16} /> Esci
            </button>
          </form>}
        </header>
        <main>{children}</main>
      </div>

      <nav className="superlega-mobile-nav panel fixed inset-x-3 bottom-3 z-20 flex items-center justify-between p-2 md:hidden">
        {links.map((link) => {
          const active = pathname.startsWith(link.href) || (link.href === "/partita" && pathname.startsWith("/arbitro"));
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-w-14 flex-col items-center rounded-lg px-2 py-2 text-[11px] ${
                active ? "bg-accent text-white" : "text-text-muted"
              }`}
            >
              <Icon size={18} />
              {isReferee && link.href === "/partita" ? "Arbitro" : link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

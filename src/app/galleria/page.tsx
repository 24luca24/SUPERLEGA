const mockImages = [
  { id: "g1", title: "La rovesciata del Gorilla", author: "GORILLA DI GORLA", date: "18/11/2026" },
  { id: "g2", title: "Muro Gufo", author: "GUFO DI LECCO", date: "17/11/2026" },
  { id: "g3", title: "Tigre in velocita", author: "TIGRE DI CATANIA", date: "16/11/2026" },
];

export default function GalleriaPage() {
  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h1 className="text-4xl text-gold">Galleria sfotto</h1>
        <p className="text-sm text-text-muted">Modalita demo: upload reale disponibile dopo configurazione Supabase Storage.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mockImages.map((image) => (
          <article key={image.id} className="panel overflow-hidden">
            <div className="h-36 bg-gradient-to-br from-[#2c3547] to-[#10141f]" />
            <div className="p-3">
              <p className="font-semibold">{image.title}</p>
              <p className="text-xs text-text-muted">
                {image.author} · {image.date}
              </p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

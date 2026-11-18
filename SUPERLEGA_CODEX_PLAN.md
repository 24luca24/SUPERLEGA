# SUPERLEGA — Piano di sviluppo per Codex

> **Obiettivo:** realizzare una web app interna, divertente e mobile-first per il torneo aziendale di calciobalilla (2 contro 2). Deploy su **Vercel**, dati su **Supabase**. Progetto volutamente semplice: niente architetture enterprise, niente funzionalità inutili.

## 0. Istruzioni operative per Codex

Sei il developer incaricato di costruire una web app **funzionante end-to-end**, non una semplice mockup UI. Usa questo documento come specifica di prodotto e piano implementativo.

1. Ispeziona prima il repository; non sovrascrivere materiale esistente.
2. Implementa per fasi, con codice pulito e tipizzato, senza overengineering.
3. Genera migrazioni SQL Supabase, seed di esempio e `.env.example`; **non** inserire segreti reali nel repository.
4. Quando mancano credenziali Supabase, usa un repository/data adapter mock per visualizzare e provare l'interfaccia, ma rendi esplicito cosa manca alla connessione reale. Non fingere che il salvataggio cloud funzioni.
5. Dopo ogni fase significativa esegui lint, typecheck e test disponibili. Non dichiarare una funzionalità completa se non è collegata al DB o verificata.
6. Prima di implementare le regole segnate come **DA CONFERMARE**, usa i default proposti sotto, isolati in configurazione, e segnalali nel README.
7. L'interfaccia e i testi devono essere in **italiano**.

## 1. Stack tecnologico

| Livello | Scelta | Motivo |
|---|---|---|
| Frontend e server | **Next.js + React + TypeScript** (App Router) | Un solo progetto, ottimo per Vercel, API/server actions quando servono |
| UI | **Tailwind CSS + shadcn/ui + Lucide** | Componenti belli, rapidi e personalizzabili |
| Database | **Supabase PostgreSQL** | Persistenza, query e vincoli |
| Sessioni | **Supabase Auth**, accesso anonimo guidato dal nickname | Nessuna registrazione email/password nell'MVP |
| File | **Supabase Storage** | Immagini della galleria |
| Deploy | **Vercel** | Git integration e variabili di ambiente |
| Test | **Vitest** per dominio; Playwright per pochi flussi cruciali se praticabile | Verificare davvero conteggi, ELO e finalizzazione |

Non creare un backend Java separato: per questa app aggiungerebbe complessità inutile. Organizzare comunque le regole di business in funzioni TypeScript pure, facilmente testabili.

## 2. Esperienza visiva

Tema **Superlega**: sportivo, ironico, competitivo; sfondo scuro (antracite/nero), accenti rosso acceso e oro per i podi. Interfaccia moderna, non gestionale aziendale. Titoli forti, cards, icone, medaglie e piccole animazioni sobrie.

- **Mobile-first**, ma piacevole anche da desktop, perché la segnatura sarà spesso fatta dal telefono.
- Menu inferiore su mobile / sidebar su desktop: **Classifica · Ranking · Partita · Generatore · Galleria**.
- Header con nome animale + città e pulsante Esci.
- Empty states curati, skeleton/loading, toast di conferma, feedback per errori e conferme per azioni irreversibili.
- Accessibilità: pulsanti grandi, contrasto leggibile, counter utilizzabili con una mano.
- Evitare effetti pesanti, framework superflui e dashboard sovraccariche.

## 3. Identità e accesso

### Schermata iniziale `/login`

- Titolo Superlega e mascotte/emoji.
- Campo **Animale** (es. Gorilla, Tigre, Blatta, Gufo).
- Campo **Città** (es. Gorla, Catania, Lecco).
- Pulsante **Entra nell'arena**.
- Identità visualizzata come `ANIMALE di CITTÀ` (es. `GORILLA DI GORLA`).
- Persistenza della sessione dopo refresh; logout disponibile.

**Scelta importante:** nome animale e città **non sono credenziali sicure**. Per una piccola app interna, prevedere un **codice di accesso condiviso** configurato lato server, chiesto al primo ingresso, *oltre* ai due campi. Non esporre il codice nelle variabili `NEXT_PUBLIC_*`. Abilitare Supabase Auth anonymous sign-ins, con una sessione distinta per dispositivo, e associare l'utente a un `player` esistente. Il codice condiviso limita gli ingressi, ma non certifica l'identità di chi lo usa: dichiarare questo limite.

L'utente sceglie idealmente **una combinazione animale+città già nel roster**, tramite autocomplete/dropdown. Evitare duplicati dovuti a maiuscole, spazi e accenti. La creazione/modifica del roster è riservata all'organizzatore. Non usare il solo `localStorage` come autorizzazione per scrivere sul DB.

**Permessi MVP:** tutti gli utenti ammessi possono leggere, comporre bozze di partita e usare il generatore; solo l'organizzatore o un utente autorizzato può **confermare/modificare/eliminare risultati e gestire roster/galleria**. Può bastare un ruolo `admin` assegnato server-side. Non basarsi su pulsanti nascosti come misura di sicurezza. Proteggere le operazioni sul DB con RLS + server endpoint/RPC appropriati. La `service_role`/secret key vive soltanto sul server e non arriva mai al browser.

## 4. Schermate funzionali

### 4.1 `/classifica` — Classifica generale

Mostrare due viste con tab:

**Classifica coppie** (aggregata per coppia indipendentemente dall'ordine dei nomi): posizione, componenti, partite, vittorie, pareggi, sconfitte, gol fatti/subiti, differenza reti e punti classifica. Eventualmente mostrare la somma degli ELO dei componenti come indicatore, **non come punteggio persistente della coppia**. Regola punti classifica proposta: vittoria **3**, pareggio **1**, sconfitta **0**; questi punti classifica sono una statistica separata, non un secondo rating/trofeo. Evidenziare il podio.

**Classifica individuale**: posizione, giocatore, ruolo, partite, W/D/L, gol e **ELO/trofei attuali (un unico valore)**. L'ELO è unico per tutti; il filtro ruolo non deve cambiarne il calcolo.

Filtri utili: tutte le partite / stagione, attaccanti / difensori, ordinamento per ELO, punti o vittorie. Aggiungere lista delle ultime partite concluse.

### 4.2 `/ranking` — Marcatori e difensori

Due pannelli/tab separati, **Attaccanti** e **Difensori**. In ognuno due modalità:

1. **Gol-based:** classifica per gol segnati, con numero partite e media gol/partita. Per i difensori includere anche gol subiti e media subiti/partita.
2. **ELO-based:** classifica in ordine decrescente per ELO, con punteggio preciso a una cifra decimale (internamente senza arrotondamenti intermedi).

Top 3 in oro/argento/bronzo; classifica leggibile anche senza grafici. Eventuale mini bar chart, solo se utile. Visualizzare esplicitamente le regole dei bonus/malus in un tooltip o modal «Come funziona l'ELO?».

### 4.3 `/partita` — Segnapunti live

Questa è la schermata principale durante il gioco.

**Setup partita:**

- Selezionare quattro **giocatori distinti** dal roster.
- Squadra A: **1 attaccante + 1 difensore**; Squadra B: **1 attaccante + 1 difensore**.
- Possibilità di partire con una coppia suggerita dal generatore.
- Creare una partita `draft/live` senza modificare ancora ranking e statistiche ufficiali.

**Live scoreboard:**

- Totale grande in alto: **SQUADRA A 0 – 0 SQUADRA B**.
- Quattro contatori individuali (uno per persona) con **+1** e **−1/annulla**.
- Il totale squadra è **sempre derivato** dalla somma dei gol dei suoi due giocatori: mai salvare o modificare un totale indipendente.
- Disabilitare decrementi sotto 0; comandi ottimizzati per touchscreen.
- Salvataggio live di ogni modifica, con debounce/gestione collisioni o aggiornamenti atomici; indicatore di sincronizzazione.
- **Termina partita** apre un riepilogo con quattro marcatori, totali, vincitore e variazioni ELO/trofei previste. Solo **Conferma risultato** rende la partita ufficiale.
- Previsto **Annulla ultima azione** e **Riprendi partita** dopo refresh.

**Concorrenza:** la partita ha un `scorekeeper`/owner: solo lui può modificare i contatori in una data sessione; gli altri possono osservare (eventualmente Realtime). Se è previsto che più telefoni segnino simultaneamente, implementare aggiornamenti atomici e controllo versione; non fare affidamento su incrementi client-side non sincronizzati.

**Pareggi:** consentiti salvo diversa decisione sul regolamento; per i pareggi nessun bonus/malus W/L e nessuno scambio trofei. Non forzare un vincitore.

### 4.4 `/generatore` — Random match bilanciati

- Lista giocatori con checkbox **Presente in ufficio oggi**; selezione rapida «Seleziona tutti» e «Azzera».
- Richiedere almeno **2 attaccanti e 2 difensori**.
- Generare coppie 1 attaccante + 1 difensore e abbinamenti fra squadre.
- ELO squadra = **somma degli ELO individuali** (la media sarebbe equivalente per coppie sempre di 2).
- Obiettivo principale: **minimizzare la differenza assoluta fra ELO delle due squadre**; introdurre randomicità solo fra soluzioni vicine al miglior bilanciamento.
- In output mostrare Squadra A vs Squadra B, ELO di ognuna, differenza, elenco dei giocatori e pulsanti **Rigenera** e **Avvia partita**.
- Evitare ripetizioni immediate della stessa coppia o degli stessi quattro partecipanti quando esistono alternative; non bloccarle se la disponibilità è limitata.
- Se presenti più di quattro giocatori, proporre opzionalmente **un turno di partite** senza riutilizzare giocatori nello stesso turno; i giocatori avanzati restano in panchina. Distribuire le presenze in modo ragionevole nel tempo.
- Salvare nello storico solo le partite effettivamente iniziate/confermate, non ogni proposta generata.

**Algoritmo MVP suggerito:** per 4 presenti, enumerare i 2 abbinamenti possibili dei difensori con gli attaccanti. Per più presenti, campionare combinazioni dei quattro presenti, enumerare i due abbinamenti, assegnare un costo = `abs(eloA - eloB)` + penalità soft per ripetizioni recenti; sorteggiare fra le migliori `N` entro una tolleranza configurabile (es. 5 punti dal minimo). Fissare un seed nei test per risultati deterministici. Niente ML o ottimizzatori complessi.

### 4.5 `/galleria` — Sfottò

- Griglia responsive di immagini con modal per ingrandimento.
- Upload JPG/PNG/WebP, titolo facoltativo, autore, data.
- Conservare su **Supabase Storage** e metadati nel DB.
- Compressione/ridimensionamento client-side quando opportuno, limite dimensione (es. 5 MB) e controllo MIME server-side.
- Ordinamento per più recenti, opzione elimina solo per admin o proprietario se autorizzato.
- Le immagini sono contenuti caricati dai colleghi: considerare consenso, privacy aziendale e possibilità di rimozione.

## 5. Regole ELO — implementazione fedele

### 5.1 Definizioni

- **Un unico punteggio individuale ELO = trofei**, inizialmente `100.0` per ogni giocatore indipendentemente dal ruolo. Non esiste un secondo saldo trofei.
- **Valore minimo assoluto `0`**, mai negativo, nemmeno dopo prestazioni scarse o sconfitta.
- Ruolo fisso nel roster per la stagione: `striker` oppure `defender`.
- Il sistema non usa la formula statistica ELO classica: è un **rating custom cumulativo**, chiamato «ELO Superlega» in UI.
- Si aggiorna **solo alla conferma di una partita conclusa**, sommando il delta prestazione/risultato (§5.2) e il delta sfida per ruolo (§5.3), poi applicando il limite inferiore zero. Nessuna variazione in `draft/live`.
- Calcolare in ordine cronologico le partite concluse (timestamp + id per tie-break). Se una partita storica viene modificata/eliminata, ricalcolare integralmente i rating dallo storico, non sottrarre a mano un delta potenzialmente errato.

### 5.2 Formula per giocatore, per partita

| Evento | Attaccante | Difensore |
|---|---:|---:|
| Gol individuale segnato | `+1.0` per gol | `+2.0` per gol |
| Meno di 4 gol individuali segnati | `−0.5` | — |
| Ogni gol **subito dalla squadra** | — | `−0.3` per gol |
| Squadra subisce meno di 4 gol | — | `+0.5` |
| Vittoria | `+2.0` | `+2.0` |
| Sconfitta | `−2.0` | `−2.0` |
| Pareggio | `0` | `0` |

Formula:

```ts
function eloDelta(input: {
  role: 'striker' | 'defender';
  goalsScored: number;
  teamGoalsConceded: number;
  result: 'win' | 'loss' | 'draw';
}): number {
  const performance = input.role === 'striker'
    ? input.goalsScored - (input.goalsScored < 4 ? 0.5 : 0)
    : 2 * input.goalsScored - 0.3 * input.teamGoalsConceded
      + (input.teamGoalsConceded < 4 ? 0.5 : 0);
  const outcome = input.result === 'win' ? 2 : input.result === 'loss' ? -2 : 0;
  return performance + outcome;
}
```

**Attenzione:** il difensore subisce i **gol totali della squadra avversaria**, non i soli gol segnati dall'attaccante avversario. Attaccanti e difensori della medesima squadra ottengono entrambi lo stesso bonus/malus per il risultato.

### 5.3 Bonus/malus sfida individuale sullo STESSO ELO — CONFERMATO

**Regola confermata:** **trofei ed ELO sono lo stesso punteggio**. Alla formula della §5.2 si **aggiunge** la variazione della sfida, sempre sul medesimo valore individuale. Non creare una valuta, tabella saldo o classifica trofei distinta.

1. Confrontare **attaccante A vs attaccante B** e, separatamente, **difensore A vs difensore B**, usando i rispettivi **ELO prima della partita**.
2. Per ogni confronto: `gap = abs(eloGiocatorePrima - eloAvversarioPrima)`.
3. Fasce: `0 ≤ gap < 10` → **5 punti**; `10 ≤ gap < 20` → **10 punti**; `gap ≥ 20` → **20 punti**.
4. Per ciascun ruolo, **vincitore +N** e **perdente −N**. I due componenti della stessa squadra possono ricevere variazioni differenti perché ogni ruolo ha il proprio gap.
5. Per ogni giocatore: **`eloAfter = max(0, eloBefore + performanceAndResultDelta + challengeDelta)`**. Il `+2/−2` per vittoria/sconfitta della §5.2 **resta applicato**; non sostituirlo con `±N`.
6. Calcolare tutti i gap e i delta dai **quattro ELO pre-partita**, prima di applicare qualsiasi aggiornamento. Poi aggiornare i quattro valori in modo atomico.
7. Pareggio: `challengeDelta = 0` per tutti; resta il delta individuale di prestazione della §5.2.
8. **Mai sotto zero**: se la somma dei delta porterebbe a un numero negativo, applicare esattamente `0`. Per effetto di questo limite, le perdite effettive possono essere inferiori ai guadagni: **non** ridurre il premio del vincitore per compensare.

**Esempio:** A vince. Attaccanti con ELO pre-match 120 e 115 (gap 5): sfida **+5/−5**; difensori con ELO 100 e 76 (gap 24): **+20/−20**. A ciascuno si aggiunge anche il suo bonus/malus della §5.2, poi si applica `max(0, ...)`.

**Esempio limite zero:** un difensore con ELO `3`, prestazione `−1.2`, sconfitta `−2` e sfida `−10` finisce a **0**, non `−10.2`. Il vincitore mantiene il proprio `+10` di sfida.

## 6. Modello dati Supabase

Usare migrazioni SQL versionate. Tabelle suggerite (rinominabili per consistenza):

### `players`

`id uuid PK`, `animal text`, `city text`, `display_name text`, `role enum('striker','defender')`, `active boolean`, `created_at timestamptz`.

- Indice univoco sull'identità normalizzata `(animal,city)`; il `display_name` è derivato, non la chiave logica.
- Nessun ELO mutable come unica fonte di verità; se si usa una cache `current_elo`, deve essere ricostruibile dai match.

### `profiles`

`auth_user_id uuid PK -> auth.users`, `player_id uuid FK -> players`, `is_admin boolean default false`, `created_at`.

- Associazione nickname/supabase UID validata server-side.
- Attenzione: con login anonimo un collega può dichiararsi un animale diverso; se serve identificazione affidabile, passare in futuro a PIN personale o magic link.
- Assegnare admin soltanto in SQL/backoffice o server privilegiato; mai tramite input client.

### `matches`

`id uuid PK`, `status enum('draft','live','completed','cancelled')`, `season_id uuid FK`, `home_striker_id`, `home_defender_id`, `away_striker_id`, `away_defender_id` (tutti FK players), `created_by uuid`, `scorekeeper_id uuid`, `started_at`, `completed_at`, `created_at`, `updated_at`, `version integer default 0`.

Vincoli: quattro ID distinti, ruoli corretti verificati nella funzione di creazione/finalizzazione, nessun completamento duplicato.

### `match_goals`

`match_id uuid FK`, `player_id uuid FK`, `goals integer NOT NULL DEFAULT 0 CHECK (goals >= 0)`, PK `(match_id,player_id)`.

- Esattamente quattro righe, una per partecipante.
- Sia i risultati finali che le statistiche sono derivati da queste righe.

### `seasons`

`id uuid PK`, `name text`, `active boolean`, `created_at`.

**Non creare `trophy_transactions`:** sarebbe un secondo sistema di punti non richiesto. Registrare le variazioni della sfida nella stessa tabella di eventi ELO, così esiste un'unica fonte ricostruibile.

### `gallery_images`

`id uuid PK`, `storage_path text UNIQUE`, `title text`, `uploaded_by uuid`, `created_at`.

Storage bucket `superlega-gallery` con policy appropriate per vedere, caricare ed eliminare file.

### `elo_events` (opzionale ma utile)

`match_id`, `player_id`, `opponent_id`, `elo_before numeric`, `performance_result_delta numeric`, `challenge_gap_before numeric`, `challenge_delta numeric`, `total_requested_delta numeric`, `actual_delta numeric`, `elo_after numeric`, PK `(match_id,player_id)`.

Generare questa tabella da un ricalcolo deterministico dei risultati, non considerarla una fonte indipendente e modificabile. `actual_delta = elo_after - elo_before` può differire da `total_requested_delta` a causa del minimo zero.

## 7. Integrità e sicurezza dati

- Abilitare **RLS per tutte le tabelle** e policy di lettura/scrittura per i ruoli autorizzati.
- Non permettere update diretti ai risultati `completed` dal client.
- Implementare **finalizzazione atomica** tramite RPC transazionale PostgreSQL o server endpoint con transazione DB: controllare autorizzazione, stato, versione, giocatori, contatori, calcolare il risultato, marcare `completed`, applicare/registrare gli effetti una sola volta.
- Le mutazioni devono essere idempotenti: doppio click e retry di rete non devono moltiplicare punti/trofei.
- Modifica/cancellazione match ufficiale solo admin, con conferma e ricalcolo cronologico della stagione.
- Validare dati sul server con Zod o equivalente; non fidarsi del frontend.
- Gestire `updated_at`, collisioni di salvataggio e messaggi d'errore.
- Chiavi pubbliche Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) ammesse sul client, **mai** chiave secret/service-role.
- Per uso interno non esporre pubblicamente immagini e statistiche se non necessario; evitare di interpretare «URL non condiviso» come controllo accessi.

## 8. Struttura progetto suggerita

```text
src/
  app/
    login/
    classifica/
    ranking/
    partita/
    generatore/
    galleria/
    api/                  # solo endpoint necessari
  components/
    layout/
    scoreboard/
    ranking/
    ui/
  lib/
    domain/
      elo.ts              # pure functions
      pairings.ts         # generazione e bilanciamento
      standings.ts        # aggregazione classifiche
      trophies.ts         # configurazione separata
    supabase/
    validations/
  types/
supabase/
  migrations/
  seed.sql
tests/
.env.example
README.md
```

## 9. Piano di implementazione per milestone

### M1 — Fondamenta e UI

- [ ] Bootstrap Next.js/TypeScript/Tailwind/shadcn.
- [ ] Layout responsive, palette Superlega, navigazione e schermata login.
- [ ] Componenti card, podio, tabella ranking, badge ruolo e empty states.
- [ ] Mock data coerenti per tutti i percorsi; nessun dato fittizio spacciato per reale.

**Done:** navigazione completa e interfaccia utilizzabile su smartphone.

### M2 — Supabase e roster

- [ ] Migrazioni DB, seed, variabili ambiente e README setup.
- [ ] Auth/sessione, accesso interno, profili, roster e RLS.
- [ ] Associare nickname esistente a sessione; privilegi admin verificati server-side.

**Done:** utenti e giocatori salvati, refresh persistente, permessi minimi testati.

### M3 — Segnapunti e partite

- [ ] Setup 4 giocatori distinti con ruoli validi.
- [ ] Counter individuali, totale derivato, undo, salvataggio draft/live.
- [ ] Riepilogo, conferma atomica, storico, ripresa da refresh.
- [ ] Test per gare vinte, perse, pareggiate, gol 0, concorrenza/doppia conferma.

**Done:** una partita si può giocare, salvare e confermare senza perdere o duplicare gol.

### M4 — Statistiche ed ELO/trofei unificati

- [ ] Pure functions + test unitari completi dell'algoritmo.
- [ ] Ricalcolo cronologico da match ufficiali e tabelle `elo_events`.
- [ ] Classifiche coppie/individuali, ranking marcatori/difensori.
- [ ] Unico ELO/trofei con **base 100**, formula prestazione + sfida per ruolo (fasce 5/10/20), **minimo zero**, quattro `elo_events` per match e test. Nessun saldo trofei distinto.

**Done:** ogni numero nelle classifiche è riconciliabile con lo storico.

### M5 — Generatore e galleria

- [ ] Checkbox presenze, bilanciamento ELO, anti-ripetizione soft, avvio match.
- [ ] Upload/lista/preview/eliminazione immagini con Storage.
- [ ] Test su numero dispari di presenti, pool piccolo, ruoli insufficienti e formati file.

**Done:** generatore e galleria funzionanti con dati Supabase.

### M6 — Rifinitura e deploy

- [ ] UI mobile, loading/error/empty states, accessibilità.
- [ ] Test end-to-end critici, build production, lint e typecheck.
- [ ] Vercel: env vars corrette, deploy Git-based, verifica su URL reale.
- [ ] README con comandi, istruzioni Supabase, come creare admin, seed, backup e possibili limiti del piano gratuito.

**Done:** app accessibile ai colleghi e pronta a registrare il torneo reale.

## 10. Casi test obbligatori

1. Attaccante segna `3` gol e vince: `+3 −0.5 +2 = +4.5 ELO`.
2. Attaccante segna `4` gol e perde: `+4 −2 = +2.0 ELO` (nessuna penalità sotto soglia).
3. Difensore segna `1`, subisce `3`, vince: `+2 −0.9 +0.5 +2 = +3.6 ELO`.
4. Difensore segna `0`, subisce `4`, perde: `−1.2 −2 = −3.2 ELO` (nessun bonus difesa).
5. In una partita A: attaccante 4 + difensore 2, B: attaccante 3 + difensore 1 → totale **6–4**. Entrambi i difensori ricevono come `goalsConceded` rispettivamente **4 e 6**.
6. Quattro contatori tutti a zero → se si conferma pareggio, bonus risultato `0`, ma si applicano comunque le regole individuali (attaccanti `−0.5`, difensori `+0.5`).
7. Aggiornare un gol `+1` e poi `−1` ritorna allo stato iniziale; mai risultati negativi.
8. Doppia chiamata di conferma stesso match non incrementa due volte il punteggio ELO/trofei.
9. Modifica retroattiva di una partita ricalcola correttamente gli ELO successivi.
10. Generatore con 2 attaccanti e 2 difensori confronta entrambi gli abbinamenti; con meno di 2 per ruolo mostra un errore chiaro.
11. Nessun utente non autorizzato può finalizzare match, modificare roster o eliminare immagini.
12. I bonus sfida si calcolano **solo tra avversari dello stesso ruolo** usando l'ELO pre-partita: gap attaccanti 9.9 → `±5`, gap difensori 10 → `±10`, gap 20 → `±20`.
13. Se A vince con gap attaccanti 5 e gap difensori 24, i soli delta sfida sono: attaccante A `+5`, difensore A `+20`, attaccante B `−5`, difensore B `−20`, **ai quali vanno aggiunti** i delta della §5.2.
14. Il cambio del partner in una partita successiva non azzera né trasferisce ELO: il punteggio rimane proprietà del singolo giocatore.
15. Un giocatore con ELO `3` e delta complessivo `−13.2` finisce a **0**; non esiste un secondo saldo trofei né punteggio negativo.
16. All'inizio della stagione, prima di ogni match, tutti i giocatori hanno **100 ELO/trofei**; quattro giocatori a 100 hanno ciascuno un gap di ruolo pari a zero e sfida `±5` in caso di vittoria/sconfitta.

## 11. Decisioni aperte da sottoporre al proprietario

Queste non devono bloccare la UI iniziale, ma vanno chiuse **prima** di mettere online dati ufficiali:

1. **Regola partita:** si gioca al primo a 10, a tempo, oppure si può concludere con qualsiasi risultato? I pareggi sono ammessi?
2. **Roster:** i giocatori e ruoli sono fissi o si possono cambiare in stagione? In caso di cambio ruolo, come trattare i match storici? Proposta: il ruolo è snapshot al momento della partita.
3. **Classifica principale:** prioritariamente coppie fisse, coppie variabili, oppure solo giocatori? Le schermate supportano tutte e tre, ma la homepage deve sceglierne una.
4. **Accesso:** basta codice condiviso + nickname (facilmente impersonabile) oppure serve PIN personale? Chi può caricare immagini e registrare risultati?

**Già deciso, non chiedere di nuovo:** ELO e trofei coincidono; valore iniziale individuale `100`; minimo `0`; confronto con avversario dello stesso ruolo per bonus sfida `5/10/20`.

## 12. Checklist di consegna

La consegna è completa quando Codex fornisce:

- Repository Next.js con app realmente funzionante.
- Migrazioni Supabase eseguibili e seed **di esempio chiaramente separato** dai risultati reali.
- `.env.example` e README passo-passo, inclusi setup Supabase e Vercel.
- Test della logica ELO e del generatore, più almeno un test flusso match.
- Nessun segreto nel codice e permessi database verificati.
- Elenco esplicito delle decisioni aperte e dei limiti noti.

**Priorità generale:** correttezza dei punteggi > utilizzo semplice da telefono > design > funzionalità extra.

---

## Prompt rapido da incollare in Codex

> Leggi integralmente `SUPERLEGA_CODEX_PLAN.md`. Costruisci l'app Superlega seguendo le milestone in ordine. Inizia ispezionando il repository, poi imposta M1 e M2 con file reali, migrations, `.env.example` e README. Implementa il dominio **ELO = trofei, unico punteggio individuale iniziale 100 e minimo zero**: a ogni partita somma il delta prestazione/risultato e il bonus sfida `±5/10/20` ottenuto confrontando gli ELO pre-partita degli avversari dello stesso ruolo, poi applica `max(0, ...)`. Non creare un secondo saldo trofei. Verifica i test prima di procedere. Preferisci funzionalità complete e verificabili, UI sportiva dark/red/oro mobile-first e codice TypeScript mantenibile. Alla fine di ogni milestone riassumi file cambiati, test eseguiti e prossimi passi.

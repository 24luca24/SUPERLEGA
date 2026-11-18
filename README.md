# SUPERLEGA

Next.js, React e TypeScript per il torneo aziendale di calciobalilla. PostgreSQL e Storage S3 compatibile su Supabase. Interfaccia italiana mobile-first.

## Funzioni e permessi attuali

- 14 giocatori accedono con animale/città. Nessuna registrazione pubblica.
- Un account separato **ROBERTO**, arbitro/admin, non compare fra i giocatori e non ha ELO.
- **Solo Roberto** crea/controlla partite live, usa i contatori, annulla azioni, conferma risultati, corregge o elimina risultati ufficiali. I permessi sono verificati sul server, anche se un client forza i pulsanti o dichiara di essere admin.
- Gli altri utenti vedono la partita in sola lettura, con aggiornamento ogni 3 secondi mentre la pagina è visibile. Possono consultare classifiche, generare proposte e cambiare la propria foto.
- `/partita` per Roberto parte con **Crea partita**, seleziona quattro giocatori distinti (ATT+DIF per squadra) e salva ciascun gol su Supabase. Undo persistente e ripresa dopo refresh. I totali sono derivati dai quattro contatori.
- **Termina partita → Conferma risultato** salva partita, quattro eventi ELO e cache in una transazione. Versioni e UUID delle azioni proteggono collisioni e retry. Il pareggio non può essere confermato.
- `/arbitro` permette correzione ed eliminazione dei risultati, incluse partite importate. Gli ELO vengono ricostruiti cronologicamente; sono conservati audit e backup degli eventi precedenti. L’eliminazione esclude la partita dalle statistiche, conservandola come annullata.
- Classifiche e grafici ELO/gol leggono i dati reali. I punti coppia sono 3 per vittoria, 0 per sconfitta; nessun pareggio.
- `/generatore` usa roster ed ELO reali, checkbox presenze, seleziona tutti/azzera, rigenerazione e avvio del live riservato all’arbitro.
- Foto profilo su bucket privato S3. Upload JPG/PNG/WebP con controllo della firma e limite configurabile fino a 4 MiB. Lettura con URL firmato di 5 minuti.
- **La pagina galleria è ancora dimostrativa**: l’attivazione dello storage delle foto profilo non implementa automaticamente l’album.

## Regole ELO e dati iniziali

Un unico ELO individuale, iniziale 100, minimo zero. Il file Excel contiene 14 giocatori, 30 risultati completi e 10 incontri senza gol. Le 40 righe originali sono archiviate; i 10 incontri incompleti non sono ufficiali.

**Storico Excel (`baseline`)**: costruisce la base ELO con prestazione e risultato, senza scambi sfida. L’ordine delle righe è stato confermato dal proprietario; non sono inventate date storiche.

**Nuove partite (`standard`)**: ereditano la base e aggiungono le sfide ±5/10/20 fra avversari dello stesso ruolo, usando gli ELO pre-partita. Ogni conferma riceve un ordine successivo allo storico. Modifiche ed eliminazioni ricalcolano tutta la sequenza.

CAPOBRANCO/AIRAGHI è attaccante; BRACCONIERE/CHIODINI è difensore. Questa correzione del proprietario prevale sulla nota DIF presente nell’Excel originale. I gol rimangono attribuiti alle stesse persone.

## Logica del generatore

1. Considera soltanto i presenti attivi e richiede almeno due attaccanti e due difensori.
2. Enumera le combinazioni dei quattro partecipanti e i due modi di abbinare attaccanti/difensori.
3. Esclude una coppia se uno dei due ha avuto l’altro come **ultimo compagno personale**, anche se nel frattempo ha saltato partite. Il controllo considera lo storico reale, non le sole ultime due partite globali.
4. Fra i candidati validi minimizza `abs(sommaEloA - sommaEloB)`. Sorteggia fra le migliori soluzioni entro 5 punti dal minimo, evitando la proposta appena mostrata quando ci sono alternative comparabili.
5. Se nessun abbinamento rispetta il cambio compagno, mostra un errore e chiede di cambiare i presenti. Non disattiva la regola silenziosamente.
6. Le proposte non modificano lo storico. All’avvio, il server ricontrolla roster, ruoli e ultimo compagno: se lo storico è cambiato nel frattempo, chiede di rigenerare.

Il seed è fisso nei test e casuale nell’interfaccia. Lo storico annullato non conta per il cambio compagno.

## Avvio locale

Usare Node.js 22.13+ LTS oppure 24 LTS.

```bash
npm install
# Solo se il file ambiente non esiste già:
cp .env.example .env
npm run dev
```

Conservare `.env` esistente. Next e gli script leggono anche `.env.local`, con precedenza. `.env`, `data/roster.local.json` e `data/referee.local.json` sono esclusi da Git: contengono credenziali. Nessun segreto va nelle variabili `NEXT_PUBLIC_*`.

## Supabase e account

`CONNECTION_STRING` usa preferibilmente il Session pooler di Supabase, porta 5432 con TLS. Codificare i caratteri speciali della password nell’URI, oppure usare `[YOUR-PASSWORD]` e valorizzare `DB_PASSWORD`. Le chiavi pubbliche non sono password PostgreSQL.

```bash
npm run db:check
npm run db:setup
npm run db:stage
npm run db:provision
npm run db:referee
npm run data:elo
npm run db:promote
npm run db:verify
```

Lo schema, il roster e i risultati sono già stati caricati nel progetto corrente. **Non rieseguire il seed demo sul database reale.** Non ripetere import/provision a ogni deploy.

- `db:setup`: migrazioni in una transazione, con hash registrati; riconosce la baseline già applicata manualmente.
- `db:stage`: conserva Excel/SHA-256 e le 40 righe, crea utenti giocatori inizialmente disabilitati.
- `db:provision`: legge i 14 accessi da `data/roster.local.json`, assegna i ruoli confermati e invalida le sessioni dei giocatori. Il modello senza password è `data/roster.example.json`.
- `db:referee`: applica le migrazioni, legge username/password dal file locale `data/referee.local.json`, abilita il solo account ROBERTO come admin senza giocatore associato e invalida le sue sessioni precedenti. Nessuna password è inclusa nelle migrazioni SQL.
- `data:elo`: report locale della base Excel, senza scrivere sul DB.
- `db:promote`: importazione iniziale transazionale e idempotente delle 30 partite; non duplica import già ufficializzati e rifiuta sovrascritture di uno storico diverso.
- `db:recalculate`: backup di ELO/eventi e ricostruzione atomica dello storico. Il reset tra più stagioni resta da definire: il comando rifiuta storici multi-stagione.
- `db:verify`: controlla i 14 giocatori più l’arbitro, credenziali, ruoli, cache ELO ricostruita, numero eventi e assenza di accesso DB pubblico. Supporta nuove partite e correzioni/eliminazioni senza confrontare tutto con la sola vecchia base Excel.
- `data:extract`: estrae l’Excel con Python senza pacchetti esterni o esecuzione di macro; una nuova estrazione richiede di riconfermare l’ordine storico.
- `data:compare-elo`: confronta la base con il Python fornito dal proprietario, generando `docs/elo-confronto.md` e il relativo JSON.

Le tabelle hanno RLS e permessi revocati ad `anon`/`authenticated`. Login e autorizzazioni usano sessioni server con cookie HttpOnly di 30 giorni e token memorizzati come hash; password con scrypt. Il ruolo admin viene sempre riletto dal DB. Non serve abilitare Supabase Auth anonimo.

## Storage S3 compatibile

Il progetto corrente usa **Supabase Storage tramite protocollo S3**, non richiede un account AWS separato. Bucket privato `superlega-media` creato e verificato.

Variabili server:

```text
ENDPOINT_S3=https://PROJECT.supabase.co/storage/v1/s3
S3_REGION=REGIONE_DEL_PROGETTO
ACCESS_ID_KEY=ACCESS_KEY_ID_S3
SECRET_ACCESS_KEY=SECRET_ACCESS_KEY_S3
S3_BUCKET=superlega-media
FILE_SIZE=4MB
```

`ACTIVE_KEY` è supportata come vecchio alias dell’Access key ID, ma `ACCESS_ID_KEY` ha precedenza. Servono le credenziali S3 generate in Supabase, non una chiave pubblica/anon del progetto. Sono supportati anche gli alias `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e le variabili standard AWS. Per AWS nativo omettere `ENDPOINT_S3` e impostare regione/credenziali o un ruolo dell’ambiente.

```bash
npm run storage:setup
npm run storage:verify
```

Il setup usa operazioni compatibili con Supabase e verifica che il bucket non sia pubblico. La verifica carica un piccolo file, lo legge anche tramite URL firmato, controlla il rifiuto delle letture anonime e lo elimina. Le credenziali e gli URL firmati non vengono stampati.

`FILE_SIZE` accetta byte oppure unità come `512KB`, `2MB`. Per gli upload via server viene applicato un tetto di 4 MiB, lasciando margine al multipart entro il [limite delle funzioni Vercel](https://vercel.com/docs/functions/limitations). File più grandi richiederebbero upload diretti firmati. L’app non richiede CORS pubblico sul bucket. Riferimento: [compatibilità S3 Supabase](https://supabase.com/docs/guides/storage/s3/compatibility).

## Verifiche

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:smoke
npm run test:live-db
npm run test:scoreboard
```

- Test di dominio e PostgreSQL incorporato PGlite per ELO, storico, permessi, transazioni, retry, undo, correzioni e generatore. Nel test viene omessa soltanto l’estensione pgcrypto, poiché `gen_random_uuid` è già disponibile in PGlite.
- `test:live-db`: flusso reale su Supabase in una transazione poi annullata; non conserva giocatori o risultati fittizi. Richiede l’arbitro configurato e nessuna partita reale in corso.
- `test:scoreboard`: Chrome mobile con accesso reale di Roberto e di un giocatore; le scritture di prova vengono dirottate al vero store su PostgreSQL isolato. Verifica generatore, live, osservatore senza contatori, correzione ed eliminazione. Non modifica risultati reali.

Le prove browser avviano Next temporaneamente sulla porta 3100. Se un server Next è già attivo, passare `SMOKE_ORIGIN` con il suo URL. Il repository non contiene browser scaricati: la prova usa Google Chrome installato.

## Deploy Vercel e limiti rimanenti

Collegare il repository come progetto Next.js, usare una versione Node LTS supportata e configurare `CONNECTION_STRING`, eventuale `DB_PASSWORD` e variabili S3 nell’ambiente Production. Il file `.env` locale non viene caricato automaticamente. Nessun import o seed deve girare durante la build.

Verificare sull’URL pubblicato login, cookie dopo refresh, generatore e avvio partita da Roberto, osservazione da un giocatore e upload foto. Conservare separatamente Excel, credenziali locali e un backup PostgreSQL prima di importazioni o correzioni importanti.

Restano da completare la **galleria** e l’eventuale gestione delle stagioni. Il dominio personalizzato è facoltativo. Limiti di backup/connessioni/storage dipendono dal piano del provider.

## Accesso dalla rete locale

Il server di sviluppo consente l’host `192.168.1.19` tramite `allowedDevOrigins`. È stata rimossa la configurazione opzionale Cache Components/Partial Prefetching che sul collegamento LAN produceva un ciclo `HMR hash mismatch`; le pagine con sessione e DB vengono renderizzate dinamicamente con la configurazione standard Next.

Gli identificativi delle richieste usano `crypto.randomUUID` se disponibile e, su HTTP LAN, UUID v4 ottenuti con `crypto.getRandomValues`. I token di sessione restano generati esclusivamente sul server. Il generatore porta automaticamente a vista proposta o errore; l’avvio apre `/partita?match=ID`, evitando di riutilizzare il segnapunti vuoto di una navigazione precedente.

```bash
SMOKE_ORIGIN=http://192.168.1.19:3001 npm run test:lan
```

Questa verifica usa il browser e le API Supabase reali: crea due partite temporanee senza confermare risultati ufficiali, verifica gol/refresh/undo e avvio dal generatore, quindi elimina soltanto gli ID di prova registrati dallo script. Rifiuta di procedere se esiste già una partita in corso e non elimina mai partite completate. Controlla infine che storico ed ELO siano invariati. La prova isolata `test:scoreboard` può essere eseguita sullo stesso indirizzo per testare anche conferme e correzioni senza toccare risultati reali.

## Icona e aggiunta alla schermata Home

L’immagine fornita `logo-superlega.PNG` è usata intera, senza deformazioni, per le icone dell’app. `npm run icons:generate` rigenera PNG Android 192/512, variante maskable con margine sicuro, icona Apple 180 e favicon 16/32/48. Il comando usa Sharp incluso da Next.js; non modifica l’immagine originale.

`src/app/manifest.ts` definisce identità stabile `/`, nome Superlega, avvio da `/classifica`, scope `/` e apertura `standalone`. Il layout include metadati Apple e tema scuro; la navigazione tiene conto dei margini del notch e dell’indicatore Home. Nel profilo sono presenti le istruzioni per aggiungere l’app alla Home su iPhone/Android.

Usare l’URL pubblico HTTPS dopo il deploy Vercel per l’installazione definitiva. Il collegamento LAN resta destinato alle prove sulla stessa rete. Le funzioni che leggono o salvano dati richiedono connessione: non è stata introdotta una cache offline di sessioni, classifiche o risultati.

### Stabilità del live su Vercel

Il pool applicativo usa al massimo 2 connessioni per istanza, chiude quelle inattive dopo 5 secondi e integra `attachDatabasePool` di Vercel. In produzione Vercel, gli endpoint Supabase condivisi `*.pooler.supabase.com:5432` passano automaticamente alla modalità transazione sulla porta 6543; gli script locali conservano la connessione configurata. Nessuno statement preparato nominato o lock di sessione viene usato. `vercel.json` colloca le funzioni a Dublino, vicino al progetto Supabase attuale (`eu-west-1`).

Ogni lettura live usa una singola query con snapshot coerente e autorizzazioni rilette dal database. Il client aggiorna dopo il completamento della richiesta precedente, sospende le letture a pagina nascosta e durante le scritture, applica timeout e attesa crescente dopo errori, mostrando la riconnessione automatica. Anche le finestre dell’arbitro si sincronizzano senza sovrascrivere un’azione appena salvata con una risposta precedente. Gli errori delle connessioni inattive vengono gestiti; i log contengono codici di errore, senza credenziali.

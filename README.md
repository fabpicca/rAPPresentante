# rAPPresentante

Web app installabile (PWA) per il **rappresentante di classe**. Funziona su telefono e computer,
anche offline, senza account e senza server: i dati restano sul dispositivo.

## Funzioni

- **Rubrica**: alunni con fino a due genitori. Ricerca, chiamata, WhatsApp ed email con un tocco,
  "copia tutte le email" (da incollare in Ccn), export CSV per Excel, import incollando un elenco di nomi.
- **Quote**: raccolte (gita, regalo, materiali) con quota a testa, scadenza e partecipanti.
  Segni chi ha pagato, vedi incassato e mancante e mandi il promemoria con la lista di chi manca.
- **Agenda**: riunioni, consigli di classe, uscite e scadenze. Export `.ics` da importare nel
  calendario del telefono, con un avviso automatico il giorno prima.
- **Verbali**: note delle riunioni, da condividere o copiare.
- **Sondaggi**: registri le risposte raccolte (es. nella chat di classe) e vedi il conteggio e chi manca.
- **Backup / ripristino** in JSON, con promemoria in home se l'ultimo backup ha più di 30 giorni.

## Limiti da conoscere

- **I dati sono solo nel browser del dispositivo.** Se cancelli i dati di navigazione, disinstalli
  l'app o cambi telefono senza un backup, li perdi. Telefono e PC non si sincronizzano tra loro:
  per passare da uno all'altro usa backup e ripristino.
- Su iPhone, Safari può cancellare i dati dei siti non usati da settimane. Se l'app è
  **aggiunta alla schermata Home**, questo non succede.
- Non ci sono notifiche push: per i promemoria usa l'export `.ics` nel calendario.
- La rubrica contiene dati personali di altre famiglie: tieni i backup in un posto protetto.

## Pubblicazione (GitHub Pages)

1. Su GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, scegli il branch e la cartella `/ (root)`.
2. Apri l'indirizzo `https://<utente>.github.io/<repo>/` dal telefono.
3. Installa: su Android apri il menu ⋮ e scegli **Installa app**; su iPhone tocca **Condividi → Aggiungi alla schermata Home**.

Il repository è pubblico, ma l'app no: ognuno vede solo i dati che ha inserito sul proprio dispositivo.

## Sviluppo

Nessuna dipendenza e nessuna build: HTML, CSS e JavaScript (moduli ES).

```sh
npm start   # server locale su http://localhost:8080
npm test    # test della logica (Node 18+)
```

- `js/logic.js`: logica pura (importi, CSV, ICS, conteggi), coperta dai test
- `js/app.js`: viste, router e azioni
- `js/store.js`: salvataggio in `localStorage`
- `sw.js`: cache offline. **Incrementa `VERSION` a ogni rilascio.**

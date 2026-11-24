# Anteprima Contenomy Venditore · Gate 2

Questa cartella è **la radice di un repository statico autonomo**. Comprende le 15 pagine dell'audit, le dipendenze locali risolte e il solo pacchetto Tema richiesto dall'editor. La struttura delle directory riproduce i percorsi originali. Le pagine sorgente non sono state modificate. I backup, i report, gli script di audit e le altre sorgenti Tema sono esclusi.

## Pubblicazione

1. Estrai lo ZIP e carica **il contenuto di questa cartella**, incluso `index.html`, alla radice di un nuovo repository GitHub. Mantieni identiche le cartelle `00_design_system`, `design-system` e `Temi`. Non caricare soltanto lo ZIP nel repository.
2. In Vercel scegli **Add New → Project → Import Git Repository**. Seleziona il repository, `Root Directory` = radice, `Framework Preset` = `Other`, `Build Command` = override vuoto, `Output Directory` = `.`. Non è richiesto un framework né un'installazione.
3. Apri l'URL generato e verifica che `index.html` mostri 15 link, quindi apri una pagina normale e `bottega-editor.html`. Copia l'URL base delle prove nell'handoff runtime già preparato.

Una repository privata su GitHub **non rende privata** l'anteprima web. Imposta `Settings → Deployment Protection` sul progetto Vercel in base all'accesso che vuoi concedere. In particolare il dominio di produzione può restare pubblico con la protezione Standard del piano Hobby. Questa anteprima contiene solo sorgenti statiche e dati dimostrativi; valuta la visibilità prima di condividerla.

## Controllo della baseline

`SOURCE_HASHES.json` elenca SHA-256 per tutti i file copiati. Le 15 pagine e le dipendenze corrispondono alle impronte di `scope.json` alla data indicata; `index.html`, questo README e il manifesto sono file nuovi di servizio. Per verificare un file online, scaricalo e confronta l'impronta con il manifesto. Per la verifica completa nel progetto di audit servono ancora i controlli di preflight indicati in `HANDOFF.md`.

Questa pubblicazione **non supera il Gate 2**: le verifiche nel browser rimangono 0/15 pagine e 0/92 gruppi finché le osservazioni non sono raccolte e confrontate. `ordini.html:402` ha una destinazione mancante nella baseline e i parametri `nuovo`, `ritorno`, `prodotto` emessi dall'editor sono da verificare in `prodotti.html`.

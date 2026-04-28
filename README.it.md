# ghòstati | Face Lab

**Laboratorio Web AR per lo sviluppo e il test in tempo reale di trucco anti-riconoscimento biometrico (CV Dazzle).**

![ghòstati](facerec-transparency.png)

## Panoramica

**ghòstati** (dal repository `antagonistrucco`) è una piattaforma sperimentale e uno strumento diagnostico progettato per contrastare gli algoritmi di riconoscimento facciale. Applicando specifici pattern di trucco (ispirati al concetto di CV Dazzle), gli utenti possono esplorare come i modelli di computer vision interpretano i landmark facciali e tentare di offuscare la propria identità digitale in tempo reale.

Il progetto presenta un'architettura modulare basata su plugin, la quale permette a qualsiasi sviluppatore di scrivere script di trucco AR personalizzati ("Ghostyles") e di testarne l'efficacia contro i modelli di riconoscimento direttamente nel browser sia tramite la webcam live sia tramite un file video locale caricato dall'utente.

## Funzionalità Principali

- **Live Face Tracking:** Rilevamento dei landmark facciali in tempo reale direttamente nel browser utilizzando `face-api.js`.
- **Flusso a Doppia Sorgente:** Puoi partire dalla webcam live oppure caricare un file video locale. I file locali usano un flusso in due fasi: una fase di selezione per scorrere il video e scegliere il punto di partenza, seguita da una fase overlay per eseguire tracking dei landmark e rendering dei Ghostyle in tempo reale.
- **Sistema di Plugin Modulare (Ghostyles):** Carica dinamicamente effetti di trucco AR personalizzati. I plugin possono essere ospitati localmente o tramite URL remoto. Alcuni effetti inclusi:
  - Graphic Liner, Smokey Eyes, Blush Lift, Lip Tint, Soft Contour, Stage Mask, Splash, etc.
- **Modalità Diagnostica ("Scansione Trucco"):** Testa l'efficacia del tuo camouflage AR. Lo strumento valuta l'opacità del trucco, cattura il volto alterato e calcola la probabilità di corrispondenza rispetto ai profili salvati per determinare se il sistema di riconoscimento è stato ingannato.
- **Salva e Confronta (Enrolling):** Salva un volto di base iniziale e confrontalo con il feed live della webcam per verificare se l'algoritmo di face matching ti riconosce ancora dopo aver applicato il camuffamento.
- **Privacy-First:** Tutte le elaborazioni vengono eseguite localmente sul computer, senza caricare dati biometrici o file video su server remoti.

## Installazione

Trattandosi di un'applicazione web statica, non è necessario alcun passaggio di "build".

1. Clona il repository:
   ```bash
   git clone https://github.com/vecna/antagonistrucco.git
   cd antagonistrucco
   ```
2. Avvia un server web HTTP locale nella cartella:
   ```bash
   npx http-server . 
   # oppure
   python3 -m http.server 8000
   ```
3. Apri un browser moderno e vai all'indirizzo `http://localhost:8000/ghostati-face-api.html`.
4. Scegli `Avvia Webcam` per il flusso live, oppure carica un file con `Carica Video (Locale)`.
5. Se usi un file locale, scorri il video nella fase di selezione e poi premi `AVVIA OVERLAY` per avviare tracking e rendering.

## Uso Dei File Video Locali

- L'analisi dei file video locali avviene interamente nel browser e non carica il media su servizi esterni.
- Durante la fase di selezione il video espone i controlli nativi del browser, così puoi scegliere il punto di partenza prima di avviare l'overlay.
- File lunghi, ad alta risoluzione o in 4K possono saturare la memoria del browser. L'interfaccia mostra un indicatore del JS heap per aiutare a capire quando il clip è troppo pesante per la sessione corrente.
- Quando torni alla webcam, la sorgente file viene rilasciata e l'object URL associato viene revocato.

## Sviluppare un Ghostyle (Plugin)

Puoi creare i tuoi effetti modulari di trucco AR chiamati **Ghostyles**. Un "Ghostyle" è un semplice modulo JavaScript che esporta una funzione di disegno atta ad agganciarsi al motore di face tracking.

Per sviluppare un nuovo Ghostyle:
1. Fai una copia di `./ghostyles/00-template.js`.
2. Implementa la tua logica su canvas basandoti sui landmark facciali forniti ad ogni frame.
3. Testalo dal vivo incollando l'URL locale/remoto nel box "Carica Ghostyle Remoto" nella pagina!

Consulta la pagina `ghostati-docs.html` per una documentazione più avanzata sullo sviluppo dei Ghostyles.

## Contesto

Presentato all'interno del **Festival di NINA**, questo strumento mira a sensibilizzare l'opinione pubblica riguardo la sorveglianza biometrica e l'uso delle tecnologie di riconoscimento facciale.

---
*Per la versione in inglese, consulta [README.md](README.md).*

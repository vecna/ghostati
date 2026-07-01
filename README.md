# Ghòstati | Face Lab

Laboratorio di trucco avversario\* per ingannare il riconoscimento facciale agendo su pochi punti del tuo volto.


\* Come tradurreste voi "adversarial makeup" ? trucco antagonista? trucco avversariale? 

## Ispirato alle ricerche di (References)

- [DAZZLE](https://www.michelletylicki.info/dazzle/) — Michelle Tylicki, Lauri Love (2023). Camouflage facciale come gesto estetico-politico contro la sorveglianza biometrica. *artistico*
- [CV Dazzle](https://adam.harvey.studio/cvdazzle/) — Adam Harvey (2010). Metodo iconico di trucco/hairstyle per disturbare il rilevamento facciale automatico. *artistico*
- [The Dazzle Club](https://emilyroderick.com/work/the-dazzle-club/) — Evie Price, Emily Roderick, Georgina Rowlands, Anna Hart (2019). Azioni urbane contro il riconoscimento facciale con mascheramento creativo. *artistico*
- [Adv-Makeup: A New Imperceptible and Transferable Attack on Face Recognition](https://arxiv.org/abs/2105.03162) — Bangjie Yin et al. (2021). Attacco makeup trasferibile e poco percettibile contro sistemi di face recognition. *pubblicazione*
- [Accessorize to a Crime: Real and Stealthy Attacks on State-of-the-Art Face Recognition](https://doi.org/10.1145/2976749.2978392) — Mahmood Sharif, Sruti Bhagavatula, Lujo Bauer, Michael K. Reiter (2016). Attacchi fisici stealth con accessori contro modelli di riconoscimento facciale. *pubblicazione*
- [HyperFace](https://adam.harvey.studio/hyperface/) — Adam Harvey (2016). Pattern tessili che massimizzano falsi positivi dei detector facciali. *artistico*
- [Adversarial Generative Nets: Neural Network Attacks on State-of-the-Art Face Recognition](https://arxiv.org/abs/1801.00349) — Mahmood Sharif, Sruti Bhagavatula, Lujo Bauer, Michael K. Reiter (2017). Approccio generativo per perturbare in modo mirato il riconoscimento del volto. *pubblicazione*
- [Adversarial Attacks against Face Recognition: A Comprehensive Study](https://arxiv.org/abs/2007.11709) — Fatemeh Vakhshiteh, Ahmad Nickabadi, Raghavendra Ramachandra (2020). Survey completo su tecniche di attacco ai sistemi di riconoscimento facciale. *pubblicazione*
- [VLA: A Practical Visible Light-based Attack on Face Recognition Systems in Physical World](https://doi.org/10.1145/3351261) — Meng Shen, Zelin Liao, Liehuang Zhu, Ke Xu, Xiaojiang Du (2019). Attacco fisico con luce visibile per degradare l'identificazione facciale. *pubblicazione*
- [Adversarial Robustness Toolbox v1.0.0](https://arxiv.org/abs/1807.01069) — Maria-Irina Nicolae et al. (2018). Libreria per valutare robustezza e attacchi avversari in pipeline ML. *altro*
- [Adversarial Patch](https://arxiv.org/abs/1712.09665) — Tom B. Brown, Dandelion Mané, Aurko Roy, Martín Abadi, Justin Gilmer (2017). Patch fisiche stampabili che causano errori di classificazione robusti. *pubblicazione*
- [Adversarial Manipulation of Deep Representations](https://arxiv.org/abs/1511.05122) — Sara Sabour, Yanshuai Cao, Fartash Faghri, David J. Fleet (2015). Manipolazione di rappresentazioni profonde per obiettivi avversari. *pubblicazione*
- [DPatch: An Adversarial Patch Attack on Object Detectors](https://arxiv.org/abs/1806.02299) — Xin Liu, Huanrui Yang, Ziwei Liu, Linghao Song, Hai Li, Yiran Chen (2018). Patch avversaria fisica per compromettere object detector in scena reale. *pubblicazione*
- [ShapeShifter: Robust Physical Adversarial Attack on Faster R-CNN Object Detector](https://arxiv.org/abs/1804.05810) — Shang-Tse Chen, Cory Cornelius, Jason Martin, Duen Horng Chau (2018). Esempi fisici robusti contro detector basati su Faster R-CNN. *pubblicazione*
- [Breaking certified defenses: Semantic adversarial examples with spoofed robustness certificates](https://arxiv.org/abs/2003.08937) — Amin Ghiasi, Ali Shafahi, Tom Goldstein (2020). Dimostra limiti delle difese certificate con esempi avversari semantici. *pubblicazione*
- [Physical-World Optical Adversarial Attacks on 3D Face Recognition](https://arxiv.org/abs/2205.13412) — Yanjie Li, Yiquan Li, Xuelong Dai, Songtao Guo, Bin Xiao (2022). Attacchi ottici nel mondo fisico contro riconoscimento facciale 3D. *pubblicazione*
- [Human-Imperceptible Physical Adversarial Attack for NIR Face Recognition Models](https://arxiv.org/abs/2504.15823) — Songyan Xie, Jinghang Wen, Encheng Su, Qiucheng Yu (2025). Attacco fisico quasi impercettibile su modelli NIR per il volto. *pubblicazione*
- [Accessorize in the Dark: A Security Analysis of Near-Infrared Face Recognition](https://doi.org/10.1007/978-3-031-51479-1_3) — Amit Cohen, Mahmood Sharif (2024). Analisi di sicurezza su riconoscimento facciale near-infrared e bypass pratici. *pubblicazione*
- [The Camera Shy Hoodie](https://www.macpierce.com/the-camera-shy-hoodie) — Mac Pierce (2023). Capo wearable pensato per disturbare cattura e analisi visiva. *artistico*

# Ecco a voi: Ghòstati!

![Ghòstati](facerec-transparency.png)

## Panoramica

**Ghòstati** è una piattaforma sperimentale e uno strumento diagnostico progettato per contrastare gli algoritmi di riconoscimento facciale. Applicando specifici pattern di trucco (ispirati al concetto di CV Dazzle), gli utenti possono esplorare come i modelli di computer vision interpretano i landmark facciali e tentare di offuscare la propria identità digitale in tempo reale.

Il progetto presenta un'architettura modulare basata su plugin, la quale permette a qualsiasi sviluppatore di scrivere script di trucco AR personalizzati ("Ghostyles") e di testarne l'efficacia contro i modelli di riconoscimento direttamente nel browser tramite la webcam.

## Funzionalità Principali

- **Live Face Tracking:** Rilevamento dei landmark facciali in tempo reale direttamente nel browser utilizzando `face-api.js`.
- **Sistema di Plugin Modulare (Ghostyles):** Carica dinamicamente effetti di trucco AR personalizzati. I plugin possono essere ospitati localmente o tramite URL remoto. Alcuni effetti basilari (che non ostacolano il riconoscimento ma aiutano a capire il funzionamento del codice) sono :
  - Graphic Liner, Smokey Eyes, Blush Lift, Lip Tint, Soft Contour, Stage Mask, Splash, etc.
  - La pagina di documentazione dei plug-in: https://sindacato.nina.watch/ghostati/ghostati-docs.html
- **Modalità Diagnostica ("Scansione Trucco"):** Testa l'efficacia del tuo camouflage AR. Lo strumento valuta l'opacità del trucco, cattura il volto alterato e calcola la probabilità di corrispondenza rispetto ai profili salvati per determinare se il sistema di riconoscimento è stato ingannato.
- **Salva e Confronta (Enrolling):** Salva un volto di base iniziale e confrontalo con il feed live della webcam per verificare se l'algoritmo di face matching ti riconosce ancora dopo aver applicato il camuffamento.
- **Privacy-First:** Tutte le elaborazioni vengono eseguite localmente sul computer, senza caricare dati biometrici su server remoti.

## Installazione

Trattandosi di un'applicazione web statica, non è necessario alcun passaggio di "build", e si può testare online a [https://sindacato.nina.watch/ghostati](https://sindacato.nina.watch/ghostati).

1. Clona il repository:
   ```bash
   git clone https://github.com/vecna/ghostati.git
   cd ghostati
   ```
2. Avvia un server web HTTP locale nella cartella:
   ```bash
   npx http-server . 
   # oppure
   python3 -m http.server 8000
   ```
3. Apri un browser moderno e vai all'indirizzo `http://localhost:8000/ghostati-face-api.html`.

## Sviluppare un Ghostyle (Plugin)

Puoi creare i tuoi effetti modulari di trucco AR chiamati **Ghostyles**. Un "Ghostyle" è un semplice modulo JavaScript che esporta una funzione di disegno atta ad agganciarsi al motore di face tracking.

Per sviluppare un nuovo Ghostyle:
1. Fai una copia di `./ghostyles/00-template.js`.
2. Implementa la tua logica su canvas basandoti sui landmark facciali forniti ad ogni frame.
3. Testalo dal vivo incollando l'URL locale/remoto nel box "Carica Ghostyle Remoto" nella pagina!

Consulta la pagina `ghostati-docs.html` per una documentazione più avanzata sullo sviluppo dei Ghostyles.

## *Contesto a Maggio 2026*

Presentato all'interno del **Festival di NINA**, questo strumento mira a sensibilizzare l'opinione pubblica riguardo la sorveglianza biometrica e l'uso delle tecnologie di riconoscimento facciale.

---
*Per la versione in inglese, consulta [README.md](README.md).*

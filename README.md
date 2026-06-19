## Status
![Unit Test Coverage](https://img.shields.io/badge/coverage-16.78%25-lightgrey)

# ghòstati | Face Lab

**Web AR laboratory for the development and real-time testing of anti-biometric facial recognition camouflage (CV Dazzle).**

![ghòstati](facerec-transparency.png)

## Overview
![Unit Test Coverage](https://img.shields.io/badge/coverage-20.84%25-lightgrey)

**ghòstati** is an experimental platform and diagnostic tool designed to counter facial recognition algorithms. By applying specific makeup patterns (inspired by the CV Dazzle concept), users can explore how computer vision models interpret facial landmarks and attempt to anonymize their digital footprint in real time. 

The project features a fully modular, plugin-based architecture, allowing any developer to write custom AR makeup scripts ("Ghostyles") and test their efficiacy against recognition models directly in the browser via their webcam.



## Features
![Unit Test Coverage](https://img.shields.io/badge/coverage-11.90%25-lightgrey)

- **Live Face Tracking:** Real-time facial landmark detection directly in the browser utilizing `face-api.js`.
- **Modular Plugin System (Ghostyles):** Load custom AR makeup effects dynamically. Plugins can be hosted locally or loaded via a remote URL. Included effects: 
  - Graphic Liner, Smokey Eyes, Blush Lift, Lip Tint, Soft Contour, Stage Mask, Splash, etc.
- **Diagnostic Mode ("Scansione Trucco"):** Test the effectiveness of your AR camouflage. The tool evaluates makeup opacity, captures the altered face, and computes matching likelihood against saved profiles to determine if the face recognition system is successfully spoofed.
- **Save & Compare:** Save an initial baseline face and compare live webcam feeds to it to check if the face matching algorithm still recognizes you after applying the camouflage.
- **Privacy-First:** All processing is done locally on the client interface without uploading biometric data to remote servers.

## Getting Started
![Unit Test Coverage](https://img.shields.io/badge/coverage-100.00%25-lightgrey)

Since it's a static web application, there is no build step required.

1. Clone the repository:
   ```bash
   git clone https://github.com/vecna/antagonistrucco.git
   cd antagonistrucco
   ```
2. Serve the directory with a local HTTP server:
   ```bash
   npx http-server . 
   # or
   python3 -m http.server 8000
   ```
3. Open a modern browser and navigate to `http://localhost:8000/ghostati-face-api.html`.

## Writing a Ghostyle (Plugin)
![Unit Test Coverage](https://img.shields.io/badge/coverage-7.37%25-lightgrey)

You can create your own modular AR makeup effects called **Ghostyles**. A "Ghostyle" is a simple JavaScript module that exports a draw function hooking into the face tracking engine. 

To develop a new Ghostyle:
1. Copy the `./ghostyles/00-template.js`.
2. Implement your custom canvas drawing logic based on the provided facial landmarks.
3. Test it live by pasting your local/remote URL into the "Carica Ghostyle Remoto" diagnostic box!

See the `ghostati-docs.html` page for more advanced documentation on Ghostyle development.

## Context
![Unit Test Coverage](https://img.shields.io/badge/coverage-7.37%25-lightgrey)

Presented as part of the **NINA Festival**, this tool aims to raise awareness regarding biometric surveillance and facial recognition technologies.

---
*For the Italian version, please see [README.it.md](README.it.md).*

















**Last commit:** `6e6617c` – ultimi bug fix dopo il primo refactor

































## Recent changes
- `6e6617c` ultimi bug fix dopo il primo refactor
- `4099089` primo refactor completo, modularizzato
- `1a5c8e9` refactor quasi completato
- `a794558` mosse le funzioni sulla webcam in file dedicato
- `6e805f9` mosse funzioni in engine.js, refactor in corso
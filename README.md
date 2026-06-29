## Status
![Unit Test Coverage](https://img.shields.io/badge/coverage-53.45%25-lightgrey)
# ghòstati! | the _Face Confusion Assistant?_

This is a: Web AR laboratory for the development and real-time testing of anti-biometric facial recognition camouflage (also known as, Computer Vision Dazzle).

![ghòstati](facerec-transparency.png)

## Overview

**ghòstati** is an experimental platform and diagnostic tool designed to counter facial recognition algorithms. By applying specific makeup patterns (inspired by the CV Dazzle concept), users can explore how computer vision models interpret facial landmarks and attempt to anonymize their digital footprint in real time. 

The project features a fully modular, plugin-based architecture, allowing any developer to write custom AR makeup scripts ("Ghostyles") and test their efficiacy against recognition models directly in the browser via their webcam.



## Features
- **Live Face Tracking:** Real-time facial landmark detection directly in the browser utilizing `face-api.js`.
- **Modular Plugin System (Ghostyles):** Load custom AR makeup effects dynamically. Plugins can be hosted locally or loaded via a remote URL. Included effects: 
  - Graphic Liner, Smokey Eyes, Blush Lift, Lip Tint, Soft Contour, Stage Mask, Splash, etc.
- **Diagnostic Mode ("Scansione Trucco"):** Test the effectiveness of your AR camouflage. The tool evaluates makeup opacity, captures the altered face, and computes matching likelihood against saved profiles to determine if the face recognition system is successfully spoofed.
- **Save & Compare:** Save an initial baseline face and compare live webcam feeds to it to check if the face matching algorithm still recognizes you after applying the camouflage.
- **Privacy-First:** All processing is done locally on the client interface without uploading biometric data to remote servers.

## Getting Started

Since it's a static web application, there is no build step required.

1. Clone the repository:
   ```bash
   git clone https://github.com/vecna/ghostati.git
   cd ghostati
   ```
2. Serve the directory with a local HTTP server:
   ```bash
   npx http-server . 
   # or
   python3 -m http.server 8000
   ```
3. Open a modern browser, ensure to have a webcam, and navigate to `http://localhost:8000/ghostati.html`.

## Generating Documentation

This project uses [JSDoc](https://jsdoc.app/) to generate documentation for the source code.

To generate the documentation, run the following command:
```bash
npm run docs
```
This will parse the JSDoc comments in the `scripts/` directory and generate a static HTML website in the `docs/` folder. You can open `docs/index.html` in your browser to view the documentation.

## Writing a Ghostyle (Plugin)

You can create your own modular AR makeup effects called **Ghostyles**. A "Ghostyle" is a simple JavaScript module that exports a draw function hooking into the face tracking engine. 

To develop a new Ghostyle:
1. Copy the `./ghostyles/00-template.js`.
2. Implement your custom canvas drawing logic based on the provided facial landmarks.
3. Test it live by editing the `ghostylist.json` file
4. Open a PR to get it distributed - this can't get any easy at the moment.

See the `ghostati-docs.html` page for more advanced documentation on Ghostyle development.

## Context

Presented as part of the **NINA Festival**, this tool aims to raise awareness regarding biometric surveillance and facial recognition technologies.

---
*For the Italian version, please see [README.it.md](README.it.md).*


























**Last commit:** `4d404cb` – Merge pull request #8 from vecna/refactor/inclusions



















































## Recent changes
- `4d404cb` Merge pull request #8 from vecna/refactor/inclusions
- `18f2acd` Merge remote-tracking branch 'origin/online' into refactor/inclusions
- `a8d5c7c` revisited the inclusion logic
- `4ee7943` took back the 2D landmark view
- `75c7dba` fixed doc visualization
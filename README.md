# ghòstati | Face Lab

**Web AR laboratory for the development and real-time testing of anti-biometric facial recognition camouflage (CV Dazzle).**

![ghòstati](facerec-transparency.png)

## Overview

**ghòstati** (from the repository `antagonistrucco`) is an experimental platform and diagnostic tool designed to counter facial recognition algorithms. By applying specific makeup patterns (inspired by the CV Dazzle concept), users can explore how computer vision models interpret facial landmarks and attempt to anonymize their digital footprint in real time. 

The project features a fully modular, plugin-based architecture, allowing any developer to write custom AR makeup scripts ("Ghostyles") and test their efficiacy against recognition models directly in the browser either via the live webcam or via a locally uploaded video file.

## Features

- **Live Face Tracking:** Real-time facial landmark detection directly in the browser utilizing `face-api.js`.
- **Dual Source Workflow:** You can start from the live webcam or load a local video file. Local files use a two-step flow: a selection phase for scrubbing and choosing the source segment, then an overlay phase for real-time landmark tracking and Ghostyle rendering.
- **Modular Plugin System (Ghostyles):** Load custom AR makeup effects dynamically. Plugins can be hosted locally or loaded via a remote URL. Included effects: 
  - Graphic Liner, Smokey Eyes, Blush Lift, Lip Tint, Soft Contour, Stage Mask, Splash, etc.
- **Diagnostic Mode ("Scansione Trucco"):** Test the effectiveness of your AR camouflage. The tool evaluates makeup opacity, captures the altered face, and computes matching likelihood against saved profiles to determine if the face recognition system is successfully spoofed.
- **Save & Compare:** Save an initial baseline face and compare live webcam feeds to it to check if the face matching algorithm still recognizes you after applying the camouflage.
- **Privacy-First:** All processing is done locally on the client interface without uploading biometric data or local video files to remote servers.

## Getting Started

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
4. Choose `Avvia Webcam` for the live camera flow, or upload a local file with `Carica Video (Locale)`.
5. If you load a file, scrub to the point you want to analyze during selection mode, then press `AVVIA OVERLAY` to start tracking and rendering.

## Working With Local Video Files

- Local video analysis is performed entirely in-browser and does not upload media anywhere.
- Uploaded files expose native video controls during the selection phase so you can choose the starting point before the overlay loop begins.
- Long, high-resolution, or 4K files can exhaust browser memory. The interface exposes a JS heap readout to help detect when a clip is too heavy for the current browser session.
- When you switch back to the webcam, the file source is released and its object URL is revoked.

## Writing a Ghostyle (Plugin)

You can create your own modular AR makeup effects called **Ghostyles**. A "Ghostyle" is a simple JavaScript module that exports a draw function hooking into the face tracking engine. 

To develop a new Ghostyle:
1. Copy the `./ghostyles/00-template.js`.
2. Implement your custom canvas drawing logic based on the provided facial landmarks.
3. Test it live by pasting your local/remote URL into the "Carica Ghostyle Remoto" diagnostic box!

See the `ghostati-docs.html` page for more advanced documentation on Ghostyle development.

## Context

Presented as part of the **NINA Festival**, this tool aims to raise awareness regarding biometric surveillance and facial recognition technologies.

---
*For the Italian version, please see [README.it.md](README.it.md).*

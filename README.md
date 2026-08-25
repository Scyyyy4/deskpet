# DeskPet

A tiny always-on-top desktop pet built with **Tauri 2 + React**.

Standalone starter app — later it can be attached to [QuizDesk](https://github.com/Scyyyy4/quizdesk) as a second transparent window.

## Features (v0.1)

- Transparent, borderless, always-on-top window
- Drag anywhere on the pet to move it
- Click to cycle moods: idle → happy → sleep
- Right-click for menu (change mood / quit)
- Hidden from the taskbar

## Run

Requires [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Rust + platform WebView deps).

```bash
git clone https://github.com/Scyyyy4/deskpet.git
cd deskpet
npm install
npm run tauri dev
```

Build installers:

```bash
npm run tauri build
```

## Notes

- On macOS, transparency uses `macOSPrivateApi`.
- Linux needs `webkit2gtk` / related packages from Tauri’s Linux prerequisites.
- This is intentionally minimal so it can be merged into QuizDesk later.

# DeskPet 🐣

A tiny companion that lives on your desktop.

No browser tab. No taskbar icon. Just a small transparent window with a cheerful blob, floating above your apps while you work, study, or procrastinate.

Built with **Tauri 2 + React**. Desktop only — Windows, macOS, and Linux.

---

## What it does

| Action | What happens |
|--------|----------------|
| **Drag** | Move the pet anywhere on screen |
| **Click** | Cycle moods: idle → happy → sleep |
| **Right-click** | Open menu (change mood / quit) |

The window is borderless, transparent, and stays on top — like a classic desk pet, not a normal app window.

---

## Download (easiest)

No Node.js needed. Grab a build from **[Releases](https://github.com/Scyyyy4/deskpet/releases)**:

| System | Pick this file |
|--------|----------------|
| **Windows** | `.msi` or `.exe` |
| **macOS (Apple silicon)** | `.dmg` with `aarch64` |
| **macOS (Intel)** | `.dmg` with `x86_64` |
| **Linux** | `.deb` or `.AppImage` |

Install, open **DeskPet**, and you're done.

> **macOS:** If macOS says it can't verify the developer, go to **System Settings → Privacy & Security** and allow the app to open.

> **Linux (Wayland):** If the pet doesn't stay on top, try launching with X11:
> ```bash
> env WAYLAND_DISPLAY= GDK_BACKEND=x11 DeskPet
> ```

---

## Run from source

For tinkering, skin swaps, or new animations.

**Requires:** Node 18+, [Tauri prerequisites](https://tauri.app/start/prerequisites/)

```bash
git clone https://github.com/Scyyyy4/deskpet.git
cd deskpet
npm install
./scripts/dev-x11.sh   # Linux Wayland — keeps always-on-top working
# or: npm run tauri:dev
```

Build installers locally:

```bash
npm run tauri:build
```

---

## Roadmap ideas

This is a standalone pet — not tied to any other app. Possible next steps:

- Custom sprites / GIF / Live2D
- Walk along screen edges
- System tray + auto-start
- Speech bubbles & idle chatter

Feel free to fork, reskin, or extend.

---

## Stack

React · TypeScript · Vite · Tauri 2

## License

Use and modify freely. Have fun with your desk buddy.

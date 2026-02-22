# Electron Kiosk Mode (Guaranteed Startup Audio)

This project now includes an Electron wrapper that disables autoplay gesture requirements, so music and firework sounds can start from launch in a controlled environment.

## 1) Add your background music file

1. Create `media/` in this project root.
2. Put your file there, for example:
   - `media/ramadan-instrumental.mp3`
   - `media/ramadan-instrumental.ogg`
3. Keep the same names, or update the `<audio><source ...></audio>` paths in `index.html`.

## 2) Install dependencies

```bash
npm install
```

## 3) Run desktop window mode

```bash
npm start
```

## 4) Run true kiosk mode

```bash
npm run kiosk
```

Kiosk mode uses:
- Chromium autoplay policy: `no-user-gesture-required`
- Background throttling disabled for stable animation/audio timing

## 5) Optional developer mode

```bash
npm run dev
```

This opens DevTools automatically.

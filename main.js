"use strict";

const path = require("path");
const { app, BrowserWindow } = require("electron");

const isKioskMode = process.argv.includes("--kiosk");
const isDevMode = process.argv.includes("--dev");

// Critical for guaranteed autoplay in a controlled environment.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Keep rendering/audio active even when window focus changes in kiosk use.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    kiosk: isKioskMode,
    fullscreen: isKioskMode,
    autoHideMenuBar: true,
    backgroundColor: "#03112f",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));

  if (!isKioskMode) {
    win.maximize();
  }

  win.webContents.on("did-finish-load", () => {
    // Backup start attempt from main process to avoid race conditions.
    win.webContents
      .executeJavaScript(
        `
          (() => {
            const music = document.getElementById("bg-music");
            if (!music) return;
            music.muted = false;
            music.volume = 0.24;
            void music.play();
          })();
        `,
        true
      )
      .catch(() => {
        // Ignore; renderer already has retry logic.
      });
  });

  if (isDevMode) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

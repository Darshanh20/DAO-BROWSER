const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

try {
  require("electron-reloader")(module);
} catch (_) {}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, "../frontend/index.html"));
  win.show();
  win.maximize();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});


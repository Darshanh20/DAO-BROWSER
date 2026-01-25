const { app, BrowserWindow, Menu } = require("electron");

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
      preload: __dirname + "/preload.js",
      webviewTag: true,
      contextIsolation: false
    }
  });

  win.loadFile("index.html");
  win.show();
  win.maximize();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});


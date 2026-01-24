const { app, BrowserWindow } = require("electron");

try {
  require("electron-reloader")(module);
} catch (_) {}

function createWindow() {
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
  win.maximize();
  win.show();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

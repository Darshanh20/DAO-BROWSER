const { app, BrowserWindow, BrowserView, ipcMain } = require("electron");

try {
  require("electron-reloader")(module);
} catch (_) {}

let mainWindow;
let browserView;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: __dirname + "/preload.js",
      webviewTag: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile("index.html");
  mainWindow.maximize();
  mainWindow.show();

  // Create BrowserView for the actual web content
  createBrowserView();
}

function createBrowserView() {
  // Remove existing BrowserView if it exists
  if (browserView) {
    mainWindow.removeBrowserView(browserView);
    browserView.webContents.destroy();
  }

  // Create new BrowserView
  browserView = new BrowserView({
    webPreferences: {
      preload: __dirname + "/preload.js"
    }
  });

  mainWindow.addBrowserView(browserView);

  // Set bounds: leave space for toolbar (52px) and padding
  const bounds = mainWindow.getBounds();
  browserView.setBounds({
    x: 0,
    y: 52,
    width: bounds.width,
    height: bounds.height - 52
  });

  // Load initial URL
  browserView.webContents.loadURL("https://www.google.com");

  // Listen to navigation events
  browserView.webContents.on("did-navigate", (event, url) => {
    console.log("did-navigate:", url);
    mainWindow.webContents.send("url-updated", url);
  });

  browserView.webContents.on("did-navigate-in-page", (event, url) => {
    console.log("did-navigate-in-page:", url);
    mainWindow.webContents.send("url-updated", url);
  });

  browserView.webContents.on("did-start-loading", () => {
    mainWindow.webContents.send("loading-started");
  });

  browserView.webContents.on("did-stop-loading", () => {
    mainWindow.webContents.send("loading-stopped");
  });

  // Update bounds on window resize
  mainWindow.on("resize", () => {
    const bounds = mainWindow.getBounds();
    browserView.setBounds({
      x: 0,
      y: 52,
      width: bounds.width,
      height: bounds.height - 52
    });
  });
}

// IPC: Handle navigation requests from renderer
ipcMain.on("navigate-to", (event, url) => {
  if (browserView) {
    browserView.webContents.loadURL(url);
  }
});

// IPC: Handle back button
ipcMain.on("go-back", (event) => {
  if (browserView && browserView.webContents.canGoBack()) {
    browserView.webContents.goBack();
  }
});

// IPC: Handle forward button
ipcMain.on("go-forward", (event) => {
  if (browserView && browserView.webContents.canGoForward()) {
    browserView.webContents.goForward();
  }
});

// IPC: Handle reload
ipcMain.on("reload", (event) => {
  if (browserView) {
    browserView.webContents.reload();
  }
});

// IPC: Get current URL
ipcMain.handle("get-current-url", () => {
  if (browserView) {
    return browserView.webContents.getURL();
  }
  return "";
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

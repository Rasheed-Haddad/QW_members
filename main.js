const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "assets", "QW_ICON.jpg"), // ← هنا الأيقونة
  });
  Menu.setApplicationMenu(null);

  if (app.isPackaged) {
    // وضع الإنتاج (EXE بعد البناء)
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  } else {
    // وضع التطوير (npm run electron:dev)
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools(); // افتح أدوات المطور للتصحيح
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

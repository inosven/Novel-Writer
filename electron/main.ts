import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { setupConfigIPC } from './ipc/config.js';
import { setupProjectIPC } from './ipc/project.js';
import { setupPlanningIPC } from './ipc/planning.js';
import { setupWritingIPC } from './ipc/writing.js';
import { setupCharactersIPC } from './ipc/characters.js';
import { setupOutlineIPC } from './ipc/outline.js';
import { setupSkillsIPC } from './ipc/skills.js';

// Global error handlers to prevent crash
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ESM polyfill for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronRequire = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, Menu } = electronRequire('electron');

let mainWindow: typeof BrowserWindow.prototype | null = null;

// Check if running with vite dev server
// vite-plugin-electron sets VITE_DEV_SERVER_URL when running 'npm run dev'
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!VITE_DEV_SERVER_URL;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    show: false,
  });

  // Setup IPC handlers
  setupConfigIPC(ipcMain);
  setupProjectIPC(ipcMain);
  setupPlanningIPC(ipcMain);
  setupWritingIPC(ipcMain);
  setupCharactersIPC(ipcMain);
  setupOutlineIPC(ipcMain);
  setupSkillsIPC(ipcMain);

  // Load the app
  if (isDev && VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Main] Loading:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Setup macOS application menu (enables Cmd+Q, Cmd+C/V/X, etc.)
if (process.platform === 'darwin') {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app before quit - save any pending state
app.on('before-quit', async () => {
  // Emit event to renderer to save state
  mainWindow?.webContents.send('app:before-quit');
});

const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const isDev = process.env.NODE_ENV === 'development';
const showDevTools = isDev || process.env.ELECTRON_DEBUG_TOOLS === '1';

let mainWindow;

// Registrar el esquema "app://" como privilegiado ANTES de que la app esté lista.
// Esto permite cargar los módulos ES de Vite (type="module" + crossorigin) que
// quedan bloqueados bajo file:// y dejan la pantalla en blanco.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Localiza la carpeta dist (preferimos fuera de app.asar para evitar fallos de integridad).
function resolveDistDir() {
  const candidates = [
    path.join(process.resourcesPath, 'dist'),
    path.join(process.resourcesPath, 'app', 'dist'),
    path.join(app.getAppPath(), 'dist'),
    path.join(__dirname, '..', 'dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
}

function registerAppProtocol(distDir) {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname || pathname === '/') {
      pathname = '/index.html';
    }
    // Normalizamos y evitamos salir del directorio dist (path traversal).
    const safePath = path.normalize(path.join(distDir, pathname));
    if (!safePath.startsWith(path.normalize(distDir))) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(safePath).toString());
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icons', 'icon-256.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  const showLoadError = (title, extraLines = []) => {
    const lines = [title, ...extraLines];
    mainWindow.loadURL(`data:text/plain;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`);
  };

  // Log de fallos de carga reales (ignoramos ERR_ABORTED de navegaciones canceladas).
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    if (code === -3) return;
    showLoadError('Error cargando la aplicación', [
      `Código: ${code}`,
      `Descripción: ${description}`,
      `URL: ${validatedURL}`,
    ]);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    const distDir = resolveDistDir();
    if (distDir) {
      registerAppProtocol(distDir);
      mainWindow.loadURL('app://local/index.html');
    } else {
      showLoadError('No se pudo cargar la aplicación', [
        'No se encontró dist/index.html en ninguna ruta.',
      ]);
    }
  }

  if (showDevTools) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

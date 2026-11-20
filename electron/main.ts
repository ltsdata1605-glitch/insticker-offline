import { BrowserWindow, Menu, app, ipcMain, net, protocol, session, shell, systemPreferences } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions, Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PrintJobRequest, PrintSendRequest, PrinterSummary, SavePdfRequest } from './contract';
import { PrintJobs } from './printJobs';
import { Updater } from './updater';

const SCHEME = 'app';
const HOST = 'sticker';
const ORIGIN = `${SCHEME}://${HOST}`;
/** Thư mục dữ liệu riêng cho bài kiểm thử tự động, để không đụng dữ liệu thật. */
const TEST_USER_DATA = process.env.STICKER_USER_DATA;
const TEST_DOWNLOAD_DIR = process.env.STICKER_DOWNLOAD_DIR;

// Địa chỉ cố định app://sticker: code dùng đường dẫn /frame/... và IndexedDB gắn với địa chỉ này,
// nên dữ liệu không mất khi cập nhật hay chuyển thư mục cài đặt.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (TEST_USER_DATA) app.setPath('userData', TEST_USER_DATA);

let mainWindow: BrowserWindow | null = null;
const PRINT_PARTITION = 'in-sticker-ban-in';
const printJobs = new PrintJobs(ORIGIN, () => mainWindow, () => session.fromPartition(PRINT_PARTITION));
const blockedRequests: string[] = [];
const savedDownloads = new Set<string>();
const reservedDownloadPaths = new Set<string>();

/** Không ghi đè tệp có sẵn: thêm (1), (2) như trình duyệt. */
const uniqueDownloadPath = (dir: string, rawName: string): string => {
  const name = path.basename(rawName).replace(/[/\\?%*:|"<>]/g, '-') || 'tep-tai-ve';
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  for (let i = 1; fs.existsSync(candidate) || reservedDownloadPaths.has(candidate); i += 1) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
  }
  return candidate;
};

/**
 * Lưu thẳng vào thư mục Tải về, giống Chrome trên bản web. Nếu để Electron mặc định thì mỗi tệp hiện một
 * hộp thoại, rất phiền khi xuất nhiều ảnh hoặc nhiều file mẫu theo ngành hàng.
 */
const setupDownloads = (): void => {
  session.defaultSession.on('will-download', (_event, item) => {
    const target = uniqueDownloadPath(TEST_DOWNLOAD_DIR ?? app.getPath('downloads'), item.getFilename());
    reservedDownloadPaths.add(target);
    item.setSavePath(target);
    item.once('done', (_doneEvent, state) => {
      reservedDownloadPaths.delete(target);
      const ok = state === 'completed';
      if (ok) savedDownloads.add(target);
      mainWindow?.webContents.send('download:done', { fileName: path.basename(target), path: target, ok });
    });
  });
};

const distDir = (): string => path.join(app.getAppPath(), 'dist');

const handleAppRequest = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Không tìm thấy', { status: 404 });

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response('Đường dẫn không hợp lệ', { status: 400 });
  }

  if (pathname.startsWith('/__print/')) {
    return printJobs.respond(pathname) ?? new Response('Không tìm thấy', { status: 404 });
  }

  const root = distDir();
  const file = path.normalize(path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1)));
  if (!file.startsWith(root + path.sep)) return new Response('Không được phép', { status: 403 });

  try {
    return await net.fetch(pathToFileURL(file).toString());
  } catch {
    return new Response('Không tìm thấy', { status: 404 });
  }
};

/** Chỉ nhận lệnh từ đúng trang giao diện chính của app. */
const assertTrustedSender = (event: IpcMainInvokeEvent): void => {
  const frameUrl = event.senderFrame?.url ?? '';
  if (event.sender !== mainWindow?.webContents || !frameUrl.startsWith(`${ORIGIN}/`)) {
    throw new Error('Nguồn gọi không hợp lệ');
  }
};

const registerIpc = (updater: Updater): void => {
  ipcMain.handle('print:create', (event, request: PrintJobRequest) => {
    assertTrustedSender(event);
    return printJobs.create(request);
  });
  ipcMain.handle('print:list-printers', async (event): Promise<PrinterSummary[]> => {
    assertTrustedSender(event);
    const printers = await event.sender.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
  });
  ipcMain.handle('print:send', (event, request: PrintSendRequest) => {
    assertTrustedSender(event);
    return printJobs.send(request);
  });
  ipcMain.handle('print:save-pdf', (event, request: SavePdfRequest) => {
    assertTrustedSender(event);
    return printJobs.savePdf(request);
  });
  ipcMain.handle('print:close', (event, jobId: string) => {
    assertTrustedSender(event);
    printJobs.close(jobId);
  });
  ipcMain.handle('shell:show-in-folder', (event, filePath: string) => {
    assertTrustedSender(event);
    if (savedDownloads.has(filePath)) shell.showItemInFolder(filePath);
  });

  ipcMain.handle('update:get-state', (event) => {
    assertTrustedSender(event);
    return updater.getState();
  });
  ipcMain.handle('update:check', (event) => {
    assertTrustedSender(event);
    return updater.check({ manual: true });
  });
  ipcMain.handle('update:download', (event) => {
    assertTrustedSender(event);
    return updater.download();
  });
  ipcMain.handle('update:install', (event) => {
    assertTrustedSender(event);
    return updater.install();
  });
  ipcMain.handle('update:continue', (event) => {
    assertTrustedSender(event);
    updater.continueWithoutUpdate();
  });
  ipcMain.handle('update:set-auto-download', (event, enabled: boolean) => {
    assertTrustedSender(event);
    return updater.setAutoDownload(enabled === true);
  });
  ipcMain.handle('update:open-download-page', (event) => {
    assertTrustedSender(event);
    return updater.openDownloadPage();
  });
};

const buildMenu = (): void => {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'Xem',
      submenu: [
        { role: 'resetZoom', label: 'Cỡ gốc' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'toggleDevTools' as const }]),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createMainWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    // Dưới 1024 px giao diện chuyển sang bố cục điện thoại, app máy tính không dùng bố cục đó.
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'In Sticker',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    icon: path.join(distDir(), 'icon.png'), // Windows: biểu tượng cửa sổ và thanh tác vụ
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true, // bật trình xem PDF cho màn xem trước bản in
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Giao diện không mở địa chỉ nào ngoài chính nó
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => {
    mainWindow = null;
    printJobs.closeAll(); // cửa sổ in ẩn không được giữ app chạy sau khi đã đóng cửa sổ chính
  });

  void mainWindow.loadURL(`${ORIGIN}/`);
};

/** Chặn mọi yêu cầu ra mạng từ cả giao diện lẫn cửa sổ in. Chỉ việc cập nhật ra mạng, qua phiên riêng trong main process. */
const blockNetwork = (target: Session): void => {
  target.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      blockedRequests.push(details.url);
      callback({ cancel: true });
    },
  );
};

const startApp = (): void => {
  // Bản đóng gói lấy icon từ file .icns. Bản chạy thử (npm start) chạy bằng Electron gốc nên Dock hiện icon Electron: đặt lại icon của app.
  if (process.platform === 'darwin' && !app.isPackaged) {
    app.dock?.setIcon(path.join(app.getAppPath(), 'build', 'icon-mac.png'));
  }
  protocol.handle(SCHEME, handleAppRequest);
  blockNetwork(session.defaultSession);

  const printSession = session.fromPartition(PRINT_PARTITION);
  printSession.protocol.handle(SCHEME, handleAppRequest);
  blockNetwork(printSession);
  printSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  (globalThis as { __blockedRequests?: string[] }).__blockedRequests = blockedRequests;

  // Giao diện chỉ cần quyền camera (quét mã). Trên Mac phải xin thêm quyền của hệ điều hành.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission !== 'media' || !details.requestingUrl.startsWith(`${ORIGIN}/`)) {
      callback(false);
      return;
    }
    // Bài kiểm thử dùng camera giả, không được hiện hộp thoại xin quyền của hệ điều hành.
    if (process.platform === 'darwin' && !TEST_USER_DATA) {
      systemPreferences.askForMediaAccess('camera').then(callback).catch(() => callback(false));
      return;
    }
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    permission === 'media' && requestingOrigin.startsWith(ORIGIN));

  setupDownloads();

  const updater = new Updater((state) => mainWindow?.webContents.send('update:state', state));
  (globalThis as { __updater?: Updater }).__updater = updater;
  registerIpc(updater);
  buildMenu();
  createMainWindow();
  void updater.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
};

/** Người dùng bấm mở app lần nữa: đưa cửa sổ đang có ra trước, trên Mac có thể đã đóng cửa sổ nhưng app còn chạy. */
const showMainWindow = (): void => {
  if (process.platform === 'darwin') app.focus({ steal: true });
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Mỗi thư mục dữ liệu chỉ chạy một bản app. Kho dữ liệu chỉ cho một tiến trình mở, bản thứ hai sẽ trống dữ liệu và không lưu được gì.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', showMainWindow);
  void app.whenReady().then(startApp);
} else {
  app.quit();
}

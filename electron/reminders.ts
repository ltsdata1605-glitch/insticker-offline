import { BrowserWindow, Menu, Notification, Tray, app, clipboard, ipcMain, nativeImage, powerMonitor, powerSaveBlocker, screen, session, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { VolumeBoost } from './volume';
import type { BackgroundSettings, BridgeRequest, BridgeResponse, ReminderAction, ReminderPopupData, SheetFetchResult } from './contract';

interface HostOptions {
  origin: string;
  preload: string;
  /** Icon cửa sổ (Windows) */
  iconPath: string;
  trayIconPath: string;
  /** Tệp cài đặt chạy nền của máy này, nằm trong thư mục dữ liệu */
  settingsFile: string;
  getMainWindow: () => BrowserWindow | null;
  showMainWindow: () => void;
  /** Bài kiểm thử: không đặt khởi động cùng máy, không hiện thông báo hệ thống */
  isTest: boolean;
}

interface StoredSettings {
  runInBackground: boolean;
  openAtLogin: boolean;
  /** Không cho máy tự ngủ khi app đang chạy, để nhắc đúng giờ */
  keepAwake: boolean;
  /** Mở to hết âm lượng khi cửa sổ nhắc kêu */
  maxVolume: boolean;
  /** Đã báo một lần rằng đóng cửa sổ thì app vẫn chạy nền */
  hiddenNoticeShown?: boolean;
}

const DEFAULTS: StoredSettings = { runInBackground: true, openAtLogin: true, keepAwake: true, maxVolume: true };
const LOGIN_ARG = '--khoi-dong-cung-may';
const SHEET_PATTERN = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})(?:[/?#].*)?$/;
/** Link kết nối: ứng dụng web của script cầu nối trong file, kèm mã bí mật */
const BRIDGE_PATTERN = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/\s]+|macros)\/s\/[A-Za-z0-9_-]{10,}\/exec\?k=[A-Za-z0-9]{16,}$/;
/** Bài kiểm thử dùng cầu nối giả trên máy */
const TEST_BRIDGE_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/macros\/s\/[A-Za-z0-9_-]{10,}\/exec\?k=[A-Za-z0-9]{16,}$/;
const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const POPUP_WIDTH = 440;
const POPUP_HEIGHT = 420;
const POPUP_MIN_HEIGHT = 220;

/**
 * Tải file Google Sheet dạng .xlsx (đủ mọi trang: Nhắc việc, Checklist). Chỉ đi tới docs.google.com (và máy chủ tải của Google khi
 * được chuyển hướng), qua phiên mạng riêng: giao diện app vẫn bị chặn mạng. File chưa chia sẻ cho người có link thì Google trả
 * trang đăng nhập. Bài kiểm thử đặt STICKER_SHEET_MOCK là đường dẫn tệp .xlsx để không ra mạng.
 */
export const fetchSheetFile = async (url: string, isTest: boolean): Promise<SheetFetchResult> => {
  const match = url.trim().match(SHEET_PATTERN);
  if (!match) return { ok: false, reason: 'invalid-url' };
  const mock = process.env.STICKER_SHEET_MOCK;
  if (isTest && mock) {
    try {
      return { ok: true, base64: fs.readFileSync(mock).toString('base64') };
    } catch {
      return { ok: false, reason: 'not-shared' };
    }
  }
  const exportUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
  try {
    const response = await session.fromPartition('nhac-viec-google-sheet').fetch(exportUrl, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
    // Phiên mạng của Electron có lúc trả địa chỉ cuối rỗng: khi đó dùng địa chỉ đã gọi
    const host = new URL(response.url || exportUrl).hostname;
    if (!host.endsWith('.google.com') && !host.endsWith('.googleusercontent.com')) return { ok: false, reason: 'error', message: `Chuyển hướng lạ: ${host}` };
    if (response.status === 404) return { ok: false, reason: 'not-found' };
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('spreadsheetml')) return { ok: false, reason: 'not-shared' };
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_SHEET_BYTES) return { ok: false, reason: 'error', message: 'File quá lớn' };
    return { ok: true, base64: bytes.toString('base64') };
  } catch (error) {
    return { ok: false, reason: 'offline', message: error instanceof Error ? error.message : String(error) };
  }
};

export const isBridgeLink = (link: string, isTest: boolean): boolean => BRIDGE_PATTERN.test(link) || (isTest && TEST_BRIDGE_PATTERN.test(link));

/**
 * Gọi cầu nối Google Sheet. Chỉ đi tới script.google.com (Google trả kết quả qua script.googleusercontent.com), qua phiên mạng
 * riêng như khi tải file. Ứng dụng web chưa để "Bất kỳ ai" thì Google trả trang đăng nhập thay cho dữ liệu.
 */
export const callBridge = async (link: string, request: BridgeRequest, isTest: boolean): Promise<BridgeResponse> => {
  const base = link.trim();
  if (!isBridgeLink(base, isTest)) return { ok: false, reason: 'invalid-url' };
  const url = request.method === 'GET' ? `${base}&a=doc${request.since ? `&since=${encodeURIComponent(request.since)}` : ''}&t=${Date.now()}` : base;
  try {
    const response = await session.fromPartition('nhac-viec-google-sheet').fetch(url, {
      method: request.method,
      ...(request.method === 'POST' ? { body: JSON.stringify(request.body), headers: { 'Content-Type': 'text/plain;charset=utf-8' } } : {}),
      signal: AbortSignal.timeout(request.method === 'POST' ? 60_000 : 45_000),
      cache: 'no-store',
    });
    const host = new URL(response.url || url).hostname;
    const google = host === 'script.google.com' || host.endsWith('.googleusercontent.com');
    if (!google && !(isTest && host === '127.0.0.1')) {
      return host.endsWith('.google.com') ? { ok: false, reason: 'not-public' } : { ok: false, reason: 'error', message: `Chuyển hướng lạ: ${host}` };
    }
    if (response.status === 404) return { ok: false, reason: 'not-found' };
    const text = await response.text();
    if (text.length > MAX_SHEET_BYTES) return { ok: false, reason: 'error', message: 'Dữ liệu quá lớn' };
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      // Trang HTML: ứng dụng web chưa cho Bất kỳ ai truy cập, hoặc Google báo lỗi script
      return response.ok ? { ok: false, reason: 'not-public' } : { ok: false, reason: 'error', message: `Mã ${response.status}` };
    }
  } catch (error) {
    return { ok: false, reason: 'offline', message: error instanceof Error ? error.message : String(error) };
  }
};

export class ReminderHost {
  /** Một cửa sổ nhắc chung: nhiều nhắc cùng lúc thì xếp trong cùng một bảng */
  private popup: BrowserWindow | null = null;
  private items: ReminderPopupData[] = [];
  private tray: Tray | null = null;
  private settings: StoredSettings;
  private quitting = false;
  private awakeBlocker: number | null = null;
  readonly volume: VolumeBoost;

  constructor(private readonly options: HostOptions) {
    this.settings = this.readSettings();
    this.volume = new VolumeBoost({ scriptDir: path.dirname(options.settingsFile), isTest: options.isTest });
  }

  private readSettings(): StoredSettings {
    try {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.options.settingsFile, 'utf8')) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private writeSettings(): void {
    try {
      fs.writeFileSync(this.options.settingsFile, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('[Nhắc việc] Không lưu được cài đặt chạy nền', error);
    }
  }

  private get loginItemAvailable(): boolean {
    return app.isPackaged && !this.options.isTest && (process.platform === 'darwin' || process.platform === 'win32');
  }

  /** Hệ điều hành có thật sự mở app lúc bật máy không (macOS có thể chờ duyệt, Windows có thể bị tắt trong Trình quản lý tác vụ) */
  private loginStatus(): BackgroundSettings['loginStatus'] {
    if (!this.loginItemAvailable || !this.settings.openAtLogin) return undefined;
    try {
      if (process.platform === 'darwin') {
        const current = app.getLoginItemSettings();
        if (current.status === 'requires-approval') return 'needs-approval';
        return current.status === 'enabled' || current.openAtLogin ? 'ok' : 'failed';
      }
      const current = app.getLoginItemSettings({ args: [LOGIN_ARG] });
      if (!current.openAtLogin) return 'failed';
      return current.executableWillLaunchAtLogin ? 'ok' : 'blocked';
    } catch {
      return 'failed';
    }
  }

  private publicSettings(): BackgroundSettings {
    return {
      runInBackground: this.settings.runInBackground,
      openAtLogin: this.settings.openAtLogin,
      loginItemAvailable: this.loginItemAvailable,
      loginStatus: this.loginStatus(),
      keepAwake: this.settings.keepAwake,
      maxVolume: this.settings.maxVolume,
    };
  }

  private applyLoginItem(): void {
    if (!this.loginItemAvailable) return;
    try {
      app.setLoginItemSettings({ openAtLogin: this.settings.openAtLogin, args: [LOGIN_ARG] });
    } catch (error) {
      console.error('[Nhắc việc] Không đặt được khởi động cùng máy', error);
    }
  }

  /** Không cho máy tự ngủ (màn hình vẫn tắt được) và không cho hệ điều hành cho app "ngủ trưa": giờ nhắc chạy đúng lúc */
  private applyKeepAwake(): void {
    const want = this.settings.keepAwake && !this.options.isTest;
    if (want && this.awakeBlocker === null) {
      this.awakeBlocker = powerSaveBlocker.start('prevent-app-suspension');
    } else if (!want && this.awakeBlocker !== null) {
      powerSaveBlocker.stop(this.awakeBlocker);
      this.awakeBlocker = null;
    }
  }

  /** App tự mở lúc bật máy: chạy nền, không hiện cửa sổ */
  get openedAtLogin(): boolean {
    if (!this.settings.runInBackground) return false;
    if (process.argv.includes(LOGIN_ARG)) return true;
    try {
      return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true;
    } catch {
      return false;
    }
  }

  private updateTray(): void {
    if (!this.settings.runInBackground) {
      this.tray?.destroy();
      this.tray = null;
      return;
    }
    if (this.tray) return;
    try {
      const image = nativeImage.createFromPath(this.options.trayIconPath);
      this.tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
      this.tray.setToolTip('In Sticker: đang chạy để nhắc việc');
      this.tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Mở In Sticker', click: () => this.options.showMainWindow() },
        { type: 'separator' },
        { label: 'Thoát hẳn (không nhắc việc nữa)', click: () => this.quit() },
      ]));
      this.tray.on('click', () => {
        if (process.platform !== 'darwin') this.options.showMainWindow();
      });
    } catch (error) {
      console.error('[Nhắc việc] Không tạo được biểu tượng ở khay hệ thống', error);
    }
  }

  quit(): void {
    this.quitting = true;
    app.quit();
  }

  /** Gọi trong sự kiện close của cửa sổ chính: true thì ẩn thay vì đóng */
  hideOnClose(): boolean {
    if (this.quitting || !this.settings.runInBackground) return false;
    if (!this.settings.hiddenNoticeShown && !this.options.isTest && Notification.isSupported()) {
      new Notification({
        title: 'In Sticker vẫn đang chạy',
        body: 'App chạy nền để nhắc việc đúng giờ. Muốn tắt hẳn: bấm biểu tượng In Sticker ở khay hệ thống, chọn Thoát hẳn.',
      }).show();
      this.settings.hiddenNoticeShown = true;
      this.writeSettings();
    }
    return true;
  }

  private assertMain(event: IpcMainInvokeEvent): void {
    const frameUrl = event.senderFrame?.url ?? '';
    if (event.sender !== this.options.getMainWindow()?.webContents || !frameUrl.startsWith(`${this.options.origin}/`)) {
      throw new Error('Nguồn gọi không hợp lệ');
    }
  }

  private assertPopup(event: IpcMainInvokeEvent): void {
    const frameUrl = event.senderFrame?.url ?? '';
    if (!this.popup || this.popup.isDestroyed() || event.sender !== this.popup.webContents || !frameUrl.startsWith(`${this.options.origin}/`)) {
      throw new Error('Nguồn gọi không hợp lệ');
    }
  }

  private attention(popup: BrowserWindow): void {
    if (process.platform === 'darwin') app.dock?.bounce('critical');
    else popup.flashFrame(true);
  }

  private sendItems(): void {
    if (this.popup && !this.popup.isDestroyed()) this.popup.webContents.send('reminder:popup-items', this.items);
  }

  /** Thêm hoặc thay một nhắc trong bảng nhắc; chưa có bảng thì mở */
  showPopup(data: ReminderPopupData): void {
    const index = this.items.findIndex(item => item.key === data.key);
    this.items = index >= 0 ? this.items.map((item, i) => (i === index ? data : item)) : [...this.items, data];
    const existing = this.popup;
    if (existing && !existing.isDestroyed()) {
      this.sendItems();
      existing.setTitle(this.title());
      if (!existing.isVisible()) existing.show();
      existing.moveTop();
      existing.focus();
      this.attention(existing);
      return;
    }
    const { workArea } = screen.getPrimaryDisplay();
    const popup = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      x: Math.round(workArea.x + workArea.width - POPUP_WIDTH - 24),
      y: Math.round(workArea.y + 24),
      show: false,
      title: this.title(),
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      icon: this.options.iconPath,
      webPreferences: {
        preload: this.options.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        // Kêu ngay khi bật lên, không chờ người dùng bấm
        autoplayPolicy: 'no-user-gesture-required',
        backgroundThrottling: false,
      },
    });
    // Nằm trên cả ứng dụng toàn màn hình, ở mọi màn hình làm việc (Mac)
    popup.setAlwaysOnTop(true, 'screen-saver');
    popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.popup = popup;
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', (event) => event.preventDefault());
    popup.once('ready-to-show', () => {
      popup.show();
      popup.focus();
      this.attention(popup);
    });
    // Đóng bằng nút × của cửa sổ: coi như đã xem mọi nhắc còn trong bảng
    popup.on('close', () => {
      const left = this.popup === popup ? this.items : [];
      if (this.popup === popup) {
        this.items = [];
        this.popup = null;
      }
      for (const item of left) this.forward({ key: item.key, action: 'dismiss' });
    });
    popup.on('closed', () => {
      if (this.popup === popup) {
        this.popup = null;
        this.items = [];
      }
      this.volume.restore();
    });
    void popup.loadURL(`${this.options.origin}/?popup=nhac-viec`);
  }

  private title(): string {
    if (this.items.length > 1) return `Nhắc việc (${this.items.length})`;
    return this.items[0]?.kind === 'missed' ? 'Nhắc việc bị lỡ' : 'Nhắc việc';
  }

  /** Bỏ một nhắc khỏi bảng; bảng trống thì đóng */
  closePopup(key: string): void {
    if (!this.items.some(item => item.key === key)) return;
    this.items = this.items.filter(item => item.key !== key);
    const popup = this.popup;
    if (!popup || popup.isDestroyed()) return;
    if (this.items.length === 0) {
      this.popup = null;
      popup.close();
      return;
    }
    popup.setTitle(this.title());
    this.sendItems();
  }

  /** Cửa sổ nhắc báo chiều cao nội dung: cửa sổ co giãn theo, tối đa gần hết chiều cao màn hình */
  private resizePopup(height: number): void {
    const popup = this.popup;
    if (!popup || popup.isDestroyed() || !Number.isFinite(height)) return;
    const { workArea } = screen.getDisplayMatching(popup.getBounds());
    const [, current] = popup.getContentSize();
    const frame = popup.getSize()[1] - current;
    const next = Math.round(Math.max(POPUP_MIN_HEIGHT, Math.min(height, workArea.height - 48 - frame)));
    if (Math.abs(next - current) < 2) return;
    const bounds = popup.getBounds();
    const bottom = workArea.y + workArea.height - 24;
    // Giữ mép trên, trừ khi cửa sổ cao lên quá đáy màn hình thì đẩy lên
    const y = Math.max(workArea.y + 24, Math.min(bounds.y, bottom - next - frame));
    popup.setBounds({ x: bounds.x, y, width: bounds.width, height: next + frame });
  }

  private forward(action: ReminderAction): void {
    if (action.action === 'open') this.options.showMainWindow();
    this.options.getMainWindow()?.webContents.send('reminder:action', action);
  }

  register(): void {
    ipcMain.handle('reminder:show', (event, data: ReminderPopupData) => {
      this.assertMain(event);
      this.showPopup(data);
    });
    ipcMain.handle('reminder:close', (event, key: string) => {
      this.assertMain(event);
      this.closePopup(key);
    });
    ipcMain.handle('reminder:popup-data', (event) => {
      this.assertPopup(event);
      return this.items;
    });
    ipcMain.handle('reminder:popup-action', (event, action: ReminderAction) => {
      this.assertPopup(event);
      const item = this.items.find(entry => entry.key === action?.key);
      if (!item) return;
      const minutes = typeof action.minutes === 'number' ? action.minutes : undefined;
      if (!['done', 'snooze', 'open', 'dismiss'].includes(action.action)) return;
      this.forward({ key: item.key, action: action.action, minutes });
      this.closePopup(item.key);
    });
    ipcMain.handle('reminder:popup-size', (event, height: number) => {
      this.assertPopup(event);
      this.resizePopup(Number(height));
    });
    // Cửa sổ nhắc đang kêu: mở to hết âm lượng; tắt tiếng hoặc đóng thì trả lại mức cũ
    ipcMain.handle('reminder:popup-sound', (event, playing: boolean) => {
      this.assertPopup(event);
      if (playing === true && this.settings.maxVolume) this.volume.raise();
      else if (playing !== true) this.volume.restore();
    });
    ipcMain.handle('background:get', (event) => {
      this.assertMain(event);
      return this.publicSettings();
    });
    ipcMain.handle('background:set', (event, next: Partial<StoredSettings>) => {
      this.assertMain(event);
      if (typeof next.runInBackground === 'boolean') this.settings.runInBackground = next.runInBackground;
      if (typeof next.openAtLogin === 'boolean') this.settings.openAtLogin = next.openAtLogin;
      if (typeof next.keepAwake === 'boolean') this.settings.keepAwake = next.keepAwake;
      if (typeof next.maxVolume === 'boolean') this.settings.maxVolume = next.maxVolume;
      this.writeSettings();
      this.applyLoginItem();
      this.applyKeepAwake();
      this.updateTray();
      return this.publicSettings();
    });

    // Mở trang cài đặt của hệ điều hành để cho phép app mở cùng máy
    ipcMain.handle('background:open-login-settings', (event) => {
      this.assertMain(event);
      if (this.options.isTest) return;
      const target = process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension' : process.platform === 'win32' ? 'ms-settings:startupapps' : '';
      if (target) void shell.openExternal(target);
    });

    ipcMain.handle('sheet:fetch', (event, url: string) => {
      this.assertMain(event);
      return fetchSheetFile(String(url), this.options.isTest);
    });
    ipcMain.handle('sheet:bridge', (event, link: string, request: BridgeRequest) => {
      this.assertMain(event);
      const safe: BridgeRequest = request?.method === 'POST' ? { method: 'POST', body: request.body } : { method: 'GET', since: typeof request?.since === 'string' ? request.since : undefined };
      return callBridge(String(link), safe, this.options.isTest);
    });
    // Chỉ trả về khi clipboard là link Google Sheet hoặc Link kết nối, không để giao diện đọc nội dung khác trong clipboard
    ipcMain.handle('sheet:clipboard', async (event) => {
      this.assertMain(event);
      const text = String(await clipboard.readText()).trim();
      return SHEET_PATTERN.test(text) || isBridgeLink(text, this.options.isTest) ? text : '';
    });
    ipcMain.handle('sheet:open', (event, url: string) => {
      this.assertMain(event);
      // Chỉ mở link Google Sheet
      if (SHEET_PATTERN.test(String(url)) && !this.options.isTest) void shell.openExternal(String(url));
    });

    const recheck = () => this.options.getMainWindow()?.webContents.send('reminder:recheck');
    powerMonitor.on('resume', recheck);
    powerMonitor.on('unlock-screen', recheck);
    app.on('before-quit', () => {
      this.quitting = true;
      const popup = this.popup;
      this.popup = null;
      this.items = [];
      if (popup && !popup.isDestroyed()) popup.destroy();
      this.volume.restore();
    });

    this.applyLoginItem();
    this.applyKeepAwake();
    this.updateTray();
  }
}

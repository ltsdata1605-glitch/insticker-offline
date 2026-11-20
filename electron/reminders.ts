import { BrowserWindow, Menu, Notification, Tray, app, ipcMain, nativeImage, powerMonitor, screen } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import type { BackgroundSettings, ReminderAction, ReminderPopupData } from './contract';

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
  /** Đã báo một lần rằng đóng cửa sổ thì app vẫn chạy nền */
  hiddenNoticeShown?: boolean;
}

const DEFAULTS: StoredSettings = { runInBackground: true, openAtLogin: true };
const POPUP_WIDTH = 440;
const POPUP_HEIGHT = 420;

/**
 * Nhắc việc phía app: cửa sổ nhắc luôn nằm trên mọi ứng dụng, biểu tượng ở khay hệ thống, chạy nền khi đóng cửa sổ,
 * khởi động cùng máy, báo giao diện kiểm tra lại khi máy thức dậy. Lịch nhắc tính ở giao diện (cửa sổ chính chạy ẩn).
 */
export class ReminderHost {
  private readonly popups = new Map<string, BrowserWindow>();
  private readonly popupData = new Map<number, ReminderPopupData>();
  private tray: Tray | null = null;
  private settings: StoredSettings;
  private quitting = false;

  constructor(private readonly options: HostOptions) {
    this.settings = this.readSettings();
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

  private publicSettings(): BackgroundSettings {
    return { runInBackground: this.settings.runInBackground, openAtLogin: this.settings.openAtLogin, loginItemAvailable: this.loginItemAvailable };
  }

  private applyLoginItem(): void {
    if (!this.loginItemAvailable) return;
    try {
      app.setLoginItemSettings({ openAtLogin: this.settings.openAtLogin, args: ['--khoi-dong-cung-may'] });
    } catch (error) {
      console.error('[Nhắc việc] Không đặt được khởi động cùng máy', error);
    }
  }

  /** App tự mở lúc bật máy: chạy nền, không hiện cửa sổ */
  get openedAtLogin(): boolean {
    if (!this.settings.runInBackground) return false;
    if (process.argv.includes('--khoi-dong-cung-may')) return true;
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

  private assertPopup(event: IpcMainInvokeEvent): ReminderPopupData {
    const data = this.popupData.get(event.sender.id);
    const frameUrl = event.senderFrame?.url ?? '';
    if (!data || !frameUrl.startsWith(`${this.options.origin}/`)) throw new Error('Nguồn gọi không hợp lệ');
    return data;
  }

  private attention(popup: BrowserWindow): void {
    if (process.platform === 'darwin') app.dock?.bounce('critical');
    else popup.flashFrame(true);
  }

  showPopup(data: ReminderPopupData): void {
    const existing = this.popups.get(data.key);
    if (existing && !existing.isDestroyed()) {
      this.popupData.set(existing.webContents.id, data);
      existing.show();
      existing.focus();
      return;
    }
    const { workArea } = screen.getPrimaryDisplay();
    const offset = (this.popups.size % 6) * 28;
    const popup = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      x: Math.round(workArea.x + workArea.width - POPUP_WIDTH - 24 - offset),
      y: Math.round(workArea.y + 24 + offset),
      show: false,
      title: data.kind === 'missed' ? 'Nhắc việc bị lỡ' : 'Nhắc việc',
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
    const id = popup.webContents.id;
    this.popupData.set(id, data);
    this.popups.set(data.key, popup);
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', (event) => event.preventDefault());
    popup.once('ready-to-show', () => {
      popup.show();
      popup.focus();
      this.attention(popup);
    });
    // Đóng bằng nút × của cửa sổ: coi như đã xem
    popup.on('close', () => {
      if (this.popupData.has(id)) this.forward({ key: data.key, action: 'dismiss' });
    });
    popup.on('closed', () => {
      this.popupData.delete(id);
      if (this.popups.get(data.key) === popup) this.popups.delete(data.key);
    });
    void popup.loadURL(`${this.options.origin}/?popup=nhac-viec`);
  }

  closePopup(key: string): void {
    const popup = this.popups.get(key);
    if (!popup || popup.isDestroyed()) return;
    this.popupData.delete(popup.webContents.id);
    popup.close();
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
    ipcMain.handle('reminder:popup-data', (event) => this.assertPopup(event));
    ipcMain.handle('reminder:popup-action', (event, action: ReminderAction) => {
      const data = this.assertPopup(event);
      this.forward({ ...action, key: data.key });
      this.closePopup(data.key);
    });
    ipcMain.handle('background:get', (event) => {
      this.assertMain(event);
      return this.publicSettings();
    });
    ipcMain.handle('background:set', (event, next: Partial<StoredSettings>) => {
      this.assertMain(event);
      if (typeof next.runInBackground === 'boolean') this.settings.runInBackground = next.runInBackground;
      if (typeof next.openAtLogin === 'boolean') this.settings.openAtLogin = next.openAtLogin;
      this.writeSettings();
      this.applyLoginItem();
      this.updateTray();
      return this.publicSettings();
    });

    const recheck = () => this.options.getMainWindow()?.webContents.send('reminder:recheck');
    powerMonitor.on('resume', recheck);
    powerMonitor.on('unlock-screen', recheck);
    app.on('before-quit', () => {
      this.quitting = true;
      for (const popup of this.popups.values()) if (!popup.isDestroyed()) popup.destroy();
    });

    this.applyLoginItem();
    this.updateTray();
  }
}

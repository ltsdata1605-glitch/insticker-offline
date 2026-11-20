import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const XLSX = require('xlsx') as typeof import('xlsx');

export interface AppSession {
  app: ElectronApplication;
  win: Page;
  dirs: Dirs;
  errors: string[];
  close(): Promise<void>;
}

export interface Dirs {
  root: string;
  userData: string;
  downloads: string;
  inputs: string;
}

// Test lỗi giữa chừng không gọi được close(): vẫn phải đóng app để không để lại cửa sổ và không làm treo lượt sau.
const runningApps = new Set<ElectronApplication>();
test.afterEach(async ({}, testInfo) => {
  for (const app of runningApps) {
    if (testInfo.status !== testInfo.expectedStatus) console.log(`[lúc test lỗi] ${await describeApp(app)}`);
    await app.close().catch(() => undefined);
  }
  runningApps.clear();
});

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Hết hạn hoặc lỗi thì trả undefined: dùng để hỏi app đang có thể bị treo mà không làm treo theo. */
const within = <T>(work: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([work.catch(() => undefined), delay(ms).then(() => undefined)]);

/** Tiến trình nào đang ăn bao nhiêu bộ nhớ, CPU và lượt in đang dừng ở bước nào. */
const describeApp = async (app: ElectronApplication): Promise<string> => {
  const main = await within(app.evaluate(({ app: electronApp }) => ({
    trace: (globalThis as { __printTrace?: { phase: string; at: number }[] }).__printTrace ?? [],
    processes: electronApp.getAppMetrics().map((m) => `${m.type} ${Math.round(m.memory.workingSetSize / 1024)}MB ${Math.round(m.cpu.percentCPUUsage)}%`),
  })), 3000);
  const [win] = app.windows();
  const marks = win
    ? await within(win.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('in:')).map((m) => m.name)), 3000)
    : undefined;
  const steps = main?.trace.map((t) => `${t.phase} +${t.at - main.trace[0].at}ms`).join(', ') ?? '';
  const windowEvents = await within(app.evaluate(() => (globalThis as WindowEventLog).__windowEvents ?? []), 3000);
  return [
    `cửa sổ: ${windowEvents?.join(', ') || 'không có sự kiện đóng hay sập'}`,
    `main ${main ? 'trả lời' : 'KHÔNG trả lời'}`,
    `giao diện ${marks ? `trả lời, mốc: ${marks.join(', ') || 'chưa có'}` : 'KHÔNG trả lời'}`,
    `bước in: ${steps || 'chưa có'}`,
    `tiến trình: ${main?.processes.join(' | ') ?? '?'}`,
    `RAM còn trống ${Math.round(os.freemem() / 1024 / 1024)}MB`,
  ].join('; ');
};

type CompletedDownloads = { __completedDownloads?: number };
type WindowEventLog = { __windowEvents?: string[] };

export const newDirs = (): Dirs => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'in-sticker-e2e-'));
  const dirs = { root, userData: path.join(root, 'data'), downloads: path.join(root, 'downloads'), inputs: path.join(root, 'inputs') };
  for (const dir of [dirs.userData, dirs.downloads, dirs.inputs]) fs.mkdirSync(dir, { recursive: true });
  return dirs;
};

/** Mở app với dữ liệu tạm. Gọi lại với cùng `dirs` để kiểm tra dữ liệu còn sau khi đóng và mở lại. */
export const openApp = async (dirs: Dirs = newDirs(), extraArgs: string[] = [], extraEnv: Record<string, string> = {}): Promise<AppSession> => {
  const app = await electron.launch({
    args: ['.', ...extraArgs],
    env: { ...process.env, STICKER_USER_DATA: dirs.userData, STICKER_DOWNLOAD_DIR: dirs.downloads, ...extraEnv },
  });
  runningApps.add(app);
  // Máy đang bận có thể mở app chậm hơn hạn mặc định 30 giây
  const win = await app.firstWindow({ timeout: 120_000 });
  // Phân biệt cửa sổ bị đóng với giao diện bị sập khi test lỗi vì mất trang
  await app.evaluate(({ BrowserWindow }) => {
    const log: string[] = [];
    (globalThis as WindowEventLog).__windowEvents = log;
    const startedAt = Date.now();
    const note = (text: string) => log.push(`${text} +${Date.now() - startedAt}ms`);
    const [mainWindow] = BrowserWindow.getAllWindows();
    mainWindow.on('close', () => note('nhận lệnh đóng'));
    mainWindow.on('closed', () => note('đã đóng'));
    mainWindow.webContents.on('render-process-gone', (_event, details) => note(`giao diện sập (${details.reason}, mã ${details.exitCode})`));
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && (input.meta || input.control)) note(`phím ${input.meta ? 'Cmd' : 'Ctrl'}+${input.key}`);
    });
  });
  await app.evaluate(({ session }) => {
    const holder = globalThis as CompletedDownloads;
    holder.__completedDownloads = 0;
    session.defaultSession.on('will-download', (_event, item) => {
      item.once('done', (_doneEvent, state) => {
        if (state === 'completed') holder.__completedDownloads = (holder.__completedDownloads ?? 0) + 1;
      });
    });
  });
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()} @ ${m.location().url}`); });
  await win.waitForSelector('#global-header-actions button', { timeout: 120_000 });
  await win.waitForTimeout(800);

  return {
    app, win, dirs, errors,
    close: async () => {
      // App offline: không được có yêu cầu nào ra mạng
      const blocked = await app.evaluate(() => (globalThis as { __blockedRequests?: string[] }).__blockedRequests ?? []);
      await app.close();
      runningApps.delete(app);
      expect(blocked, 'Yêu cầu ra mạng').toEqual([]);
      expect(errors, 'Lỗi trong trang').toEqual([]);
    },
  };
};

/** 'Sticker' là tab soạn như Giá Sốc nhưng in tem giá theo bố cục chọn lúc in, 'Event' là tab in từ bảng giá ERP (trước bản 1.2.0 tên là Sticker). */
export const chooseMode = async (win: Page, name: 'Giá Sốc' | 'Giờ Vàng' | 'Phiếu' | 'Sticker' | 'Event') => {
  const bar = win.locator('#global-header-actions');
  await bar.getByRole('button').first().waitFor();
  // Tab Event mặc định tắt (bật trong bảng bấm 7 lần vào logo). Bài test cần Event thì bật sẵn mọi tab rồi tải lại trang.
  if (name === 'Event' && (await bar.getByRole('button', { name, exact: true }).count()) === 0) {
    await win.evaluate(() => localStorage.setItem('tabAccess.hidden', '[]'));
    await win.reload();
    await bar.getByRole('button', { name, exact: true }).waitFor();
  }
  await bar.getByRole('button', { name, exact: true }).click();
  await win.waitForTimeout(500);
};

/** Các tab và nút phân đoạn của app là nút bấm có aria-pressed, không phải role tab. */
export const chooseSubTab = (win: Page, name: RegExp) => win.getByRole('button', { name }).first().click();

export const writeWorkbook = (dirs: Dirs, fileName: string, rows: unknown[][]): string => {
  const file = path.join(dirs.inputs, fileName);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  XLSX.writeFile(wb, file);
  return file;
};

/** Một dòng có đúng các cột theo chỉ số. */
export const rowWith = (cells: Record<number, unknown>): unknown[] => {
  const max = Math.max(...Object.keys(cells).map(Number));
  return Array.from({ length: max + 1 }, (_, i) => cells[i] ?? '');
};

/** Giá Sốc, Giờ Vàng: sau khi bấm in, đặt tên danh sách và chọn số sticker trên một trang A4 (mặc định 1, như trước nay). */
export const chooseStickersPerPage = async (win: Page, perPage: 1 | 2 | 4 | 8 | 16 = 1, listName = 'Danh sách thử') => {
  const dialog = win.getByRole('dialog', { name: 'Chọn số sticker trên 1 trang A4' });
  // Mỗi lần in phải đặt tên danh sách để lưu vào Lịch sử
  await dialog.getByLabel('Tên danh sách').fill(listName);
  await dialog.getByRole('button', { name: new RegExp(`^${perPage} sticker / trang`) }).click();
  await dialog.waitFor({ state: 'detached' });
};

export const printSummary = async (win: Page): Promise<string> => {
  const summary = win.locator('[data-testid="print-summary"]');
  await summary.waitFor({ timeout: 170_000 });
  return (await summary.innerText()).replace(/\s*\n\s*/g, ' | ');
};

export const closePreview = async (win: Page) => {
  await win.getByTestId('print-preview').waitFor();
  await win.keyboard.press('Escape');
  await win.getByTestId('print-preview').waitFor({ state: 'detached', timeout: 10_000 });
  await win.waitForTimeout(200);
};

/** Chạy biểu thức trong tài liệu in đang mở ở cửa sổ ẩn. */
export const evalInPrintDoc = <T>(session: AppSession, expression: string): Promise<T> =>
  session.app.evaluate(({ BrowserWindow }, code) => {
    const hidden = BrowserWindow.getAllWindows().find((w) => !w.isVisible());
    if (!hidden) throw new Error('Không có cửa sổ in ẩn');
    return hidden.webContents.executeJavaScript(code);
  }, expression) as Promise<T>;

/** Đo ảnh bằng chính Electron: kích thước và tỉ lệ điểm ảnh khác nền trắng. */
export const inspectImage = (session: AppSession, file: string) =>
  session.app.evaluate(({ nativeImage }, imagePath) => {
    const image = nativeImage.createFromPath(imagePath);
    const { width, height } = image.getSize();
    const bitmap = image.toBitmap();
    let inked = 0;
    let inkedAtRightEdge = 0;
    const edgeStart = width - Math.round(width * 0.01);
    for (let i = 0; i < bitmap.length; i += 4) {
      const pixel = i / 4;
      if (bitmap[i] < 200 || bitmap[i + 1] < 200 || bitmap[i + 2] < 200) inked += 1;
      if (pixel % width >= edgeStart && (bitmap[i] < 245 || bitmap[i + 1] < 245 || bitmap[i + 2] < 245)) inkedAtRightEdge += 1;
    }
    return { width, height, inkRatio: inked / (bitmap.length / 4), inkedAtRightEdge };
  }, file);

export const downloadedFiles = (dirs: Dirs): string[] => fs.readdirSync(dirs.downloads).sort();

/**
 * Chờ trình tải báo xong, không đếm tệp trong thư mục: tệp hiện ra chưa có nghĩa đã lưu xong
 * (trên Windows, test sao lưu từng mất tệp vì đóng app ngay sau khi thấy tệp).
 */
export const waitForDownloads = async ({ app }: AppSession, count: number) => {
  await expect.poll(
    () => app.evaluate(() => (globalThis as CompletedDownloads).__completedDownloads ?? 0),
    { timeout: 90_000 },
  ).toBeGreaterThanOrEqual(count);
};

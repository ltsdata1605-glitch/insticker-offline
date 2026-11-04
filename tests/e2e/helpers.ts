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
  return [
    `main ${main ? 'trả lời' : 'KHÔNG trả lời'}`,
    `giao diện ${marks ? `trả lời, mốc: ${marks.join(', ') || 'chưa có'}` : 'KHÔNG trả lời'}`,
    `bước in: ${steps || 'chưa có'}`,
    `tiến trình: ${main?.processes.join(' | ') ?? '?'}`,
    `RAM còn trống ${Math.round(os.freemem() / 1024 / 1024)}MB`,
  ].join('; ');
};

/** Đo thời gian lâu nhất một tiến trình không trả lời, kể cả khi nó không trả lời tới cùng. */
const stallMeter = (since: number) => {
  let lastReply = since;
  let longest = 0;
  return {
    ping: async <T>(work: () => Promise<T>): Promise<T | undefined> => {
      const started = Date.now();
      const reply = await within(work(), 1000);
      const now = Date.now();
      longest = Math.max(longest, reply === undefined ? now - lastReply : now - started);
      if (reply !== undefined) lastReply = now;
      return reply;
    },
    longest: () => longest,
  };
};

/**
 * Đồng hồ nằm ngay trong main process, giao diện và tiến trình test. So với số đo của watchPrintBuild
 * để biết tiến trình đứng thật, hay chỉ đường hỏi của Playwright bị nghẽn.
 */
export const startLagClocks = async ({ app, win }: AppSession) => {
  type Holder = { __lagMax?: number };
  const install = () => {
    const holder = globalThis as Holder;
    holder.__lagMax = 0;
    let last = Date.now();
    setInterval(() => {
      const now = Date.now();
      holder.__lagMax = Math.max(holder.__lagMax ?? 0, now - last - 50);
      last = now;
    }, 50);
  };
  await app.evaluate(install);
  await win.evaluate(install);

  let testLagMs = 0;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    testLagMs = Math.max(testLagMs, now - last - 50);
    last = now;
  }, 50);

  return async () => {
    clearInterval(timer);
    const read = () => (globalThis as Holder).__lagMax ?? -1;
    return { mainLagMs: await app.evaluate(read), rendererLagMs: await win.evaluate(read), testLagMs };
  };
};

/**
 * Theo dõi một lượt dựng bản in tới khi hiện xem trước, song song hỏi giao diện và main process
 * để biết tiến trình nào bị đứng. Mọi lời hỏi đều có hạn nên app treo vẫn có đủ nhật ký.
 */
export const watchPrintBuild = async ({ app, win }: AppSession, startedAt: number) => {
  const summary = win.locator('[data-testid="print-summary"]');
  const spinner = win.getByText('Đang dựng bản in...');
  const renderer = stallMeter(startedAt);
  const main = stallMeter(startedAt);
  let spinnerMs: number | undefined;
  let peakMb = 0;
  let nextLogAt = startedAt + 5000;
  const report = async (label: string) => console.log(`[dựng bản in +${((Date.now() - startedAt) / 1000).toFixed(1)}s, ${label}] ${await describeApp(app)}`);

  while (Date.now() - startedAt < 150_000) {
    const [, bytes] = await Promise.all([
      renderer.ping(() => win.evaluate(() => 1)),
      main.ping(() => app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0))),
    ]);
    if (bytes) peakMb = Math.max(peakMb, Math.round(bytes / 1024));
    if (spinnerMs === undefined && await within(spinner.isVisible(), 1000)) spinnerMs = Date.now() - startedAt;
    if (await within(summary.isVisible(), 1000)) {
      await report('xong');
      return { spinnerMs, readyMs: Date.now() - startedAt, rendererStallMs: renderer.longest(), mainStallMs: main.longest(), peakMb };
    }
    if (Date.now() >= nextLogAt) {
      await report('đang dựng');
      nextLogAt = Date.now() + 5000;
    }
    await delay(100);
  }
  await report('quá hạn');
  throw new Error(`Quá 150 giây chưa dựng xong; giao diện đứng lâu nhất ${renderer.longest()} ms, main ${main.longest()} ms`);
};

export const newDirs = (): Dirs => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'in-sticker-e2e-'));
  const dirs = { root, userData: path.join(root, 'data'), downloads: path.join(root, 'downloads'), inputs: path.join(root, 'inputs') };
  for (const dir of [dirs.userData, dirs.downloads, dirs.inputs]) fs.mkdirSync(dir, { recursive: true });
  return dirs;
};

/** Mở app với dữ liệu tạm. Gọi lại với cùng `dirs` để kiểm tra dữ liệu còn sau khi đóng và mở lại. */
export const openApp = async (dirs: Dirs = newDirs(), extraArgs: string[] = []): Promise<AppSession> => {
  const app = await electron.launch({
    args: ['.', ...extraArgs],
    env: { ...process.env, STICKER_USER_DATA: dirs.userData, STICKER_DOWNLOAD_DIR: dirs.downloads },
  });
  runningApps.add(app);
  // Máy đang bận có thể mở app chậm hơn hạn mặc định 30 giây
  const win = await app.firstWindow({ timeout: 120_000 });
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

export const chooseMode = async (win: Page, name: 'Giá Sốc' | 'Giờ Vàng' | 'Phiếu' | 'Sticker') => {
  await win.locator('#global-header-actions').getByRole('button', { name, exact: true }).click();
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

export const waitForDownloads = async (dirs: Dirs, count: number) => {
  await expect.poll(() => downloadedFiles(dirs).filter((f) => !f.endsWith('.crdownload')).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(count);
};

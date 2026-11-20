import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chooseMode, newDirs, openApp, rowWith, writeWorkbook } from './helpers';
import type { Dirs } from './helpers';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;

/** Giống người dùng bấm mở app lần nữa: chạy thêm một tiến trình, không gắn Playwright. Trả về mã thoát. */
const launchAgain = (dirs: Dirs) => new Promise<number | null>((resolve, reject) => {
  const child = spawn(electronPath, ['.'], {
    env: { ...process.env, STICKER_USER_DATA: dirs.userData, STICKER_DOWNLOAD_DIR: dirs.downloads },
    stdio: 'ignore',
  });
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error('Bản mở thêm không tự thoát'));
  }, 30_000);
  child.once('exit', (code) => {
    clearTimeout(timer);
    resolve(code);
  });
  child.once('error', reject);
});

const importPrices = async (win: Page, dirs: Dirs) => {
  await chooseMode(win, 'Event');
  const name = win.locator('#employee-name-input');
  if (await name.isVisible().catch(() => false)) {
    await name.fill('NV thử in');
    await name.press('Enter');
  }
  const priceRow = (msp: string, product: string, goc: string, giam: string) =>
    rowWith({ 0: product, 4: goc, 5: giam, 30: 'Ngày in: 04/11/2026', 31: '40A', 32: msp });
  await win.locator('#price-file-input').setInputFiles(writeWorkbook(dirs, 'gia.xlsx', [
    priceRow('3001001', 'Nồi cơm điện Toshiba', '2500000', '2045000'),
    priceRow('3001002', 'Nồi chiên không dầu Sunhouse', '2900000', '2390000'),
  ]));
  await expect(win.getByTestId('price-table-status')).toContainText('2 SP');
};

test('Đang có app chạy: mở lần nữa không thêm cửa sổ, đưa cửa sổ đang có ra trước, dữ liệu còn nguyên', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { app, win } = s;
  await importPrices(win, dirs);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);

  expect(await launchAgain(dirs)).toBe(0);

  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const [first] = BrowserWindow.getAllWindows();
    return !first.isMinimized() && first.isVisible();
  })).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await expect(win.getByTestId('price-table-status')).toContainText('2 SP');
  await s.close();
});

test('Đóng cửa sổ thì app chạy nền (để nhắc việc); mở app lần nữa thì hiện lại đúng cửa sổ đó, đủ dữ liệu', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { app, win } = s;
  await importPrices(win, dirs);
  await win.waitForTimeout(500);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  // Cửa sổ chỉ ẩn, không bị huỷ: lịch nhắc việc trong cửa sổ vẫn chạy
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.isVisible()))).toEqual([false]);

  expect(await launchAgain(dirs)).toBe(0);

  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.isVisible()))).toEqual([true]);
  await chooseMode(win, 'Event');
  await expect(win.getByTestId('price-table-status')).toContainText('2 SP');
  await s.close();
});

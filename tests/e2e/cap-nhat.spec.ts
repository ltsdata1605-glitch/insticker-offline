import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import { chooseMode, closePreview, newDirs, openApp } from './helpers';

const CURRENT = (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }).version;
const NEWER = '99.0.0';

interface Feed {
  url: string;
  hits: () => number;
  corrupt: (value: boolean) => void;
  close: () => Promise<void>;
}

/** Máy chủ cập nhật giả: phục vụ tệp mô tả và tệp cài cho đúng hệ điều hành đang chạy test. */
const startFeed = async (version: string): Promise<Feed> => {
  const payload = Buffer.alloc(3 * 1024 * 1024, 7);
  const sha512 = createHash('sha512').update(payload).digest('base64');
  const fileName = process.platform === 'darwin' ? `InSticker-${version}-mac-${process.arch}.zip` : `InSticker-${version}-win-x64.exe`;
  let corrupted = false;
  let downloads = 0;
  const server = http.createServer((request, response) => {
    if (request.url?.endsWith('.yml')) {
      response.end(`version: ${version}\nfiles:\n  - url: ${fileName}\n    sha512: ${sha512}\n    size: ${payload.length}\npath: ${fileName}\nsha512: ${sha512}\n`);
      return;
    }
    if (request.url?.endsWith(fileName)) {
      downloads += 1;
      const body = corrupted ? Buffer.alloc(payload.length, 9) : payload;
      response.writeHead(200, { 'content-length': body.length });
      // Tải từ từ để kịp thấy thanh tiến độ và thử bấm vào app trong lúc tải
      let sent = 0;
      const timer = setInterval(() => {
        response.write(body.subarray(sent, sent + body.length / 10));
        sent += body.length / 10;
        if (sent >= body.length) {
          clearInterval(timer);
          response.end();
        }
      }, 150);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits: () => downloads,
    corrupt: (value) => { corrupted = value; },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
};

const updateEnv = (url: string) => ({ STICKER_UPDATE_FEED: url, STICKER_UPDATE_DRY_RUN: '1' });
const gate = (win: Page) => win.getByTestId('update-gate');
const openSettings = async (win: Page) => {
  await win.getByRole('button', { name: 'Cập nhật ứng dụng' }).click();
  return win.getByTestId('update-settings');
};

test('Không có địa chỉ cập nhật (bản chạy thử): không kiểm tra, không chặn gì', async () => {
  const s = await openApp();
  const { win } = s;
  await win.waitForTimeout(3500);
  await expect(gate(win)).toHaveCount(0);
  const settings = await openSettings(win);
  await expect(settings).toContainText(`Phiên bản đang dùng: ${CURRENT}`);
  await expect(settings.getByRole('button', { name: 'Kiểm tra bản mới' })).toBeDisabled();
  await s.close();
});

test('Đang là bản mới nhất: không khoá, nút kiểm tra báo đúng', async () => {
  const feed = await startFeed(CURRENT);
  const s = await openApp(newDirs(), [], updateEnv(feed.url));
  const { win } = s;
  const settings = await openSettings(win);
  await settings.getByRole('button', { name: 'Kiểm tra bản mới' }).click();
  await expect(win.getByTestId('update-status')).toHaveText('Đang dùng bản mới nhất.');
  await expect(gate(win)).toHaveCount(0);
  expect(feed.hits()).toBe(0);
  await s.close();
  await feed.close();
});

test('Chưa có bản phát hành nào (máy chủ trả 404): coi như đang là bản mới nhất, không báo lỗi', async () => {
  const server = http.createServer((_request, response) => response.writeHead(404).end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const s = await openApp(newDirs(), [], updateEnv(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  const { win } = s;
  const settings = await openSettings(win);
  await settings.getByRole('button', { name: 'Kiểm tra bản mới' }).click();
  await expect(win.getByTestId('update-status')).toHaveText('Đang dùng bản mới nhất.');
  await expect(gate(win)).toHaveCount(0);
  await s.close();
  server.close();
});

test('Không có mạng: app vẫn dùng bình thường, giao diện vẫn không ra mạng', async () => {
  const feed = await startFeed(NEWER);
  const url = feed.url;
  await feed.close();
  const s = await openApp(newDirs(), [], updateEnv(url));
  const { win } = s;
  await win.waitForTimeout(3500);
  await expect(gate(win)).toHaveCount(0);
  await chooseMode(win, 'Giá Sốc');
  const settings = await openSettings(win);
  await expect(win.getByTestId('update-status')).toContainText('Không kiểm tra được bản mới');
  await settings.getByRole('button', { name: 'Kiểm tra bản mới' }).click();
  await expect(win.getByTestId('update-status')).toContainText('Không kiểm tra được bản mới');
  await s.close();
});

test('Có bản mới: khoá app, tải có tiến độ, xác minh xong thì tự cài', async () => {
  const feed = await startFeed(NEWER);
  const s = await openApp(newDirs(), [], updateEnv(feed.url));
  const { win, app } = s;
  await expect(gate(win)).toBeVisible({ timeout: 15_000 });
  await expect(gate(win)).toContainText(`Đang tải bản ${NEWER}`);
  await expect(win.getByTestId('update-progress')).toContainText('%');
  fs.mkdirSync('tests/output', { recursive: true });
  await win.screenshot({ path: 'tests/output/ui-cap-nhat-dang-tai.png' });

  // Lớp phủ che và khoá cả bàn phím, không có nút nào để bỏ qua khi không có sự cố
  await expect(gate(win).getByRole('button', { name: 'Dùng tiếp lần này' })).toHaveCount(0);
  expect(await win.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(true);
  const printButton = win.locator('#global-header-actions').getByRole('button', { name: 'Phiếu', exact: true });
  await expect(printButton.click({ timeout: 1000 })).rejects.toThrow();

  await expect.poll(() => app.evaluate(() => (globalThis as { __updateInstalled?: string }).__updateInstalled), { timeout: 30_000 }).toBe(NEWER);
  await expect(gate(win)).toContainText(`Đang cài bản ${NEWER}`);
  await s.close();
  await feed.close();
});

test('Tệp tải về bị lỗi: không cài, thử lại được, dùng tiếp lần này mở khoá, lần mở sau nhắc lại', async () => {
  const feed = await startFeed(NEWER);
  feed.corrupt(true);
  const dirs = newDirs();
  let s = await openApp(dirs, [], updateEnv(feed.url));
  let { win, app } = s;
  await expect(gate(win)).toContainText('Chưa cập nhật được', { timeout: 20_000 });
  await expect(gate(win)).toContainText('không khớp mã kiểm tra');
  await win.screenshot({ path: 'tests/output/ui-cap-nhat-loi.png' });
  expect(await app.evaluate(() => (globalThis as { __updateInstalled?: string }).__updateInstalled)).toBeUndefined();

  // Thử lại khi tệp vẫn lỗi rồi dùng tiếp lần này
  await gate(win).getByRole('button', { name: 'Thử lại' }).click();
  await expect(gate(win)).toContainText('Chưa cập nhật được', { timeout: 20_000 });
  expect(feed.hits()).toBe(2);
  await gate(win).getByRole('button', { name: 'Dùng tiếp lần này' }).click();
  await expect(gate(win)).toHaveCount(0);
  await chooseMode(win, 'Giá Sốc');
  await expect(win.getByTestId('update-pending-dot')).toBeVisible();

  // Trong cùng lần mở, kiểm tra định kỳ không khoá lại bản đã bỏ qua
  await app.evaluate(() => (globalThis as unknown as { __updater: { check(): Promise<unknown> } }).__updater.check());
  await win.waitForTimeout(300);
  await expect(gate(win)).toHaveCount(0);

  // Từ nút cập nhật vẫn cập nhật được khi tệp đã sửa
  feed.corrupt(false);
  const settings = await openSettings(win);
  await settings.getByRole('button', { name: 'Cập nhật ngay' }).click();
  await expect.poll(() => app.evaluate(() => (globalThis as { __updateInstalled?: string }).__updateInstalled), { timeout: 30_000 }).toBe(NEWER);
  await s.close();

  // Lần mở sau nhắc lại
  feed.corrupt(true);
  s = await openApp(dirs, [], updateEnv(feed.url));
  ({ win, app } = s);
  await expect(gate(win)).toBeVisible({ timeout: 15_000 });
  await s.close();
  await feed.close();
});

test('Tắt tự động tải: báo và chờ bấm Cập nhật ngay, tuỳ chọn còn sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  const settings = await openSettings(win);
  const toggle = settings.getByTestId('update-auto-switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  fs.mkdirSync('tests/output', { recursive: true });
  await win.screenshot({ path: 'tests/output/ui-cap-nhat-tuy-chon.png' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await win.waitForTimeout(200);
  await s.close();

  const feed = await startFeed(NEWER);
  s = await openApp(dirs, [], updateEnv(feed.url));
  ({ win } = s);
  await expect(gate(win)).toContainText(`Có bản mới ${NEWER}`, { timeout: 15_000 });
  await expect(gate(win).getByRole('button', { name: 'Dùng tiếp lần này' })).toHaveCount(0);
  expect(feed.hits()).toBe(0);
  await gate(win).getByRole('button', { name: 'Cập nhật ngay' }).click();
  await expect(gate(win)).toContainText(`Đang tải bản ${NEWER}`);
  await expect.poll(() => s.app.evaluate(() => (globalThis as { __updateInstalled?: string }).__updateInstalled), { timeout: 30_000 }).toBe(NEWER);
  expect(feed.hits()).toBe(1);
  await s.close();
  await feed.close();
});

test('Đang mở màn in khi có bản mới: chờ đóng màn in rồi mới khoá và cài', async () => {
  const feed = await startFeed(CURRENT);
  const s = await openApp(newDirs(), [], updateEnv(feed.url));
  const { win, app } = s;
  await win.waitForTimeout(3500);
  await chooseMode(win, 'Phiếu');
  await win.locator('input[type="number"]:visible').nth(1).fill('4');
  await win.waitForTimeout(500);
  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await win.getByTestId('print-summary').waitFor({ timeout: 60_000 });
  await feed.close();

  const newer = await startFeed(NEWER);
  await app.evaluate((_electron, url) => {
    const updater = (globalThis as unknown as { __updater: { feedUrl: string; check(): Promise<unknown> } }).__updater;
    updater.feedUrl = url;
    return updater.check();
  }, newer.url);
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { __updater: { getState(): { phase: string } } }).__updater.getState().phase), { timeout: 30_000 }).toBe('ready');
  await expect(gate(win)).toHaveCount(0);
  expect(await app.evaluate(() => (globalThis as { __updateInstalled?: string }).__updateInstalled)).toBeUndefined();

  await closePreview(win);
  await expect(gate(win)).toBeVisible();
  await expect.poll(() => app.evaluate(() => (globalThis as { __updateInstalled?: string }).__updateInstalled), { timeout: 10_000 }).toBe(NEWER);
  await s.close();
  await newer.close();
});

// Tạo bản đối chứng bằng đúng luồng in của web: code thật gọi window.print() trong Google Chrome thật,
// Chrome tự lưu ra PDF (--kiosk-printing, đích "Save as PDF"), giống người dùng bấm In với lề None, có in nền.
// Phải dùng Chrome thật: bản Chromium của Playwright in chữ UTM Avo đậm bằng Helvetica, khác Chrome.
// Cần dev server của dashboard đang chạy ở 127.0.0.1:5173. Chặn mọi lượt gọi tới Firebase thật.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const DASH = process.env.DASHBOARD_DIR || '/Users/ltson/Library/CloudStorage/OneDrive-Personal/YCX/dashboard';
const require = createRequire(DASH + '/package.json');
const { chromium } = require('@playwright/test');
const OUT = path.resolve(process.argv[2] || 'tests/output/web-print-that');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-print-'));
fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
  printing: { print_preview_sticky_settings: { appState: JSON.stringify({
    version: 2,
    recentDestinations: [{ id: 'Save as PDF', origin: 'local', account: '' }],
    selectedDestinationId: 'Save as PDF',
    isCssBackgroundEnabled: true,
    isHeaderFooterEnabled: false,
    marginsType: 1, // Không lề, đúng hướng dẫn trên màn hình bản web
  }) } },
  savefile: { default_directory: OUT, prompt_for_download: false },
  download: { default_directory: OUT, prompt_for_download: false },
}));

const phongTrongPdf = (buf) => {
  const names = new Set();
  const quet = (b) => { for (const m of b.toString('latin1').matchAll(/\/(?:BaseFont|FontName)\s*\/([^\s/>]+)/g)) names.add(m[1].replace(/^[A-Z]{6}\+/, '')); };
  quet(buf);
  const s = buf.toString('latin1');
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    try { quet(zlib.inflateSync(buf.subarray(start, end))); } catch { /* không phải luồng nén */ }
  }
  return [...names].sort();
};

const doiPdfMoi = async (truoc, msToiDa) => {
  const han = Date.now() + msToiDa;
  while (Date.now() < han) {
    const moi = fs.readdirSync(OUT).filter((f) => f.endsWith('.pdf') && !truoc.has(f));
    for (const f of moi) {
      const p = path.join(OUT, f);
      const a = fs.statSync(p).size;
      await new Promise((r) => setTimeout(r, 800));
      if (a > 0 && a === fs.statSync(p).size) return p;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
};

const context = await chromium.launchPersistentContext(profile, {
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--kiosk-printing'],
});
await context.route(/(firestore|identitytoolkit|securetoken|firebaseinstallations|firebaseremoteconfig)\.googleapis\.com|cloudfunctions\.net|firebaseio\.com/, (r) => r.abort());

// Tab Sticker cần đăng nhập Firebase: thay hook đăng nhập và gieo dữ liệu thẳng vào IndexedDB của hồ sơ tạm
const AUTH_STUB = `
const FAKE_USER = { uid: 'u-doichung', email: 'doichung@test.local' };
const FAKE_DATA = { uid: 'u-doichung', username: 'NV thử in', role: 'admin', storeHasAdmin: true };
export function useStickerEventAuth() {
  return { user: FAKE_USER, setUser: () => {}, userData: FAKE_DATA, setUserData: () => {},
    isInitializing: false, setIsInitializing: () => {}, handleLoginSuccess: () => {} };
}`;
await context.route('**/features/sticker-event/hooks/useStickerEventAuth.ts*', (r) =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: AUTH_STUB }));

const SP = (msp, sanPham, giaGoc, giaGiam, khuyenMai, tongThuong) => ({
  msp, sanPham, giaGoc, giaGiam, khuyenMai, tongThuong, thuongERP: tongThuong, thuongNong: 0, ngayIn: '', selected: true, quantity: 1,
});
const PRODUCTS = [
  SP('2001234', 'Nồi cơm điện Sharp 1.8 lít KS-COM19V', '1.290.000 ₫', '990.000 ₫', 'Tặng bộ hộp cơm', 40000),
  SP('2001235', 'Quạt điều hoà Daikiosan DMI03 tiết kiệm điện', '5.490.000 ₫', '3.490.000 ₫', 'Giảm thêm 200K khi mua kèm', 170000),
  SP('2001236', 'Máy sấy tóc Panasonic EH-ND37', '590.000 ₫', '450.000 ₫', '', 30000),
  SP('2001237', 'Bếp từ đôi Hafele HC-I772D', '12.990.000 ₫', '9.990.000 ₫', 'Trả góp 0%', 320000),
];

const page = context.pages()[0] ?? await context.newPage();
for (let i = 0; i < 5; i++) {
  await page.goto('http://127.0.0.1:5173/?tab=tools-print-sticker&sub=gia-soc');
  await page.waitForTimeout(3000);
  const demo = page.getByText(/Dùng thử không cần đăng nhập|Kích hoạt Chế độ Dùng Thử/i).first();
  if (await demo.isVisible().catch(() => false)) { await demo.click(); await page.waitForTimeout(3000); }
  if (await page.getByRole('button', { name: /Bấm để in/ }).first().isVisible().catch(() => false)) break;
}

const inTab = async (tab, ten, msToiDa = 60000) => {
  await page.getByRole('button', { name: tab, exact: true }).first().click();
  await page.waitForTimeout(1500);
  const truoc = new Set(fs.readdirSync(OUT));
  const t0 = Date.now();
  // window.print() chặn trang tới khi in xong nên không chờ lệnh click trả về
  await page.getByRole('button', { name: /Bấm để in/ }).first().click({ noWaitAfter: true, timeout: 5000 }).catch(() => {});
  const file = await doiPdfMoi(truoc, msToiDa);
  if (!file) { console.log(`${ten}: không thấy PDF sau ${msToiDa / 1000} giây`); return; }
  const dich = path.join(OUT, `${ten}.pdf`);
  fs.renameSync(file, dich);
  const buf = fs.readFileSync(dich);
  console.log(`${ten}: ${(buf.length / 1048576).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} giây, phông: ${phongTrongPdf(buf).join(', ')}`);
  await page.waitForTimeout(1200);
};

await inTab('Giá Sốc', 'in-gia-soc-1tem');
await inTab('Giờ Vàng', 'in-gio-vang-1tem');
// Lô đủ 4.000 phiếu chạy lâu; ở đây chỉ cần trang đầu nên giảm còn 4 phiếu trong bản thử
await page.getByRole('button', { name: 'Phiếu', exact: true }).first().click();
await page.waitForTimeout(1000);
await page.getByLabel(/Số lượng cần in/).fill('4').catch(async () => {
  await page.locator('input[type="number"]').nth(1).fill('4');
});
await page.waitForTimeout(1500);
await inTab('Phiếu', 'in-phieu-4');

// 7 bố cục của tab Sticker, cùng sản phẩm mẫu với màn thử in của app
await page.evaluate((products) => new Promise((res, rej) => {
  const r = indexedDB.open('ProductSearchDB', 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('appData')) r.result.createObjectStore('appData'); };
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const tx = r.result.transaction('appData', 'readwrite');
    const s = tx.objectStore('appData');
    s.put(products, 'products');
    s.put(products, 'displayedProducts');
    s.put(Date.now(), 'displayedProductsLastModified');
    s.put('NV thử in', 'employeeName');
    tx.oncomplete = () => { r.result.close(); res(); };
  };
}), PRODUCTS);
await page.getByRole('button', { name: 'Sticker', exact: true }).first().click();
await page.waitForTimeout(6000);
for (const [n, nhan] of [[1, '1 Sticker'], [2, '2 Sticker'], [4, '4 Sticker'], [8, '8 Sticker'], [16, '16 Sticker'], [24, '24 Sticker'], [80, 'Máy in bill']]) {
  await page.getByRole('button', { name: /In tất cả/ }).first().click();
  await page.waitForTimeout(500);
  const truoc = new Set(fs.readdirSync(OUT));
  const t0 = Date.now();
  await page.getByRole('button', { name: new RegExp(nhan) }).first().click({ noWaitAfter: true, timeout: 5000 }).catch(() => {});
  const file = await doiPdfMoi(truoc, 60000);
  if (!file) { console.log(`sticker-${n}: không thấy PDF`); continue; }
  const dich = path.join(OUT, `in-sticker-${n}.pdf`);
  fs.renameSync(file, dich);
  const buf = fs.readFileSync(dich);
  console.log(`sticker-${n}: ${(buf.length / 1048576).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} giây, phông: ${phongTrongPdf(buf).join(', ')}`);
  await page.waitForTimeout(2500);
}

await context.close();
fs.rmSync(profile, { recursive: true, force: true });
console.log('XONG');

// Chạy thử bản đã đóng gói: nhập Excel, tải file mẫu, in, sửa lỗi số tiền giảm, giữ dữ liệu sau khi mở lại.
// Dùng dữ liệu tạm và không gửi lệnh nào tới máy in. Chỉ chạy được bản của đúng hệ điều hành đang dùng.
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) throw new Error(`Không thấy tệp chạy: ${exe}`);
const OUT = path.resolve('tests/output/dong-goi');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'in-sticker-dong-goi-'));

let loi = 0;
const dat = (ten, ok, chiTiet = '') => {
  if (!ok) loi += 1;
  console.log(`${ok ? 'ĐẠT ' : 'LỖI '} ${ten}${chiTiet ? `: ${chiTiet}` : ''}`);
};

const mo = async () => {
  const app = await electron.launch({ executablePath: exe, env: { ...process.env, STICKER_USER_DATA: userData, STICKER_DOWNLOAD_DIR: OUT } });
  const win = await app.firstWindow();
  await win.waitForSelector('#global-header-actions button', { timeout: 30000 });
  await win.waitForTimeout(1200);
  return { app, win };
};
const tab = async (win, ten) => {
  await win.getByRole('button', { name: ten, exact: true }).first().click();
  await win.waitForTimeout(700);
};
const docPreview = async (win, ten) => {
  const url = await win.locator('[data-testid="print-preview"] iframe').getAttribute('src');
  const b64 = await win.evaluate(async (u) => {
    const buf = new Uint8Array(await (await fetch(u.split('#')[0])).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, url);
  const pdf = path.join(OUT, `${ten}.pdf`);
  fs.writeFileSync(pdf, Buffer.from(b64, 'base64'));
  execFileSync('sips', ['-s', 'format', 'png', '-Z', '1000', pdf, '--out', path.join(OUT, `${ten}.png`)], { stdio: 'ignore' });
};

// ---- Lần mở thứ nhất ----
let { app, win } = await mo();
const info = await app.evaluate(({ app: a }) => ({ daDongGoi: a.isPackaged, duongDan: a.getAppPath(), arch: process.arch }));
dat('Chạy từ bản đóng gói', info.daDongGoi, `${info.duongDan} (${info.arch})`);

await tab(win, 'Giá Sốc');

// Tải file mẫu: tự lưu vào thư mục Tải về
const mau = path.join(OUT, 'Sticker_Template_Gia_Soc.xlsx');
await win.getByRole('button', { name: 'Tải file mẫu' }).click();
await win.waitForTimeout(1500);
dat('Tải file mẫu', fs.existsSync(mau) && fs.statSync(mau).size > 0, fs.existsSync(mau) ? `${fs.statSync(mau).size} byte` : 'không thấy tệp');

// Nhập file mẫu: hai sản phẩm, một giảm trên 1 triệu, một giảm dưới 1 triệu
const nhap = path.join(OUT, 'nhap.xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
  ['QUẠT ĐIỀU HOÀ', 'ABC123', 'Quạt điều hoà Daikiosan DMI03', '5490000', '3490000', 'Áp dụng đến hết tháng'],
  ['NỒI CƠM', 'DEF456', 'Nồi cơm điện Sharp 1.8 lít', '1290000', '990000', 'Áp dụng đến hết tháng'],
]), 'Template');
XLSX.writeFile(wb, nhap);
await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(nhap);
await win.waitForTimeout(1500);
const hang = await win.getByText('Số lượng: 2').count();
dat('Nhập file mẫu vào hàng đợi', hang === 1, `${hang === 1 ? '2' : 'không đủ'} sản phẩm`);

// Chế độ số tiền giảm: bản in phải khớp khung xem trước
await win.locator('button[title^="Hiển thị: % Giảm"]').first().click();
await win.waitForTimeout(500);
await win.screenshot({ path: path.join(OUT, 'man-so-tien.png') });
await win.getByRole('button', { name: /Bấm để in/ }).first().click();
await win.locator('[data-testid="print-summary"]').waitFor({ timeout: 60000 });
const tomTat = (await win.locator('[data-testid="print-summary"]').innerText()).replace(/\s*\n\s*/g, ' | ');
dat('Bản in từ hàng đợi', /Số trang \| 2/.test(tomTat), tomTat);
await docPreview(win, 'so-tien-giam');
await win.keyboard.press('Escape');
await win.locator('[data-testid="print-preview"]').waitFor({ state: 'detached', timeout: 10000 });

const danhSach = await win.evaluate(async () => (await window.stickerDesktop.print.listPrinters()).length);
dat('Đọc danh sách máy in', danhSach >= 0, `${danhSach} máy`);

await win.waitForTimeout(1500); // chờ lưu IndexedDB (trễ 500 ms)
const chan = await app.evaluate(() => globalThis.__blockedRequests);
dat('Không có yêu cầu ra mạng', chan.length === 0, chan.length ? JSON.stringify(chan.slice(0, 5)) : '');
await app.close();

// ---- Lần mở thứ hai: dữ liệu phải còn ----
({ app, win } = await mo());
await tab(win, 'Giá Sốc');
const conHang = await win.getByText('Số lượng: 2').count();
if (!conHang) {
  await win.getByRole('button', { name: /D\.Sách/ }).first().click().catch(() => {});
  await win.waitForTimeout(500);
}
dat('Giữ hàng đợi sau khi đóng và mở lại', (await win.getByText('Số lượng: 2').count()) === 1);
await app.close();

fs.rmSync(userData, { recursive: true, force: true });
console.log(loi ? `CÓ ${loi} LỖI` : 'TẤT CẢ ĐẠT');

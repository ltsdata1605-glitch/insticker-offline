// Chạy app thật bằng Electron, in từng chế độ ra PDF rồi so với bản in của web (tests/baseline).
// Dùng thư mục dữ liệu tạm nên không đụng dữ liệu thật. Không gửi lệnh nào tới máy in.
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const XLSX = createRequire(import.meta.url)('xlsx');

const OUT = path.resolve('tests/output');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'in-sticker-test-'));

const log = (...a) => console.log(...a);
const rows = [];

const app = await electron.launch({ args: ['.'], env: { ...process.env, STICKER_USER_DATA: userData, STICKER_DOWNLOAD_DIR: OUT } });
const win = await app.firstWindow();
const loiTrang = [];
win.on('pageerror', (e) => loiTrang.push(e.message));
win.on('console', (m) => { if (m.type() === 'error') loiTrang.push(m.text()); });
await win.waitForSelector('#global-header-actions button', { timeout: 30000 });
await win.waitForTimeout(1500);

const chupCuaSo = async (ten) => {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.isVisible());
    return (await w.webContents.capturePage()).toPNG().toString('base64');
  });
  fs.writeFileSync(path.join(OUT, `${ten}.png`), Buffer.from(png, 'base64'));
};

const chonTab = async (ten) => {
  await win.getByRole('button', { name: ten, exact: true }).first().click();
  await win.waitForTimeout(700);
};

const docPreviewPdf = async (ten) => {
  const url = await win.locator('[data-testid="print-preview"] iframe').getAttribute('src');
  const b64 = await win.evaluate(async (u) => {
    const buf = new Uint8Array(await (await fetch(u.split('#')[0])).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, url);
  const file = path.join(OUT, `${ten}.pdf`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
};

// So điểm ảnh bằng chính Electron để không cần thêm thư viện
const soDiemAnh = (a, b) => app.evaluate(({ nativeImage }, [pa, pb]) => {
  const ia = nativeImage.createFromPath(pa);
  const ib = nativeImage.createFromPath(pb);
  const sa = ia.getSize();
  const sb = ib.getSize();
  if (sa.width !== sb.width || sa.height !== sb.height) return { lech: 100, kichThuoc: `${sa.width}x${sa.height} và ${sb.width}x${sb.height}` };
  const da = ia.toBitmap();
  const db = ib.toBitmap();
  let khac = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) khac += 1;
  }
  return { lech: (khac / (da.length / 4)) * 100, kichThuoc: `${sa.width}x${sa.height}` };
}, [a, b]);

const kichThuocTrang = (file) => {
  const s = fs.readFileSync(file).toString('latin1');
  const box = s.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  return box ? `${(box[1] / 72 * 25.4).toFixed(1)}×${(box[2] / 72 * 25.4).toFixed(1)}mm` : '?';
};

const inVaSo = async (ten, baseline) => {
  const preview = win.locator('[data-testid="print-preview"]');
  await preview.waitFor({ timeout: 60000 });
  const tomTat = win.locator('[data-testid="print-summary"]');
  await tomTat.waitFor({ timeout: 300000 });
  const summary = (await tomTat.innerText()).replace(/\s*\n\s*/g, ' | ');
  const pdf = await docPreviewPdf(ten);
  await win.waitForTimeout(1200);
  await chupCuaSo(`preview-${ten}`);
  const png = path.join(OUT, `${ten}.png`);
  execFileSync('sips', ['-s', 'format', 'png', '-Z', '1200', pdf, '--out', png], { stdio: 'ignore' });
  const kq = baseline ? await soDiemAnh(path.resolve(`tests/baseline/web-${baseline}.png`), png) : null;
  rows.push({ ten, trang: kichThuocTrang(pdf), lech: kq ? `${kq.lech.toFixed(3)}%` : '-', summary });
  log(`${ten}: ${kichThuocTrang(pdf)} lệch ${kq ? kq.lech.toFixed(3) + '%' : '-'} | ${summary}`);
};

const dongPreview = async () => {
  await win.keyboard.press('Escape');
  await win.locator('[data-testid="print-preview"]').waitFor({ state: 'detached', timeout: 10000 });
  await win.waitForTimeout(400);
};

for (const [tab, ten] of [['Giá Sốc', 'gia-soc'], ['Giờ Vàng', 'gio-vang'], ['Phiếu', 'phieu']]) {
  await chonTab(tab);
  await chupCuaSo(`ui-${ten}`);
}

await chonTab('Giá Sốc');
await win.getByRole('button', { name: /Bấm để in/ }).first().click();
await inVaSo('in-gia-soc-1tem', 'in-gia-soc-1tem');
await dongPreview();

await chonTab('Giờ Vàng');
await win.getByRole('button', { name: /Bấm để in/ }).first().click();
await inVaSo('in-gio-vang-1tem', 'in-gio-vang-1tem');
await dongPreview();

// 7 bố cục tab Sticker: đi qua luồng thật với cùng sản phẩm như bản đối chứng
const dongGia = (msp, ten, goc, giam, km, thuong) => {
  const hang = Array(33).fill('');
  hang[0] = ten; hang[4] = goc; hang[5] = giam; hang[7] = km; hang[30] = 'Ngày in: 04/11/2026'; hang[31] = thuong; hang[32] = msp;
  return hang;
};
const fileGia = path.join(OUT, 'bang-gia.xlsx');
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    dongGia('2001234', 'Nồi cơm điện Sharp 1.8 lít KS-COM19V', '1290000', '990000', 'Tặng bộ hộp cơm', '40A'),
    dongGia('2001235', 'Quạt điều hoà Daikiosan DMI03 tiết kiệm điện', '5490000', '3490000', 'Giảm thêm 200K khi mua kèm', '170A'),
    dongGia('2001236', 'Máy sấy tóc Panasonic EH-ND37', '590000', '450000', '', '30A'),
    dongGia('2001237', 'Bếp từ đôi Hafele HC-I772D', '12990000', '9990000', 'Trả góp 0%', '320A'),
  ]), 'Sheet1');
  XLSX.writeFile(wb, fileGia);
}
await chonTab('Sticker');
await win.locator('#employee-name-input').fill('NV thử in');
await win.locator('#employee-name-input').press('Enter');
await win.locator('#price-file-input').setInputFiles(fileGia);
await win.waitForTimeout(800);
for (const msp of ['2001234', '2001235', '2001236', '2001237']) {
  await win.getByLabel('Tìm sản phẩm').first().fill(msp);
  await win.locator('li', { hasText: msp }).first().click();
  await win.waitForTimeout(150);
}
await chupCuaSo('ui-sticker');
for (const [n, nhan] of [[1, '1 Sticker'], [2, '2 Sticker'], [4, '4 Sticker'], [8, '8 Sticker'], [16, '16 Sticker'], [24, '24 Sticker'], [80, 'Máy in bill']]) {
  await win.getByRole('button', { name: /In tất cả/ }).click();
  await win.getByRole('button', { name: new RegExp(nhan) }).first().click();
  await inVaSo(`in-sticker-${n}`, n === 80 ? null : `in-sticker-${n}`);
  await dongPreview();
}

// 4.000 phiếu: mở xem trước và tạo đủ PDF, đo thời gian
await chonTab('Phiếu');
const t0 = Date.now();
await win.getByRole('button', { name: /Bấm để in/ }).first().click();
await inVaSo('in-phieu-mac-dinh', 'in-phieu-mac-dinh');
const moXemTruoc = Date.now() - t0;
log(`Phiếu 4.000: từ lúc bấm in tới khi xem trước sẵn sàng ${(moXemTruoc / 1000).toFixed(1)} giây`);

// Trang cuối phải đúng số phiếu và còn nền: dựng riêng trang 1000 từ cửa sổ in ẩn.
const trangCuoi = await app.evaluate(async ({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => !x.isVisible());
  const pdf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageRanges: '1000' });
  return pdf.toString('base64');
});
const pdfCuoi = path.join(OUT, 'phieu-trang-1000.pdf');
fs.writeFileSync(pdfCuoi, Buffer.from(trangCuoi, 'base64'));
execFileSync('sips', ['-s', 'format', 'png', '-Z', '1200', pdfCuoi, '--out', path.join(OUT, 'phieu-trang-1000.png')], { stdio: 'ignore' });

const pdfDayDu = path.join(OUT, 'phieu-day-du.pdf');
await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, pdfDayDu);
const t1 = Date.now();
await win.getByRole('button', { name: 'Lưu PDF' }).click();
await win.getByText(/Đã lưu PDF/).first().waitFor({ timeout: 590000 });
const luuPdf = Date.now() - t1;
const kichThuoc = fs.statSync(pdfDayDu).size / 1048576;
const soTrang = (fs.readFileSync(pdfDayDu).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
log(`Phiếu 4.000: lưu PDF đủ ${soTrang} trang, ${kichThuoc.toFixed(1)} MB, ${(luuPdf / 1000).toFixed(1)} giây`);
fs.rmSync(pdfDayDu);
await dongPreview();

const mayIn = await win.evaluate(() => window.stickerDesktop.print.listPrinters());
log('Máy in thấy được:', JSON.stringify(mayIn));

const chan = await app.evaluate(() => globalThis.__blockedRequests);
log('Yêu cầu ra mạng bị chặn:', chan.length, JSON.stringify(chan.slice(0, 8)));
log('Lỗi trang:', loiTrang.length, JSON.stringify(loiTrang.slice(0, 8)));

const ver = await app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }));
log('Phiên bản:', JSON.stringify(ver));

await app.close();
fs.rmSync(userData, { recursive: true, force: true });
log('XONG');

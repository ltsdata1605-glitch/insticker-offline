import { expect, test } from '@playwright/test';
import { chooseMode, chooseSubTab, closePreview, evalInPrintDoc, newDirs, openApp, printSummary } from './helpers';

test('Số bắt đầu, số lượng và công tắc tự nhảy số', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Phiếu');

  const inputs = win.locator('input[type="number"]:visible');
  await inputs.nth(0).fill('101');
  await inputs.nth(1).fill('8');
  await expect(win.getByRole('button', { name: /Bấm để in \(2\)/ })).toBeVisible();
  await win.waitForTimeout(600);

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  expect(await printSummary(win)).toContain('Số trang | 2');
  const codes = await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('.display-code-right')].map((e) => e.textContent)`);
  expect(codes).toEqual(['101', '102', '103', '104', '105', '106', '107', '108']);
  await closePreview(win);

  // Tắt tự nhảy số: giữ nguyên số đang có và ô mã số chuyển sang kiểu nhập tay, như bản web
  await win.getByRole('switch').click();
  await win.waitForTimeout(600);
  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  const manual = await evalInPrintDoc<{ input: number; display: number }>(s, `({
    input: document.querySelectorAll('.input-code-left').length,
    display: document.querySelectorAll('.display-code-left').length,
  })`);
  expect(manual).toEqual({ input: 8, display: 0 });
  await closePreview(win);
  await s.close();
});

test('Chọn nền TGĐ, sửa nội dung phiếu 1 áp cho mọi phiếu, còn sau khi mở lại, nút Mặc định khôi phục', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await chooseMode(win, 'Phiếu');
  await win.locator('input[type="number"]:visible').nth(1).fill('8');
  await win.waitForTimeout(600);
  await win.getByRole('button', { name: 'TGĐ', exact: true }).click();

  const title = win.locator('#print-section .input-title-single').first();
  await title.click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type('PHIẾU THỬ NGHIỆM');
  await win.locator('#print-section .input-footer-left').first().click();
  await win.waitForTimeout(1200);

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  const result = await evalInPrintDoc<{ titles: string[]; bg: string }>(s, `({
    titles: [...new Set([...document.querySelectorAll('.input-title-single')].map((e) => e.textContent))],
    bg: document.querySelector('.draw-page').style.backgroundImage,
  })`);
  expect(result.titles).toEqual(['PHIẾU THỬ NGHIỆM']);
  expect(result.bg).toContain('bg_phieutgd.png');
  await closePreview(win);
  await win.waitForTimeout(2500); // chờ app lưu xuống máy
  await s.close();

  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Phiếu');
  await expect(win.locator('#print-section .input-title-single').first()).toHaveText('PHIẾU THỬ NGHIỆM');

  await win.getByTitle('Khôi phục toàn bộ phiếu và cấu hình về mẫu mặc định').click();
  await expect(win.locator('#print-section .input-title-single').first()).toContainText('PHIẾU RÚT THĂM');
  await chooseSubTab(win, /Lịch sử/);
  await expect(win.locator('p', { hasText: 'Phiếu Rút Thăm — Mẫu mặc định' })).toBeVisible();
  await s.close();
});

test('4.000 phiếu: màn chờ hiện ngay, app vẫn thao tác được, đủ 1.000 trang', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Phiếu');
  const t0 = Date.now();
  await win.getByRole('button', { name: /Bấm để in \(1000\)/ }).click();
  await expect(win.getByText('Đang dựng bản in...')).toBeVisible();
  const spinnerMs = Date.now() - t0;
  const summary = await printSummary(win);
  const readyMs = Date.now() - t0;
  console.log(`4.000 phiếu: màn chờ sau ${spinnerMs} ms, xem trước sau ${(readyMs / 1000).toFixed(1)} giây`);
  expect(summary).toContain('Số trang | 1.000');
  expect(spinnerMs).toBeLessThan(2000);
  const last = await evalInPrintDoc<string>(s, `[...document.querySelectorAll('.display-code-right')].pop().textContent`);
  expect(last).toBe('4000');
  await closePreview(win);
  await s.close();
});

test('Thanh định dạng chữ: bôi đen rồi đổi đậm nhạt, bản in nhận đúng', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Phiếu');
  await win.locator('input[type="number"]:visible').nth(1).fill('4');
  await win.waitForTimeout(600);

  const footer = win.locator('#print-section .input-footer-left').first();
  await footer.click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type('SIÊU THỊ THỬ');
  await win.keyboard.press('ControlOrMeta+a');
  await win.getByTitle('In đậm (Bold)').click();
  await win.waitForTimeout(300);

  await win.locator('#print-section .input-title-single').first().click();
  await win.waitForTimeout(800);
  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  const html = await evalInPrintDoc<string>(s, `document.querySelector('.input-footer-left').innerHTML`);
  expect(html).toContain('SIÊU THỊ THỬ');
  // Ô này mặc định đã đậm nên bấm In đậm sẽ chuyển sang chữ thường
  expect(html).toContain('font-weight: normal');
  await closePreview(win);
  await s.close();
});

test('Chọn phông giao diện: áp dụng ngay, bản in nhận theo, còn sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await chooseMode(win, 'Giá Sốc');
  await win.getByTitle(/Font hiện tại/).click();
  await win.getByRole('button', { name: 'Oswald' }).click();
  await expect(win.getByTitle('Font hiện tại: Oswald')).toBeVisible();
  const loaded = await win.evaluate(async () => {
    await document.fonts.load("700 20px 'Oswald'", 'Ệ');
    return document.fonts.check("700 20px 'Oswald'", 'Ệ');
  });
  expect(loaded, 'Phông Oswald có sẵn trong app').toBe(true);

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  const family = await evalInPrintDoc<string>(s, `getComputedStyle(document.querySelector('#print-host')).fontFamily`);
  expect(family).toContain('Oswald');
  await closePreview(win);
  await win.waitForTimeout(500);
  await s.close();

  s = await openApp(dirs);
  win = s.win;
  await expect(win.getByTitle('Font hiện tại: Oswald')).toBeVisible();
  await s.close();
});

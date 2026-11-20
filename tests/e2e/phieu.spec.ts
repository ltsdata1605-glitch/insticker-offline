import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { chooseMode, chooseStickersPerPage, chooseSubTab, closePreview, evalInPrintDoc, newDirs, openApp, printSummary } from './helpers';

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

test('Giá Sốc, Giờ Vàng, Phiếu: xem trước và khung điều khiển cỡ vừa phải, nằm giữa cửa sổ', async () => {
  const s = await openApp();
  const { win } = s;
  // Máy có màn hình thấp (như máy build Windows) app dùng cỡ tối thiểu nên phải kiểm tra cả cửa sổ nhỏ
  for (const size of [{ width: 1440, height: 900 }, { width: 1100, height: 720 }]) {
    await s.app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows()[0].setSize(width, height), size);
    await win.waitForTimeout(300);
    for (const mode of ['Giá Sốc', 'Giờ Vàng', 'Phiếu'] as const) {
      await chooseMode(win, mode);
      const label = `${mode}, cửa sổ ${size.width}x${size.height}`;
      const layout = await win.evaluate(() => {
        const preview = (document.querySelector('#print-section .sticker-container.active-preview-page')
          ?? document.querySelector('#print-section .sticker-container')) as HTMLElement;
        const button = [...document.querySelectorAll('button')].find((b) => /Bấm để in/.test(b.textContent ?? '')) as HTMLElement;
        const box = preview.getBoundingClientRect();
        const panel = (button.closest('.no-print') as HTMLElement).getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          previewWidth: box.width,
          // Cả khung xem trước, gồm thanh chuyển trang của Phiếu, phải thấy được mà không cần cuộn
          previewBottom: (document.querySelector('#print-section')?.parentElement as HTMLElement).getBoundingClientRect().bottom,
          previewRight: box.right,
          buttonLeft: button.getBoundingClientRect().left,
          panelWidth: panel.width,
          // Tính trong vùng nội dung, bên phải thanh chức năng
          leftGap: box.left - (document.querySelector('[data-app-main]') as HTMLElement).getBoundingClientRect().left,
          rightGap: innerWidth - panel.right,
          // Thẻ Dữ liệu của khung điều khiển phải hiện đủ, không có thanh cuộn
          panelScroll: (() => {
            const area = button.closest('.no-print')!.querySelector('.scrollbar-thin') as HTMLElement;
            return area.scrollHeight - area.clientHeight;
          })(),
        };
      });
      console.log(`${label}: xem trước ${layout.previewWidth.toFixed(1)}, đáy ${layout.previewBottom.toFixed(0)}/${layout.height}, khung ${layout.panelWidth.toFixed(0)}, trái ${layout.leftGap.toFixed(0)}, phải ${layout.rightGap.toFixed(0)}`);
      expect(layout.pageOverflow, `${label}: không tràn ngang`).toBeLessThanOrEqual(0);
      // Tem tối thiểu 384 px tính cả viền khung, phần tem bên trong hụt khoảng 2 px.
      // Phiếu nhỏ hơn một chút vì chừa chỗ cho thanh chuyển trang, để thấy đủ mà không phải cuộn.
      const minWidth = mode === 'Phiếu' ? 340 : 380;
      expect(layout.previewWidth, `${label}: xem trước không nhỏ hơn cỡ tối thiểu`).toBeGreaterThanOrEqual(minWidth);
      expect(layout.previewWidth, `${label}: xem trước không quá to`).toBeLessThanOrEqual(460);
      // Cửa sổ thật thấp hơn cỡ tối thiểu thì được phép cuộn
      if (layout.height >= 660) {
        expect(layout.previewBottom, `${label}: xem trước nằm gọn trong màn hình`).toBeLessThanOrEqual(layout.height);
      }
      expect(layout.buttonLeft, `${label}: khung điều khiển nằm bên phải xem trước`).toBeGreaterThan(layout.previewRight);
      expect(layout.panelScroll, `${label}: khung điều khiển không phải cuộn`).toBeLessThanOrEqual(0);
      expect(layout.panelWidth, `${label}: khung điều khiển không quá rộng`).toBeLessThanOrEqual(480);
      expect(layout.panelWidth, `${label}: khung điều khiển đủ chỗ cho các nút`).toBeGreaterThan(400);
      // Xem trước và khung điều khiển nằm giữa cửa sổ, khoảng trống hai bên cân nhau
      expect(Math.abs(layout.leftGap - layout.rightGap), `${label}: cân giữa vùng nội dung`).toBeLessThan(30);
      if (size.width === 1440) {
        fs.mkdirSync('tests/output', { recursive: true });
        await win.screenshot({ path: `tests/output/ui-rong-${mode === 'Phiếu' ? 'phieu' : mode === 'Giá Sốc' ? 'gia-soc' : 'gio-vang'}.png` });
      }
    }
  }
  await s.close();
});

test('Chọn phông lúc app còn đang đọc phông đã lưu: lựa chọn không bị trả về mặc định, mở lại vẫn còn', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  // Giả lập máy chậm: đọc phông đã lưu mất 4 giây
  await win.addInitScript(() => {
    const read = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      const request = read.call(this, key);
      if (key !== 'globalFont') return request;
      let onSuccess: ((event: Event) => void) | null = null;
      Object.defineProperty(request, 'onsuccess', { configurable: true, set(handler) { onSuccess = handler; }, get() { return onSuccess; } });
      const holder = window as unknown as { __fontRead?: boolean };
      request.addEventListener('success', (event) => {
        setTimeout(() => {
          onSuccess?.call(request as never, event);
          holder.__fontRead = true;
        }, 4000);
      });
      return request;
    };
  });
  await win.reload();
  await win.waitForSelector('#global-header-actions button', { timeout: 120_000 });
  await win.waitForTimeout(500);
  const fontRead = () => win.evaluate(() => Boolean((window as unknown as { __fontRead?: boolean }).__fontRead));
  expect(await fontRead(), 'Chọn trước khi đọc xong').toBe(false);

  await win.getByTitle(/Font hiện tại/).click();
  await win.getByRole('button', { name: 'Oswald' }).click();
  await expect(win.getByTitle('Font hiện tại: Oswald')).toBeVisible();

  await expect.poll(fontRead, { timeout: 15_000 }).toBe(true);
  await win.waitForTimeout(300);
  await expect(win.getByTitle('Font hiện tại: Oswald')).toBeVisible();
  // Phông thật trên giao diện cũng phải giữ nguyên, không chỉ dòng chữ trên nút
  expect(await win.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Oswald');
  await win.waitForTimeout(500);
  await s.close();

  s = await openApp(dirs);
  win = s.win;
  await expect(win.getByTitle('Font hiện tại: Oswald')).toBeVisible();
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
  await chooseStickersPerPage(win);
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

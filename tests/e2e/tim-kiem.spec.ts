import { expect, test } from '@playwright/test';
import { chooseMode, newDirs, openApp, rowWith, writeWorkbook } from './helpers';

test('Thêm bằng ô tìm kiếm rồi bấm ngay vào ô số lượng: số gõ vào đúng ô số lượng, không bị kéo về ô tìm kiếm', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Sticker');
  const name = win.locator('#employee-name-input');
  if (await name.isVisible().catch(() => false)) {
    await name.fill('NV thử in');
    await name.press('Enter');
  }
  const row = (msp: string, product: string) => rowWith({ 0: product, 4: '2900000', 5: '2390000', 30: 'Ngày in: 04/11/2026', 31: '40A', 32: msp });
  await win.locator('#price-file-input').setInputFiles(writeWorkbook(dirs, 'gia.xlsx', [row('3001002', 'Nồi chiên'), row('3001003', 'Ấm siêu tốc')]));
  await expect(win.getByTestId('price-table-status')).toContainText('2 SP');

  // Máy chậm: khung hình kế tiếp, lúc app đưa con trỏ về ô tìm kiếm, đến đúng khi người dùng vừa bấm vào ô số lượng.
  // Trên máy Mac của CI từng gặp đúng cảnh này: số tem gõ vào rơi sang ô tìm kiếm.
  await win.evaluate(() => {
    let pending: FrameRequestCallback | null = null;
    window.requestAnimationFrame = (callback) => {
      pending = callback;
      return 1;
    };
    document.addEventListener('focusin', (event) => {
      if (pending && (event.target as HTMLElement).getAttribute('aria-label')?.startsWith('Số lượng tem')) {
        const run = pending;
        pending = null;
        setTimeout(() => run(performance.now()), 0);
      }
    });
  });
  const search = win.getByLabel('Tìm sản phẩm').first();
  await search.fill('3001002');
  await win.getByRole('listbox', { name: 'Gợi ý sản phẩm' }).getByRole('option', { name: /3001002/ }).first().click();
  await win.waitForTimeout(150);
  const quantity = win.locator('[data-msp="3001002"]').getByLabel('Số lượng tem 3001002');
  await quantity.fill('4');
  await win.waitForTimeout(300);

  await expect(quantity).toHaveValue('4');
  await expect(search).toHaveValue('');
  await expect(quantity).toBeFocused();
  await s.close();
});

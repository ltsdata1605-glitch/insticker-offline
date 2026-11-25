import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { closePreview, downloadedFiles, evalInPrintDoc, inspectImage, newDirs, openApp, printSummary, waitForDownloads } from './helpers';

const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });

test('Tạo mã: nhập mã có tiêu đề, dán nhiều dòng, QR và mã vạch, số bản, chọn số mã mỗi trang, in, xuất ảnh từng mã và theo trang, còn danh sách khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await rail(win).getByRole('button', { name: 'Tạo mã' }).click();
  await expect(win.getByRole('heading', { level: 1 })).toHaveText('Tạo mã');

  // Chỉ có một dòng trống, ô nội dung đứng trước; gõ nội dung là dòng trống mới hiện ra bên dưới, Enter xuống gõ tiếp
  await expect(win.getByTestId('dong-ma')).toHaveCount(1);
  await win.getByLabel('Nội dung mã 1').fill('SP-00123');
  await expect(win.getByTestId('dong-ma')).toHaveCount(2);
  await win.getByLabel('Tiêu đề mã 1').fill('Tủ lạnh LG 260L');
  await win.getByLabel('Tiêu đề mã 1').press('Enter');
  await expect(win.getByLabel('Nội dung mã 2')).toBeFocused();
  await win.keyboard.type('https://insticker.vn/san-pham?id=123');
  const preview = win.getByTestId('trang-xem-truoc');
  await expect(preview.locator('.tm-o')).toHaveCount(2);
  await expect(preview.locator('.tm-o').first()).toContainText('Tủ lạnh LG 260L');
  await expect(preview.locator('.tm-qr svg')).toHaveCount(2);

  // Dán nhiều dòng: hai cột là tiêu đề và nội dung
  await win.getByRole('button', { name: 'Nhập nhiều dòng' }).click();
  const bulk = win.getByRole('dialog', { name: 'Nhập nhiều mã' });
  await bulk.getByLabel('Các dòng mã').fill('Máy giặt Toshiba\tSP-00456\nĐồng hồ | Chữ có dấu\n8934563138165\n\n');
  await expect(bulk).toContainText('Đọc được 3 mã, 2 có tiêu đề');
  await bulk.getByRole('button', { name: 'Thêm 3 mã' }).click();
  // 5 mã và luôn một dòng trống ở cuối để gõ tiếp
  await expect(win.getByTestId('dong-ma')).toHaveCount(6);
  await expect(win.getByTestId('dong-ma').last()).toHaveAttribute('data-trong', '');
  await expect(win.getByText('Danh sách mã (5)')).toBeVisible();
  await expect(win.getByLabel('Tiêu đề mã 3')).toHaveValue('Máy giặt Toshiba');
  await expect(win.getByRole('button', { name: /^In 5 mã/ })).toBeVisible();

  // Mã vạch: nội dung có dấu báo lỗi và không in
  await win.getByRole('group', { name: 'Loại mã' }).getByRole('button', { name: 'Mã vạch', exact: true }).click();
  await expect(win.getByTestId('dong-ma').nth(3)).toContainText('Mã vạch chỉ nhận chữ không dấu');
  await expect(win.getByText('1 dòng lỗi (viền đỏ) sẽ không in, không xuất.')).toBeVisible();
  await expect(preview.locator('.tm-vach svg')).toHaveCount(4);
  await expect(preview.locator('.tm-qr svg')).toHaveCount(0);
  // QR + mã vạch: đường link không có dấu nên dùng được cả hai
  await win.getByRole('group', { name: 'Loại mã' }).getByRole('button', { name: 'QR + mã vạch' }).click();
  await expect(preview.locator('.tm-qr svg')).toHaveCount(4);
  await expect(preview.locator('.tm-vach svg')).toHaveCount(4);

  // Mỗi mã nhiều bản, 4 mã mỗi trang
  await win.getByLabel('Số bản mã 1').fill('6');
  await win.getByLabel('Số mã mỗi trang').selectOption('4');
  await expect(win.getByRole('button', { name: 'In 9 mã (3 trang)' })).toBeVisible();
  await expect(win.getByText(/trang 1\/3/)).toBeVisible();
  await expect(preview.locator('.tm-o')).toHaveCount(4);
  await win.getByRole('button', { name: 'Trang sau' }).click();
  await win.getByRole('button', { name: 'Trang sau' }).click();
  await expect(preview.locator('.tm-o')).toHaveCount(1);

  // In: 3 trang A4, mỗi trang 4 mã, đúng 9 mã
  await win.getByRole('button', { name: 'In 9 mã (3 trang)' }).click();
  await printSummary(win);
  await expect(win.getByTestId('print-preview')).toContainText('9 mã · 3 trang · 2 cột × 2 hàng mỗi trang');
  expect(await printSummary(win)).toContain('Số trang | 3');
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tm-trang').length`)).toBe(3);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tm-o').length`)).toBe(9);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tm-qr svg').length`)).toBe(9);
  await closePreview(win);

  // Ảnh từng mã: mỗi mã một ảnh (không lặp theo số bản), đánh số theo dòng, bỏ dòng lỗi
  await win.getByRole('button', { name: 'Ảnh từng mã' }).click();
  await waitForDownloads(s, 4);
  const codes = downloadedFiles(s.dirs).filter(name => name.startsWith('QR_'));
  expect(codes).toEqual(['QR_01_Tu_lanh_LG_260L.png', 'QR_02_https_insticker_vn_san_pham_id_123.png', 'QR_03_May_giat_Toshiba.png', 'QR_05_8934563138165.png']);
  await expect(win.getByText('Đã xuất 4 ảnh, bỏ qua 1 dòng lỗi')).toBeVisible();
  const image = await inspectImage(s, path.join(s.dirs.downloads, codes[0]));
  expect(image.width).toBeGreaterThanOrEqual(860);
  expect(image.inkRatio).toBeGreaterThan(0.15);

  // Ảnh theo trang: 3 ảnh A4
  await win.getByRole('button', { name: 'Ảnh theo trang' }).click();
  await waitForDownloads(s, 7);
  const pages = downloadedFiles(s.dirs).filter(name => name.startsWith('Trang_ma_'));
  expect(pages).toEqual(['Trang_ma_1_cua_3.png', 'Trang_ma_2_cua_3.png', 'Trang_ma_3_cua_3.png']);
  const page = await inspectImage(s, path.join(s.dirs.downloads, pages[0]));
  expect(page.height / page.width).toBeCloseTo(297 / 210, 1);

  // Mở lại app: danh sách và cài đặt còn nguyên
  await win.waitForTimeout(800);
  await s.close();
  s = await openApp(dirs);
  win = s.win;
  await rail(win).getByRole('button', { name: 'Tạo mã' }).click();
  await expect(win.getByRole('heading', { level: 1 })).toHaveText('Tạo mã');
  await expect(win.getByTestId('dong-ma')).toHaveCount(6);
  await expect(win.getByLabel('Số bản mã 1')).toHaveValue('6');
  await expect(win.getByLabel('Số mã mỗi trang')).toHaveValue('4');
  await expect(win.getByRole('group', { name: 'Loại mã' }).getByRole('button', { name: 'QR + mã vạch' })).toHaveAttribute('aria-pressed', 'true');

  // Xoá hết
  await win.getByRole('button', { name: 'Xoá hết' }).click();
  await win.getByRole('button', { name: 'Xoá hết', exact: true }).last().click();
  await expect(win.getByTestId('dong-ma')).toHaveCount(1);
  await expect(win.getByLabel('Nội dung mã 1')).toHaveValue('');
  await s.close();
});

test('Tạo mã: rê chuột vào mã nào chỉ hiện mã đó, bấm chọn mã rồi bấm mũi tên lên xuống để chuyển mã, sang cả trang sau', async () => {
  const s = await openApp();
  const { win } = s;
  await rail(win).getByRole('button', { name: 'Tạo mã' }).click();
  await win.getByRole('button', { name: 'Nhập nhiều dòng' }).click();
  await win.getByRole('dialog', { name: 'Nhập nhiều mã' }).getByLabel('Các dòng mã').fill('MA-1\nMA-2\nMA-3\nMA-4\nMA-5');
  await win.getByRole('button', { name: 'Thêm 5 mã' }).click();
  await win.getByLabel('Số mã mỗi trang').selectOption('4');
  const cells = win.getByTestId('trang-xem-truoc').locator('.tm-o');
  await expect(cells).toHaveCount(4);
  /** Ô nào còn hiện mã (ô khác ẩn mã để máy quét không đọc nhầm) */
  const shown = () => cells.evaluateAll(list => list.map(cell => getComputedStyle(cell.querySelector('.tm-ma')!).visibility === 'visible'));
  const away = () => win.getByRole('button', { name: 'Nhập nhiều dòng' }).hover();
  await expect.poll(shown).toEqual([true, true, true, true]);

  // Rê chuột: chỉ hiện mã đang rê; chuột ra ngoài thì hiện lại tất cả
  await cells.nth(2).hover();
  await expect.poll(shown).toEqual([false, false, true, false]);
  await away();
  await expect.poll(shown).toEqual([true, true, true, true]);

  // Bấm chọn: chuột đi chỗ khác vẫn chỉ hiện mã đã chọn
  await cells.nth(1).click();
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 2/5');
  await away();
  await expect.poll(shown).toEqual([false, true, false, false]);

  // Mũi tên xuống sang mã sau, hết trang thì sang trang sau; ở mã cuối thì đứng yên
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('ArrowDown');
  await expect.poll(shown).toEqual([false, false, false, true]);
  await win.keyboard.press('ArrowDown');
  await expect(win.getByText(/trang 2\/2/)).toBeVisible();
  await expect(cells).toHaveCount(1);
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 5/5');
  await win.keyboard.press('ArrowDown');
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 5/5');
  // Mũi tên lên về mã trước, về cả trang trước
  await win.keyboard.press('ArrowUp');
  await expect(win.getByText(/trang 1\/2/)).toBeVisible();
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 4/5');
  await expect.poll(shown).toEqual([false, false, false, true]);

  // Cuộn khung bên phải xuống hết: phần đầu Xem trước dính trên cùng, chỉ trang mã chạy bên dưới
  const panel = win.getByTestId('tao-ma-khung-phai');
  const layout = () => panel.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    const box = element.getBoundingClientRect();
    const head = element.querySelector('[data-testid="xem-truoc-dau"]')!.getBoundingClientRect();
    const page = element.querySelector('[data-testid="trang-xem-truoc"]')!.getBoundingClientRect();
    return { scrolls: element.scrollHeight > element.clientHeight + 50, headAtTop: Math.abs(head.top - box.top) < 2, pageUnderHead: page.top < head.top };
  });
  await expect.poll(layout).toEqual({ scrolls: true, headAtTop: true, pageUnderHead: true });
  await expect(win.getByTestId('ma-dang-chon')).toBeVisible();
  // Đi lên mã đầu trang: ô đó kéo xuống dưới phần đầu đang dính, không bị che
  await win.keyboard.press('ArrowUp');
  await win.keyboard.press('ArrowUp');
  await win.keyboard.press('ArrowUp');
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 1/5');
  await expect.poll(() => panel.evaluate(element => {
    const head = element.querySelector('[data-testid="xem-truoc-dau"]')!.getBoundingClientRect();
    const cell = element.querySelector('[data-testid="trang-xem-truoc"] .tm-o')!.getBoundingClientRect();
    return cell.top >= head.bottom - 1;
  })).toBe(true);
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('ArrowDown');
  await win.keyboard.press('ArrowDown');
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 4/5');

  // Đang gõ trong ô thì phím mũi tên để cho ô, không chuyển mã
  await win.getByLabel('Nội dung mã 1').click();
  await win.keyboard.press('ArrowUp');
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 4/5');

  // Bấm lại mã đang chọn thì bỏ chọn; Esc cũng bỏ chọn
  await cells.nth(3).click();
  await expect(win.getByTestId('ma-dang-chon')).toHaveCount(0);
  await cells.nth(0).click();
  await expect(win.getByTestId('ma-dang-chon')).toContainText('Đang chọn mã 1/5');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('ma-dang-chon')).toHaveCount(0);
  await away();
  await expect.poll(shown).toEqual([true, true, true, true]);
  await s.close();
});

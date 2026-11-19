import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { XLSX, chooseMode, closePreview, downloadedFiles, evalInPrintDoc, newDirs, openApp, printSummary, waitForDownloads, writeWorkbook } from './helpers';
import type { AppSession } from './helpers';

const HEADER = ['Mã SP', 'Tên sản phẩm', 'Giá gốc', 'Giá bán', 'Khuyến mãi', 'Số lượng tem', 'Bố cục'];

const printedNames = (s: AppSession) =>
  evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('.price-tag .product-name')].map((el) => el.textContent.trim())`);

const cardLayout = (win: Page, msp: string) => win.getByLabel(`Bố cục ${msp}`, { exact: true });

test('Tab Sticker: tải và nhập file mẫu, mỗi sản phẩm một bố cục, in từng lượt theo bố cục, dữ liệu riêng với Event', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Sticker');
  await expect(win.getByTestId('template-instructions')).toBeVisible();
  await expect(win.locator('#price-file-input')).toHaveCount(0);
  await win.locator('#sticker-employee-name-input').fill('NV thử in');
  await win.locator('#sticker-employee-name-input').press('Enter');

  // Tải file mẫu: đúng các cột, có trang hướng dẫn
  await win.getByRole('button', { name: 'Tải file mẫu' }).click();
  await waitForDownloads(s, 1);
  expect(downloadedFiles(dirs)).toContain('Mau_Sticker.xlsx');
  const template = XLSX.readFile(path.join(dirs.downloads, 'Mau_Sticker.xlsx'));
  expect(template.SheetNames).toEqual(['San pham', 'Huong dan']);
  expect(XLSX.utils.sheet_to_json<unknown[]>(template.Sheets['San pham'], { header: 1 })[0]).toEqual(HEADER);

  // Nhập file đã điền: dòng lỗi bị bỏ qua và được báo, không có thưởng
  await win.locator('#template-file-input').setInputFiles(writeWorkbook(dirs, 'tuan-nay.xlsx', [
    HEADER,
    ['T001', 'Nồi cơm Toshiba', 2500000, 2045000, 'Trả chậm 0%', 2, 4],
    ['T002', 'Nồi chiên Sunhouse', 2900000, 2390000, '', 1, 4],
    ['T003', 'Quạt điều hoà Daikiosan', 5490000, 3490000, '', 1, 1],
    ['T004', 'Bình giữ nhiệt', 390000, 290000, '', 3, 24],
    ['', 'Dòng thiếu mã', 100000, 90000, '', 1, 4],
  ]));
  await expect(win.getByTestId('template-status')).toContainText('4 SP');
  await expect(win.getByText('Dòng 6: thiếu mã sản phẩm')).toBeVisible();
  await expect(win.getByText('Đã nhập tuan-nay.xlsx: 4 sản phẩm mới, 0 cập nhật')).toBeVisible();
  await expect(win.locator('[data-msp]')).toHaveCount(4);
  await expect(win.getByText(/ERP:/)).toHaveCount(0);
  await expect(cardLayout(win, 'T003')).toHaveValue('1');
  await expect(cardLayout(win, 'T004')).toHaveValue('24');

  // Sửa bố cục ngay trên danh sách
  await cardLayout(win, 'T002').selectOption('8');

  // In tất cả: hộp chọn thấy bố cục từng sản phẩm, sửa trong hộp cũng ghi vào danh sách
  await win.getByRole('button', { name: /In tất cả \(4\)/ }).click();
  const perProduct = win.getByTestId('per-product-layouts');
  await expect(perProduct.getByLabel('Bố cục in T002')).toHaveValue('8');
  await perProduct.getByLabel('Bố cục in T001').selectOption('2');
  await expect(cardLayout(win, 'T001')).toHaveValue('2');
  await expect(perProduct.getByRole('list', { name: 'Các lượt in' })).toContainText('1/trang: 1 SP, 1 tem, 1 trang');
  await expect(perProduct.getByRole('list', { name: 'Các lượt in' })).toContainText('24/trang: 1 SP, 3 tem, 1 trang');
  await perProduct.getByRole('button', { name: 'In theo bố cục từng sản phẩm (4 lượt in)' }).click();

  // Mỗi bố cục một lượt, ít sticker/trang trước; đóng lượt này thì lượt sau tự mở
  const expected = [
    { note: 'Lượt 1/4: 1 sticker/trang', paper: 'A4 ngang', names: ['Quạt điều hoà Daikiosan'] },
    { note: 'Lượt 2/4: 2 sticker/trang', paper: 'A4 dọc', names: ['Nồi cơm Toshiba', 'Nồi cơm Toshiba'] },
    { note: 'Lượt 3/4: 8 sticker/trang', paper: 'A4 dọc', names: ['Nồi chiên Sunhouse'] },
    { note: 'Lượt 4/4: 24 sticker/trang', paper: 'A4 dọc', names: ['Bình giữ nhiệt', 'Bình giữ nhiệt', 'Bình giữ nhiệt'] },
  ];
  for (const [index, round] of expected.entries()) {
    await expect(win.getByTestId('print-batch-note')).toContainText(round.note);
    expect(await printSummary(win)).toContain(`Khổ giấy | ${round.paper}`);
    expect(await printedNames(s)).toEqual(round.names);
    // Tab Sticker không in thưởng, chỉ tên người in
    expect(await evalInPrintDoc<string>(s, `document.querySelector('.employee-bonus-info')?.textContent ?? ''`)).toBe('NV thử in');
    if (index + 1 < expected.length) {
      await win.keyboard.press('Escape');
      await expect(win.getByTestId('print-batch-note')).toContainText(expected[index + 1].note, { timeout: 30_000 });
    } else {
      await closePreview(win);
    }
  }
  await expect(win.getByTestId('print-preview')).toHaveCount(0);

  // Dữ liệu riêng: Event không có sản phẩm của tab Sticker, tên người in dùng chung
  await chooseMode(win, 'Event');
  await expect(win.getByText('Hướng dẫn sử dụng Hệ thống In Sticker Event')).toBeVisible();
  await expect(win.locator('[data-msp]:visible')).toHaveCount(0);
  await expect(win.getByText('NV thử in', { exact: true }).filter({ visible: true })).toBeVisible();

  // Mở lại app: tab Sticker còn đủ danh sách và bố cục đã sửa
  await win.waitForTimeout(1500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Sticker');
  await expect(win.locator('[data-msp]')).toHaveCount(4);
  await expect(cardLayout(win, 'T001')).toHaveValue('2');
  await expect(cardLayout(win, 'T002')).toHaveValue('8');
  await expect(win.getByTestId('template-status')).toContainText('4 SP');

  // Nhập lại file có mã trùng: cập nhật, không nhân đôi
  await win.locator('#template-file-input').setInputFiles(writeWorkbook(dirs, 'sua-gia.xlsx', [
    HEADER,
    ['T001', 'Nồi cơm Toshiba mới', 2500000, 1990000, '', 1, 4],
    ['T005', 'Ấm siêu tốc', 490000, 390000, '', 1, 16],
  ]));
  await expect(win.getByText('Đã nhập sua-gia.xlsx: 1 sản phẩm mới, 1 cập nhật')).toBeVisible();
  await expect(win.locator('[data-msp]')).toHaveCount(5);
  await expect(win.locator('[data-msp="T001"]')).toContainText('Nồi cơm Toshiba mới');
  await expect(cardLayout(win, 'T001')).toHaveValue('4');

  // Nút thùng rác của tab Sticker chỉ xoá sản phẩm từ file mẫu
  await win.locator('#global-header-actions').getByRole('button', { name: 'Xóa toàn bộ sản phẩm đã nhập' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Xác nhận Xóa' }).click();
  await expect(win.getByRole('dialog').getByText('Đã xóa toàn bộ sản phẩm đã nhập từ file mẫu.')).toBeVisible();
  await win.getByRole('dialog').getByRole('button').first().click();
  await expect(win.getByTestId('template-instructions')).toBeVisible();
  await s.close();
});

test('Tab Sticker: in tất cả theo một bố cục vẫn dùng được, một lượt', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Sticker');
  await win.locator('#sticker-employee-name-input').fill('NV');
  await win.locator('#sticker-employee-name-input').press('Enter');
  await win.locator('#template-file-input').setInputFiles(writeWorkbook(dirs, 'mau.xlsx', [
    HEADER,
    ['U1', 'Quạt', 900000, 700000, '', 1, 1],
    ['U2', 'Ấm', 500000, 400000, '', 2, 24],
  ]));
  await expect(win.locator('[data-msp]')).toHaveCount(2);
  await win.getByRole('button', { name: /In tất cả \(2\)/ }).click();
  await win.getByRole('button', { name: '4/trang', exact: true }).click();
  expect(await printSummary(win)).toContain('Số trang | 1');
  await expect(win.getByTestId('print-batch-note')).toHaveCount(0);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag').length`)).toBe(3);
  await closePreview(win);
  await s.close();
});

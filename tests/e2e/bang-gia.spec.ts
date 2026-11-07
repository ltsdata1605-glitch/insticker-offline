import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseMode, newDirs, openApp, rowWith, writeWorkbook } from './helpers';
import type { Dirs } from './helpers';

const priceRow = (msp: string, name: string, goc: string, giam: string) =>
  rowWith({ 0: name, 1: '', 4: goc, 5: giam, 7: '', 30: 'Ngày in: 04/11/2026', 31: '40A', 32: msp });

const writeOldFile = (dirs: Dirs) => writeWorkbook(dirs, 'gia-thang-10.xlsx', [
  priceRow('3001001', 'Nồi cơm điện Toshiba 1.0 lít', '2500000', '2045000'),
  priceRow('3001002', 'Nồi chiên không dầu Sunhouse', '2900000', '2390000'),
  priceRow('3001003', 'Ấm siêu tốc Philips', '690000', '490000'),
]);

const writeNewFile = (dirs: Dirs) => writeWorkbook(dirs, 'gia-thang-11.xlsx', [
  priceRow('3001002', 'Nồi chiên không dầu Sunhouse', '2900000', '1990000'),
  priceRow('3001004', 'Máy xay sinh tố Sunhouse', '890000', '690000'),
]);

const search = (win: Page) => win.getByLabel('Tìm sản phẩm').first();
// Ô Sắp xếp cũng có <option>: chỉ lấy trong danh sách gợi ý
const suggestionList = (win: Page) => win.getByRole('listbox', { name: 'Gợi ý sản phẩm' });
const card = (win: Page, msp: string) => win.locator(`[data-msp="${msp}"]`);
const status = (win: Page) => win.getByTestId('price-table-status');

const start = async (win: Page) => {
  await chooseMode(win, 'Sticker');
  const name = win.locator('#employee-name-input');
  if (await name.isVisible().catch(() => false)) {
    await name.fill('NV thử in');
    await name.press('Enter');
  }
};

const importFile = async (win: Page, file: string) => {
  await win.locator('#price-file-input').setInputFiles(file);
  await expect(search(win)).toBeEnabled();
  await win.waitForTimeout(300);
};

const addBySearch = async (win: Page, query: string) => {
  await search(win).fill(query);
  await suggestionList(win).getByRole('option', { name: new RegExp(query) }).first().click();
  await win.waitForTimeout(150);
};

const expectFound = async (win: Page, msp: string, found: boolean) => {
  await search(win).fill(msp);
  if (found) await expect(suggestionList(win).getByRole('option', { name: new RegExp(msp) }).first()).toBeVisible();
  else await expect(win.getByText('Không tìm thấy sản phẩm phù hợp.')).toBeVisible();
  await search(win).fill('');
};

test('Nhập thêm file giá: trùng mã thì cập nhật giá, mã mới thì thêm, giá cũ vẫn còn; lịch sử và xoá từng file', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await start(win);

  await importFile(win, writeOldFile(dirs));
  await expect(status(win)).toContainText('3 SP');
  await addBySearch(win, '3001002');
  await card(win, '3001002').getByLabel('Số lượng tem 3001002').fill('4');
  await card(win, '3001002').getByTitle('Chọn in').click();
  await expect(card(win, '3001002')).toContainText('2.390.000');

  await importFile(win, writeNewFile(dirs));
  await expect(win.getByText('Đã nhập gia-thang-11.xlsx: 1 sản phẩm mới, 1 cập nhật giá')).toBeVisible();
  await expect(status(win)).toContainText('4 SP');
  // Danh sách đang in không bị xoá, lấy giá mới, giữ số tem và trạng thái chọn
  await expect(card(win, '3001002')).toContainText('1.990.000');
  await expect(card(win, '3001002').getByLabel('Số lượng tem 3001002')).toHaveValue('4');
  await expect(win.getByRole('button', { name: /In đã chọn \(1\)/ })).toBeVisible();
  // Mã chỉ có ở file cũ vẫn tìm được
  await expectFound(win, '3001001', true);
  await expectFound(win, '3001004', true);

  // Lịch sử nhập: lần mới nhất đứng đầu, mở sẵn chi tiết
  await win.getByRole('button', { name: 'Lịch sử nhập bảng giá' }).click();
  let dialog = win.getByRole('dialog');
  const records = dialog.locator('[data-history-record]');
  await expect(records).toHaveCount(2);
  await expect(records.first()).toContainText('gia-thang-11.xlsx');
  await expect(records.first()).toContainText('(2 SP)');
  await expect(records.first()).toContainText('+1 mới');
  await expect(records.first()).toContainText('1 cập nhật giá');
  await expect(records.first().locator('[data-history-msp]')).toHaveCount(1);
  await expect(records.first().locator('[data-history-msp="3001004"]')).toContainText('690.000');
  await records.first().getByRole('button', { name: /Cập nhật giá \(1\)/ }).click();
  await expect(records.first().locator('[data-history-msp="3001002"]')).toContainText('2.390.000');
  await expect(records.first().locator('[data-history-msp="3001002"]')).toContainText('1.990.000');
  await expect(records.nth(1)).toContainText('+3 mới');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await win.waitForTimeout(300);

  // Quản lý file: mỗi file một dòng với số sản phẩm của file
  await win.getByRole('button', { name: 'Quản lý file bảng giá đã nhập' }).click();
  dialog = win.getByRole('dialog');
  const rows = dialog.locator('[data-source-file]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-source-file', 'gia-thang-11.xlsx');
  await expect(rows.first().getByTestId('source-count')).toHaveText('2');
  await expect(rows.nth(1).getByTestId('source-count')).toHaveText('3');
  await expect(rows.nth(1)).toContainText('1 sản phẩm đã có giá ở file nhập sau');
  await s.close();

  // Mở lại app: các file đã nhập vẫn còn
  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Sticker');
  await expect(status(win)).toContainText('4 SP');
  await win.getByRole('button', { name: 'Quản lý file bảng giá đã nhập' }).click();
  dialog = win.getByRole('dialog');
  await expect(dialog.locator('[data-source-file]')).toHaveCount(2);

  // Xoá file mới: mã chỉ có ở file đó mất, mã trùng quay về giá của file cũ
  await dialog.getByRole('button', { name: 'Xoá file gia-thang-11.xlsx' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(win.getByText('Đã xoá "gia-thang-11.xlsx". Bảng giá còn 3 sản phẩm.')).toBeVisible();
  await expect(dialog.locator('[data-source-file]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await win.waitForTimeout(300);
  await expect(status(win)).toContainText('3 SP');
  await expectFound(win, '3001004', false);
  await search(win).fill('3001002');
  await expect(suggestionList(win).getByRole('option', { name: /3001002/ }).first()).toContainText('2.390.000');
  await search(win).fill('');
  // Danh sách đang in giữ nguyên
  await expect(card(win, '3001002')).toHaveCount(1);
  await s.close();
});

test('Tìm bằng bàn phím: mũi tên chọn gợi ý, Enter thêm vào danh sách, con trỏ về lại ô tìm kiếm', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await start(win);
  await importFile(win, writeOldFile(dirs));
  await importFile(win, writeNewFile(dirs));
  // Mã ngắn nằm trong các mã khác, nhập sau cùng nên đứng cuối bảng giá
  await importFile(win, writeWorkbook(dirs, 'gia-phu-kien.xlsx', [priceRow('300100', 'Dây nguồn phụ kiện', '90000', '50000')]));
  const order = () => win.locator('[data-msp]').evaluateAll((els) => els.map((el) => el.getAttribute('data-msp')));
  const searchHasFocus = () => win.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Tìm sản phẩm');

  // "Sunhouse" khớp 2 sản phẩm; dòng đầu được tô sẵn
  await search(win).fill('sunhouse');
  const options = suggestionList(win).getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await search(win).press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await search(win).press('ArrowDown');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await search(win).press('ArrowUp');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  const second = await options.nth(1).getAttribute('data-suggestion-index');
  expect(second).toBe('1');
  const secondMsp = (await options.nth(1).innerText()).match(/300100\d/)![0];
  await search(win).press('Enter');
  await expect.poll(order).toEqual([secondMsp]);
  await expect(search(win)).toHaveValue('');
  await expect(options).toHaveCount(0);
  await expect.poll(searchHasFocus).toBe(true);

  // Gõ tiếp ngay, Enter thêm dòng được tô sẵn
  await win.keyboard.type('Philips');
  await expect(options).toHaveCount(1);
  await win.keyboard.press('Enter');
  await expect.poll(order).toEqual(['3001003', secondMsp]);
  await expect.poll(searchHasFocus).toBe(true);

  // Như máy quét mã: gõ đủ mã rồi Enter ngay, chưa kịp hiện gợi ý vẫn thêm đúng mã
  await win.keyboard.type('3001001', { delay: 0 });
  await win.keyboard.press('Enter');
  await expect.poll(order).toEqual(['3001001', '3001003', secondMsp]);
  await expect(search(win)).toHaveValue('');
  await expect.poll(searchHasFocus).toBe(true);

  // Mã khớp đúng luôn đứng đầu gợi ý dù có mã khác chứa nó
  await search(win).fill('300100');
  await expect(options).toHaveCount(5);
  await expect(options.first()).toContainText('Dây nguồn phụ kiện');
  await search(win).press('Enter');
  await expect.poll(order).toEqual(['300100', '3001001', '3001003', secondMsp]);

  // Bấm chuột vào gợi ý cũng giữ con trỏ ở ô tìm kiếm; sản phẩm đã có thì báo
  await search(win).fill('3001003');
  await options.first().click();
  await expect(win.getByText('Sản phẩm đã có')).toBeVisible();
  await expect.poll(searchHasFocus).toBe(true);

  // Esc xoá ô tìm kiếm
  await win.keyboard.type('nồi');
  await expect(options.first()).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(search(win)).toHaveValue('');
  await s.close();
});

test('Bảng giá nạp từ bản trước vẫn dùng được, thành một file trong màn quản lý, nhập thêm không mất', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await start(win);
  // Dữ liệu như bản 1.0.0 để lại: chỉ có bảng giá đã gộp, chưa tách từng file
  await win.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('ProductSearchDB', 1);
    open.onsuccess = () => {
      const tx = open.result.transaction('appData', 'readwrite');
      const store = tx.objectStore('appData');
      const item = (msp: string, sanPham: string, giaGiam: string) => ({
        msp, sanPham, giaGoc: '1.000.000 ₫', giaGiam, khuyenMai: '', ngayIn: '', thuongERP: 0, thuongNong: 0, tongThuong: 0, selected: false, quantity: 1,
      });
      store.put([item('3001001', 'Nồi cơm điện Toshiba 1.0 lít', '2.045.000 ₫'), item('3001009', 'Quạt đứng cũ', '450.000 ₫')], 'products');
      store.put({ fileName: 'bang-gia-cu.xlsx', uploadTimestamp: new Date('2026-10-20T03:00:00Z'), fileExportDate: null }, 'fileInfo');
      store.delete('priceSources');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }));
  await s.close();

  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Sticker');
  await expect(status(win)).toContainText('2 SP');
  await win.getByRole('button', { name: 'Quản lý file bảng giá đã nhập' }).click();
  let dialog = win.getByRole('dialog');
  await expect(dialog.locator('[data-source-file]')).toHaveCount(1);
  await expect(dialog.locator('[data-source-file="bang-gia-cu.xlsx"]').getByTestId('source-count')).toHaveText('2');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await win.waitForTimeout(300);

  await importFile(win, writeOldFile(dirs));
  await expect(status(win)).toContainText('4 SP');
  await expectFound(win, '3001009', true);
  await win.getByRole('button', { name: 'Quản lý file bảng giá đã nhập' }).click();
  dialog = win.getByRole('dialog');
  await expect(dialog.locator('[data-source-file]')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await s.close();
});

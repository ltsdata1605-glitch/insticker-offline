import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { closePreview, evalInPrintDoc, newDirs, openApp, printSummary, writeWorkbook } from './helpers';

const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });
const cell = (win: Page, n: number) => win.locator(`[data-testid="o-nhan"][data-so="${n}"]`);
/** Khung Tạo nhanh: tìm ô trong khung này, kẻo trùng tên với ô của chức năng khác đang ẩn */
const quick = (win: Page) => win.locator('section[aria-label="Tạo nhanh"]');

test('In nhãn Tomy A5: tem tròn 117 nhập tay và FIFO theo màu từ vị trí chọn; tem vuông 105 mã vạch tự tăng, mã QR, Excel; in A5 ngang, in thử khung, căn chỉnh, còn sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await rail(win).getByRole('button', { name: 'In nhãn' }).click();
  await expect(win.getByRole('heading', { level: 1 })).toHaveText('In nhãn');
  await expect(win.getByRole('group', { name: 'Mẫu tem' }).getByRole('button', { name: 'Tròn 117 · 48 tem' })).toHaveAttribute('aria-pressed', 'true');
  await expect(win.getByTestId('o-nhan')).toHaveCount(48);

  // Nhập tay tem số 1: ba dòng chữ, Enter sang tem 2
  await cell(win, 1).click();
  await win.getByLabel('Dòng 1').fill('22/11');
  await win.getByLabel('Dòng 2').fill('Đen');
  await win.getByLabel('Dòng 3').fill('1020');
  await expect(cell(win, 1)).toContainText('22/11');
  await expect(cell(win, 1)).toContainText('1020');
  await win.getByLabel('Dòng 3').press('Enter');
  await expect(cell(win, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(win.getByLabel('Dòng 1')).toBeFocused();

  // FIFO theo màu, in từ vị trí 3
  await quick(win).getByLabel('Số lượng Đen').fill('10');
  await quick(win).getByLabel('Ghi chú Đen').fill('1020');
  await quick(win).getByLabel('Số lượng Trắng').fill('3');
  await quick(win).getByLabel('Ghi chú Trắng').fill('8/128');
  await quick(win).getByLabel('Ngày tháng').fill('22/11');
  await quick(win).getByLabel('In từ vị trí').fill('3');
  await win.getByRole('button', { name: 'Tạo 13 tem FIFO' }).click();
  await expect(cell(win, 3)).toContainText('Đen');
  await expect(cell(win, 12)).toContainText('1020');
  await expect(cell(win, 13)).toContainText('Trắng');
  await expect(cell(win, 15)).toContainText('8/128');
  await expect(cell(win, 16)).toHaveText('16');
  await expect(win.getByText('14 tem · 1 tờ A5')).toBeVisible();

  // In: khổ A5 ngang, đúng 14 tem ở đúng vị trí, ô trống không in
  await win.getByRole('button', { name: 'In 14 tem' }).click();
  expect(await printSummary(win)).toMatch(/A5 ngang \| Số trang \| 1/);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tn-tem').length`)).toBe(14);
  expect(await evalInPrintDoc<string>(s, `document.querySelectorAll('.tn-tem')[2].textContent`)).toBe('22/11Đen1020');
  const firstLeft = await evalInPrintDoc<string>(s, `document.querySelector('.tn-tem').style.left`);
  await closePreview(win);

  // Căn chỉnh: dịch sang phải 1 mm, in thử khung đủ 48 khung đánh số
  await win.getByText('Căn chỉnh vị trí in').click();
  await win.getByRole('button', { name: 'Dịch sang phải tăng' }).click();
  await win.getByRole('button', { name: 'Dịch sang phải tăng' }).click();
  await win.getByRole('button', { name: 'In thử khung' }).click();
  await printSummary(win);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tn-khung').length`)).toBe(48);
  const shifted = await evalInPrintDoc<string>(s, `document.querySelector('.tn-tem').style.left`);
  expect(parseFloat(shifted) - parseFloat(firstLeft)).toBeCloseTo(1, 2);
  await closePreview(win);

  // Tem vuông 105: mã vạch tự tăng kèm tên sản phẩm và dòng chữ của mã
  await win.getByRole('group', { name: 'Mẫu tem' }).getByRole('button', { name: 'Vuông 105 · 30 tem' }).click();
  await expect(win.getByTestId('o-nhan')).toHaveCount(30);
  await quick(win).getByRole('group', { name: 'Cách tạo' }).getByRole('button', { name: 'Mã tự tăng' }).click();
  await quick(win).getByLabel('In từ vị trí').fill('1');
  await quick(win).getByLabel('Đầu mã').fill('OP');
  await quick(win).getByLabel('Số bắt đầu').fill('98');
  await quick(win).getByLabel('Số tem tự tăng').fill('3');
  await quick(win).getByLabel('Tên sản phẩm tự tăng').fill('Ốp lưng iPhone 15');
  await win.getByRole('button', { name: /^Tạo 3 tem: OP98/ }).click();
  await expect(cell(win, 1)).toContainText('Ốp lưng iPhone 15');
  await expect(cell(win, 3)).toContainText('OP100');
  await expect(cell(win, 1).locator('svg')).toHaveCount(1);

  // Tem số 4 nhập tay mã QR; tem 5 mã vạch có dấu thì báo lỗi và không in
  await cell(win, 4).click();
  await win.getByRole('group', { name: 'Loại tem', exact: true }).getByRole('button', { name: 'Mã QR' }).click();
  await win.getByLabel('Nội dung mã').fill('https://insticker.vn/sp?id=15');
  await win.getByLabel('Tên sản phẩm', { exact: true }).fill('Cáp sạc Type-C');
  await expect(cell(win, 4)).toContainText('Cáp sạc Type-C');
  await cell(win, 5).click();
  await win.getByRole('group', { name: 'Loại tem', exact: true }).getByRole('button', { name: 'Mã vạch', exact: true }).click();
  await win.getByLabel('Nội dung mã').fill('Đồng hồ');
  await expect(win.getByRole('alert')).toContainText('không dấu');
  await expect(win.getByText('5 tem · 1 tờ A5 · 1 tem lỗi không in')).toBeVisible();

  // Nhập Excel thành mã QR từ vị trí 29: tràn sang tờ 2
  await quick(win).getByRole('group', { name: 'Cách tạo' }).getByRole('button', { name: 'Nhập Excel' }).click();
  await quick(win).getByRole('group', { name: 'Loại tem từ Excel' }).getByRole('button', { name: 'Mã QR' }).click();
  await quick(win).getByLabel('In từ vị trí').fill('29');
  await quick(win).getByLabel('File Excel nhãn').setInputFiles(writeWorkbook(dirs, 'nhan.xlsx', [
    ['Tên sản phẩm', 'Mã', 'Số tem'], ['Tai nghe AirPods', 'AP-001', 2], ['Sạc dự phòng', 'SDP-9', ''],
  ]));
  await expect(win.getByText('Đã tạo 3 tem từ Excel từ tem số 29')).toBeVisible();
  await expect(win.getByText('8 tem · 2 tờ A5 · 1 tem lỗi không in')).toBeVisible();
  await win.getByRole('button', { name: 'In 7 tem (2 tờ)' }).click();
  expect(await printSummary(win)).toMatch(/A5 ngang \| Số trang \| 2/);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tn-tem').length`)).toBe(7);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tn-tem .tn-qr svg').length`)).toBe(4);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.tn-tem .tn-vach svg').length`)).toBe(3);
  await closePreview(win);

  // Mở lại app: tem, mẫu đang chọn và căn chỉnh còn nguyên
  await win.waitForTimeout(600);
  await s.close();
  s = await openApp(dirs);
  win = s.win;
  await rail(win).getByRole('button', { name: 'In nhãn' }).click();
  await expect(win.getByTestId('o-nhan')).toHaveCount(30);
  await expect(cell(win, 3)).toContainText('OP100');
  await win.getByRole('group', { name: 'Mẫu tem' }).getByRole('button', { name: 'Tròn 117 · 48 tem' }).click();
  await expect(cell(win, 15)).toContainText('8/128');
  await win.getByText('Căn chỉnh vị trí in').click();
  await expect(win.getByLabel('Dịch sang phải', { exact: true })).toHaveValue('1');
  await s.close();
});

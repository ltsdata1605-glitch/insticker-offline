import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { chooseMode, closePreview, downloadedFiles, evalInPrintDoc, inspectImage, newDirs, openApp, printSummary, rowWith, waitForDownloads, writeWorkbook } from './helpers';
import type { Dirs } from './helpers';

const priceRow = (msp: string, name: string, goc: string, giam: string, km: string, bonus: string) =>
  rowWith({ 0: name, 1: '', 4: goc, 5: giam, 7: km, 30: 'Ngày in: 04/11/2026', 31: bonus, 32: msp });

const writePriceFile = (dirs: Dirs) => writeWorkbook(dirs, 'bang-gia.xlsx', [
  priceRow('2001234', 'Nồi cơm điện Sharp 1.8 lít', '1290000', '990000', 'Tặng bộ hộp cơm', '40A'),
  priceRow('2001235', 'Quạt điều hoà Daikiosan', '5490000', '3490000', 'Giảm thêm 200K', '150A50'),
  priceRow('2001236', 'Máy sấy tóc Panasonic', '590000', '450000', '', '30A'),
]);

const addBySearch = async (win: Page, query: string) => {
  await win.getByLabel('Tìm sản phẩm').first().fill(query);
  await win.locator('li', { hasText: query }).first().click();
  await win.waitForTimeout(150);
};

const setupProducts = async (win: Page, dirs: Dirs) => {
  await chooseMode(win, 'Sticker');
  const name = win.locator('#employee-name-input');
  if (await name.isVisible().catch(() => false)) {
    await name.fill('NV thử in');
    await name.press('Enter');
  }
  await win.locator('#price-file-input').setInputFiles(writePriceFile(dirs));
  await expect(win.getByLabel('Tìm sản phẩm').first()).toBeEnabled();
  await win.waitForTimeout(400);
  for (const msp of ['2001234', '2001235', '2001236']) await addBySearch(win, msp);
};

test('Lần đầu mở: có hướng dẫn, nội dung offline, không còn phần đăng nhập và Cloud', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Sticker');
  await expect(win.getByText('Hướng dẫn sử dụng Hệ thống In Sticker Event')).toBeVisible();
  await expect(win.locator('img[alt="QR Code"]').first()).toHaveAttribute('src', /^data:image/);

  for (const text of ['Đăng xuất', 'Đổi mật khẩu', 'Super Admin', 'Người dùng', 'Cloud']) {
    await expect(win.getByRole('button', { name: text, exact: true })).toHaveCount(0);
  }

  // Đã bỏ lấy tồn và nhập tồn theo yêu cầu, hướng dẫn không còn nhắc tới
  await expect(win.locator('#inventory-file-input')).toHaveCount(0);
  await expect(win.getByRole('link', { name: 'Lấy File Tồn Kho' })).toHaveCount(0);
  await expect(win.locator('#price-file-input')).toHaveCount(1);
  await expect(win.getByText(/tồn kho/i)).toHaveCount(0);

  await win.getByRole('button', { name: 'Hướng dẫn sử dụng' }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toContainText('không cần mạng');
  await expect(dialog).not.toContainText('Firebase');
  await expect(dialog).not.toContainText(/tồn kho/i);
  await expect(dialog).not.toContainText('file mẫu');
  await dialog.getByRole('button', { name: 'Đã hiểu' }).click();
  await s.close();
});

test('Nạp bảng giá, tìm thêm sản phẩm, số lượng, in đã chọn, in tất cả, in một sản phẩm', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await setupProducts(win, dirs);

  const card = (msp: string) => win.locator(`[data-msp="${msp}"]`);
  await expect(card('2001235')).toContainText('3.490.000');
  await expect(card('2001235')).toContainText('-36%');
  await expect(card('2001235')).toContainText('170.000'); // 150.000 + 50.000 × 0,4

  // Thêm trùng: báo đã có
  await win.getByLabel('Tìm sản phẩm').first().fill('2001235');
  await win.locator('li', { hasText: '2001235' }).first().click();
  await expect(win.getByText('Sản phẩm đã có')).toBeVisible();

  // Số lượng và chọn
  await card('2001234').getByTitle('Tăng số lượng').click();
  await card('2001234').getByLabel('Số lượng tem 2001234').fill('3');
  await card('2001234').getByTitle('Chọn in').click();
  await win.getByRole('button', { name: /In đã chọn \(1\)/ }).click();
  await win.getByRole('button', { name: /4 Sticker/ }).first().click();
  expect(await printSummary(win)).toMatch(/A4 ngang \| Số trang \| 1/);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag').length`)).toBe(3);
  await closePreview(win);

  // In tất cả, bố cục K80 có khổ giấy cuộn
  await win.getByRole('button', { name: /In tất cả \(3\)/ }).click();
  await win.getByRole('button', { name: /Máy in bill/ }).first().click();
  expect(await printSummary(win)).toContain('Giấy cuộn 80 mm');
  await closePreview(win);

  // In một sản phẩm, đủ 7 bố cục đúng hướng giấy
  for (const [label, paper] of [['1 Sticker', 'A4 ngang'], ['2 Sticker', 'A4 dọc'], ['8 Sticker', 'A4 dọc'], ['16 Sticker', 'A4 ngang'], ['24 Sticker', 'A4 dọc']] as const) {
    await card('2001236').getByTitle('In ngay 1 sản phẩm này').click();
    await win.getByRole('button', { name: new RegExp(label) }).first().click();
    expect(await printSummary(win), label).toContain(paper);
    await closePreview(win);
  }

  // Kiểu hiện đại
  await card('2001236').getByTitle('In ngay 1 sản phẩm này').click();
  await win.getByRole('button', { name: 'Kiểu hiện đại' }).click();
  await win.getByRole('button', { name: /4 Sticker/ }).first().click();
  await printSummary(win);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag.modern').length`)).toBe(1);
  await closePreview(win);

  // Xoá một sản phẩm và xoá cả danh sách
  await card('2001236').getByTitle('Xóa sản phẩm').click();
  await expect(card('2001236')).toHaveCount(0);
  await s.close();
});

test('Cài đặt tem: tắt QR và tên nhân viên thì bản in không còn, nhớ sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await setupProducts(win, dirs);

  await win.getByRole('button', { name: 'Cài đặt' }).click();
  const settings = win.getByRole('dialog');
  await settings.getByLabel('Mã QR').click();
  await settings.getByLabel('Thưởng').click();
  await settings.getByLabel('Tên nhân viên').click();
  await settings.getByRole('button', { name: 'Xong' }).click();
  await win.waitForTimeout(400);

  await win.getByRole('button', { name: /In tất cả/ }).click();
  await win.getByRole('button', { name: /4 Sticker/ }).first().click();
  await printSummary(win);
  const tag = await evalInPrintDoc<{ qr: number; info: number }>(s, `({
    qr: document.querySelectorAll('.qr-code').length,
    info: document.querySelectorAll('.employee-bonus-info').length,
  })`);
  expect(tag).toEqual({ qr: 0, info: 0 });
  await closePreview(win);
  await s.close();
  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Sticker');
  await win.getByRole('button', { name: 'Cài đặt' }).click();
  await win.waitForTimeout(300);
  await expect(win.getByRole('dialog').getByRole('button', { name: 'Xong' })).toBeVisible();
  await win.getByRole('dialog').getByRole('button', { name: 'Xong' }).click();
  await s.close();
});

test('Sắp xếp danh sách theo giá, % giảm, tên và bỏ sắp xếp', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await setupProducts(win, dirs);
  const order = () => win.locator('[data-msp]').evaluateAll((els) => els.map((el) => el.getAttribute('data-msp')));

  await expect(win.getByLabel('Sắp xếp theo').locator('option')).toHaveText(['Mặc định', 'Giá Gốc', 'Giá Đã Giảm', 'Thưởng', '% Giảm giá', 'Tên sản phẩm']);

  await win.getByLabel('Sắp xếp theo').selectOption('giaGiam');
  await expect.poll(order).toEqual(['2001235', '2001234', '2001236']);

  await win.getByLabel('Sắp xếp theo').selectOption('discount');
  await expect.poll(order).toEqual(['2001235', '2001236', '2001234']);

  await win.getByLabel('Sắp xếp theo').selectOption('sanPham');
  await expect.poll(order).toEqual(['2001236', '2001234', '2001235']);

  await win.getByRole('button', { name: 'Bỏ sắp xếp' }).click();
  await expect.poll(order).toEqual(['2001236', '2001235', '2001234']);
  await s.close();
});

test('Sản phẩm nhập tay: thêm, sửa, in, xoá; còn sau khi mở lại và sau khi Xóa DL', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await chooseMode(win, 'Sticker');
  const name = win.locator('#employee-name-input');
  await name.fill('NV thử in');
  await name.press('Enter');

  await win.getByRole('button', { name: 'Nhập sản phẩm thủ công' }).click();
  let dialog = win.getByRole('dialog');
  await expect(dialog).toContainText('Lưu trên máy này');
  await dialog.locator('#sanPham').fill('Bàn ủi Philips');
  await dialog.locator('#msp').fill('9990001');
  await dialog.locator('#giaGoc').fill('890000');
  await dialog.locator('#giaGiam').fill('690000');
  await dialog.locator('#thuongERP').fill('20000');
  await dialog.getByRole('button', { name: 'Thêm sản phẩm' }).click();
  await expect(dialog.getByText('Danh sách sản phẩm (1)')).toBeVisible();

  // Sửa
  await dialog.getByText('Bàn ủi Philips').click();
  await dialog.locator('#giaGiam').fill('590000');
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog.getByText(/Bán: 590\.000/)).toBeVisible();

  // In từ màn nhập tay
  await dialog.getByRole('button', { name: /In tất cả \(1\)/ }).click();
  await win.getByRole('button', { name: /4 Sticker/ }).first().click();
  await printSummary(win);
  await closePreview(win);
  await win.waitForTimeout(500);
  await s.close();

  // Mở lại: sản phẩm vẫn còn và tìm được
  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Sticker');
  await win.waitForTimeout(500);
  await win.locator('#price-file-input').setInputFiles(writePriceFile(dirs));
  await win.waitForTimeout(600);
  await win.getByLabel('Tìm sản phẩm').first().fill('9990001');
  await expect(win.locator('li', { hasText: 'Bàn ủi Philips' }).first()).toBeVisible();
  await win.getByLabel('Tìm sản phẩm').first().fill('');

  // Xóa DL: mất bảng giá, còn sản phẩm nhập tay và tên người in
  await win.getByRole('button', { name: 'Xóa DL' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Xác nhận Xóa' }).click();
  await expect(win.getByRole('dialog').getByText('Đã xóa toàn bộ dữ liệu bảng giá.')).toBeVisible();
  await win.getByRole('dialog').getByRole('button').first().click();
  await win.waitForTimeout(400);
  await win.getByLabel('Tìm sản phẩm').first().fill('2001234');
  await expect(win.getByText('Không tìm thấy sản phẩm phù hợp.')).toBeVisible();
  await win.getByLabel('Tìm sản phẩm').first().fill('9990001');
  await expect(win.locator('li', { hasText: 'Bàn ủi Philips' }).first()).toBeVisible();
  await expect(win.getByText('NV thử in', { exact: true })).toBeVisible();

  // Xoá sản phẩm nhập tay
  await win.getByLabel('Tìm sản phẩm').first().fill('');
  await win.getByRole('button', { name: 'Nhập sản phẩm thủ công' }).click();
  dialog = win.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Xóa sản phẩm' }).click();
  await expect(dialog.getByText('Danh sách sản phẩm (0)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await s.close();
});

test('Lưu danh sách, mở lại, xoá; xuất và nhập file JSON; danh sách còn sau khi mở lại app', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await setupProducts(win, dirs);

  await win.getByRole('button', { name: 'Lưu DS' }).click();
  const save = win.getByRole('dialog');
  await save.getByRole('textbox').fill('DS quạt nồi');
  await save.getByRole('button', { name: /Lưu/ }).click();
  await expect(win.getByRole('dialog').getByText('Đã lưu danh sách thành công!')).toBeVisible();
  await win.getByRole('dialog').getByRole('button').first().click();

  // Xuất JSON
  await win.getByRole('button', { name: 'Xuất', exact: true }).click();
  await waitForDownloads(dirs, 1);
  const json = downloadedFiles(dirs).find((f) => f.endsWith('.json')) as string;
  expect(JSON.parse(fs.readFileSync(path.join(dirs.downloads, json), 'utf8')).products).toHaveLength(3);

  // Xoá danh sách đang hiển thị (dữ liệu gốc còn)
  await win.getByRole('button', { name: 'Xóa', exact: true }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(win.locator('[data-msp]')).toHaveCount(0);

  // Nhập lại JSON
  await win.locator('input[accept=".json"]').setInputFiles(path.join(dirs.downloads, json));
  await expect(win.locator('[data-msp]')).toHaveCount(3);
  await win.waitForTimeout(1300);
  await s.close();

  // Mở lại app: danh sách hiển thị còn nguyên, mở được danh sách đã lưu
  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Sticker');
  await expect(win.locator('[data-msp]')).toHaveCount(3);
  await win.getByRole('button', { name: 'DS đã lưu' }).click();
  const lists = win.getByRole('dialog');
  await expect(lists.getByText('DS quạt nồi')).toBeVisible();
  await lists.getByRole('button', { name: 'Mở', exact: true }).click();
  await expect(win.getByRole('dialog').getByText(/Đã tải danh sách/)).toBeVisible();
  await win.getByRole('dialog').getByRole('button').first().click();
  await win.getByRole('button', { name: 'DS đã lưu' }).click();
  await win.getByRole('dialog').getByRole('button', { name: 'Xóa danh sách' }).click();
  await win.getByRole('button', { name: 'Xóa', exact: true }).last().click();
  await expect(win.getByText('Chưa có danh sách nào được lưu')).toBeVisible();
  await s.close();
});

test('Xuất ảnh danh sách: ảnh có nội dung thật, đúng khổ, lưu vào thư mục Tải về', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await setupProducts(win, dirs);

  await win.getByRole('button', { name: 'Xuất ảnh' }).click();
  await waitForDownloads(dirs, 1);
  const image = downloadedFiles(dirs).find((f) => /\.(png|jpe?g)$/i.test(f)) as string;
  expect(image).toBeTruthy();
  const imagePath = path.join(dirs.downloads, image);
  fs.mkdirSync('tests/output', { recursive: true });
  fs.copyFileSync(imagePath, 'tests/output/xuat-anh-ket-qua.png');

  // Bản web từng xuất ra ảnh trắng tinh mà file vẫn nặng cả trăm KB, nên phải đo điểm ảnh
  const info = await inspectImage(s, imagePath);
  expect(info.inkRatio, 'Ảnh phải có nội dung').toBeGreaterThan(0.005);
  expect(info.inkedAtRightEdge, 'Không bị cắt mép phải').toBe(0);
  await s.close();
});

test('Quét mã bằng camera giả: mở được máy quét, không báo lỗi quyền', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs, ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']);
  const { win } = s;
  await setupProducts(win, dirs);

  await win.getByRole('button', { name: 'Quét mã vạch / QR' }).first().click();
  await expect(win.locator('video').first()).toBeVisible({ timeout: 20_000 });
  await expect(win.getByText(/cấp quyền|Không tìm thấy máy ảnh|Không thể khởi động/)).toHaveCount(0);
  await win.keyboard.press('Escape');
  await s.app.evaluate(() => undefined);
  await s.close();
});

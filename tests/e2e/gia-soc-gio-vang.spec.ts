import { expect, test } from '@playwright/test';
import { chooseMode, chooseSubTab, closePreview, downloadedFiles, evalInPrintDoc, newDirs, openApp, printSummary, rowWith, waitForDownloads, writeWorkbook } from './helpers';

test('Sửa trực tiếp trên tem: giá đổi thì % tự tính, thêm vào hàng đợi', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');

  const preview = win.locator('#print-section .sticker-container');
  await preview.locator('.extra2').click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type('2745');
  await expect(preview.locator('.extra1')).toHaveText('-50%');

  await preview.locator('.header-text').click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type('TỦ LẠNH');

  await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Số lượng: 1')).toBeVisible();

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  expect(await printSummary(win)).toContain('A4 dọc');
  const header = await evalInPrintDoc<string>(s, `document.querySelector('.header-text').textContent`);
  expect(header).toBe('TỦ LẠNH');
  await closePreview(win);
  await s.close();
});

test('Nhập file giá ĐSD - TBBM: chọn, tìm và chỉ in các dòng đã chọn', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');

  const file = writeWorkbook(dirs, 'gia-dsd.xlsx', [
    rowWith({ 4: 'TÊN SẢN PHẨM', 5: '', 6: 'GIÁ', 7: 'GỐC', 8: 'GIẢM' }),
    rowWith({ 4: 'Quạt điều hoà', 5: 'Daikiosan', 6: '3490000', 7: '5490000', 8: 'x (-36%)', 42: 'IMEI: 123456' }),
    rowWith({ 4: 'Nồi cơm', 5: 'Sharp', 6: '990000', 7: '1290000', 8: 'x (-23%)', 42: 'CODE: ABC789' }),
  ]);
  await win.locator('label:has-text("File giá ĐSD - TBBM") input[type="file"]').setInputFiles(file);
  await expect(win.getByText('Danh sách in (2/2)')).toBeVisible();

  await win.getByPlaceholder('Tìm tên sản phẩm hoặc IMEI...').fill('Nồi');
  await win.locator('label:has-text("Nồi cơm Sharp")').first().click();
  await expect(win.getByText('Danh sách in (1/2)')).toBeVisible();
  await win.getByPlaceholder('Tìm tên sản phẩm hoặc IMEI...').fill('');

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  expect(await printSummary(win)).toContain('Số trang | 1');
  const name = await evalInPrintDoc<string>(s, `document.querySelector('.name').textContent`);
  expect(name).toContain('Quạt điều hoà Daikiosan');
  await closePreview(win);
  await s.close();
});

test('File ERP mẫu 97 và 99: đọc đúng cột, đổi Giá giảm và Giá Dịch vụ, lọc % giảm', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');

  const may97 = writeWorkbook(dirs, 'erp-97.xlsx', [
    ['tiêu đề'],
    rowWith({ 8: '4000000', 16: '5000000', 17: '3000000', 27: 'Tivi Samsung 55 inch', 28: 'TV55-X', 31: 'Tặng loa' }),
  ]);
  await win.locator('label:has-text("Điện tử/Lạnh (mẫu in 97)") input[type="file"]').setInputFiles(may97);
  await expect(win.getByText('Số lượng: 1')).toBeVisible();

  await chooseSubTab(win, /Dữ liệu/);
  const may99 = writeWorkbook(dirs, 'erp-99.xlsx', [
    ['tiêu đề'],
    rowWith({ 1: '7000000', 20: '6000000', 31: 'Tặng lõi lọc', 33: '9000000', 44: 'Máy lọc nước Kangaroo RO nóng lạnh tủ đứng KG100', 55: 'MLN100-Y' }),
  ]);
  await win.locator('label:has-text("Máy lọc nước (mẫu in 99)") input[type="file"]').setInputFiles(may99);
  await expect(win.getByText('Số lượng: 2')).toBeVisible();
  await expect(win.locator('p', { hasText: 'MLN Kangaroo KG100' })).toBeVisible();

  // Lời giới thiệu nút đổi kiểu giảm giá chỉ hiện ở lần đầu, che nút Giá giảm (bản web cũng vậy)
  await win.getByRole('button', { name: 'Đã hiểu' }).click();

  // Giá giảm: 3.000 là -40%, Giá Dịch vụ: 4.000 là -20%
  await expect(win.getByText('-40%').first()).toBeVisible();
  await win.getByRole('button', { name: 'Giá Dịch vụ' }).click();
  await expect(win.getByText('-20%').first()).toBeVisible();
  await win.getByRole('button', { name: 'Giá giảm' }).click();

  // Lọc: chỉ giữ tem giảm từ 35% trở lên (Tivi -40%, Máy lọc -33%)
  await win.getByPlaceholder('% Giảm').fill('35');
  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  expect(await printSummary(win)).toContain('Số trang | 1');
  expect(await evalInPrintDoc<string>(s, `document.querySelector('.name').textContent`)).toBe('Tivi Samsung 55 inch');
  await closePreview(win);
  await s.close();
});

test('Chế độ số tiền giảm: bản in khớp xem trước', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  const file = writeWorkbook(dirs, 'mau.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'A1', 'Quạt A', '5490000', '3490000', 'KM'],
    ['NỒI', 'A2', 'Nồi B', '1290000', '990000', 'KM'],
  ]);
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(file);
  await expect(win.getByText('Số lượng: 2')).toBeVisible();
  await win.locator('button[title^="Hiển thị: % Giảm"]').first().click();

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  const amounts = await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('.extra1')].map((e) => e.textContent)`);
  expect(amounts).toEqual(['-2triệu', '-300K']);
  await closePreview(win);
  await s.close();
});

test('Mã vạch trên tem trong hàng đợi đi theo nút bật tắt, khớp xem trước', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  const file = writeWorkbook(dirs, 'mau.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'ABC123', 'Quạt A', '5490000', '3490000', 'KM'],
  ]);
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(file);
  await expect(win.getByText('Số lượng: 1')).toBeVisible();
  await win.getByRole('button', { name: 'Đã hiểu' }).click();

  const barcodesInPrint = async () => {
    await win.getByRole('button', { name: /Bấm để in/ }).first().click();
    await printSummary(win);
    const count = await evalInPrintDoc<number>(s, `document.querySelectorAll('.barcode img').length`);
    await closePreview(win);
    return count;
  };

  // Mặc định tắt: xem trước và bản in đều không có
  await expect(win.locator('#print-section .barcode')).toHaveCount(0);
  expect(await barcodesInPrint()).toBe(0);

  // Bật: cả hai đều có
  await win.locator('button[title^="Mã Vạch: Đang tắt"]').first().click();
  await expect(win.locator('#print-section .barcode')).toHaveCount(1);
  expect(await barcodesInPrint()).toBe(1);

  // Tắt lại
  await win.locator('button[title^="Mã Vạch: Đang bật"]').first().click();
  expect(await barcodesInPrint()).toBe(0);
  await s.close();
});

test('Lưu danh sách, tải lại, xoá; lịch sử in khôi phục được; còn sau khi mở lại app', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await chooseMode(win, 'Giá Sốc');
  const file = writeWorkbook(dirs, 'mau.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'A1', 'Quạt A', '5490000', '3490000', 'KM'],
  ]);
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(file);
  await expect(win.getByText('Số lượng: 1')).toBeVisible();

  await win.getByRole('button', { name: 'Lưu danh sách' }).first().click();
  await win.getByRole('dialog').getByRole('textbox').fill('Danh sách quạt');
  await win.getByRole('dialog').getByRole('button', { name: /Lưu/ }).click();
  await expect(win.getByText(/Đã lưu danh sách "Danh sách quạt"/)).toBeVisible();

  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  await closePreview(win);

  await win.getByRole('button', { name: 'Xóa tất cả' }).first().click();
  await expect(win.getByText('Danh sách đã lưu (1)')).toBeVisible();
  await win.waitForTimeout(2500); // chờ app lưu xuống máy
  await s.close();

  // Mở lại: danh sách và lịch sử vẫn còn
  s = await openApp(dirs);
  win = s.win;
  await chooseMode(win, 'Giá Sốc');
  await chooseSubTab(win, /D\.Sách/);
  // Lời giới thiệu nút đổi kiểu giảm giá chỉ hiện ở lần đầu, che một phần danh sách (bản web cũng vậy)
  const onboarding = win.getByRole('button', { name: 'Đã hiểu' });
  if (await onboarding.isVisible().catch(() => false)) await onboarding.click();
  await win.getByText('Danh sách đã lưu (1)').click();
  await win.getByRole('button', { name: 'Tải danh sách' }).click();
  await expect(win.getByText('Số lượng: 1')).toBeVisible();
  await win.getByRole('button', { name: 'Xóa tất cả' }).first().click();
  await win.getByText('Danh sách đã lưu (1)').click();
  await win.getByRole('button', { name: 'Xóa danh sách' }).click();
  await expect(win.getByText(/Danh sách đã lưu \(/)).toHaveCount(0);

  await chooseSubTab(win, /Lịch sử/);
  await win.getByRole('button', { name: 'Khôi phục', exact: true }).first().click();
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Số lượng: 1')).toBeVisible();
  await s.close();
});

test('Tải file mẫu: tự lưu vào thư mục Tải về, không ghi đè tệp cũ, có báo', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  await win.getByRole('button', { name: 'Tải file mẫu' }).click();
  await waitForDownloads(s, 1);
  await win.getByRole('button', { name: 'Tải file mẫu' }).click();
  await waitForDownloads(s, 2);
  expect(downloadedFiles(dirs)).toEqual(['Sticker_Template_Gia_Soc (1).xlsx', 'Sticker_Template_Gia_Soc.xlsx']);
  await expect(win.getByRole('button', { name: 'Mở thư mục' }).first()).toBeVisible();

  await chooseMode(win, 'Giờ Vàng');
  await win.getByRole('button', { name: 'Tải file mẫu' }).click();
  await waitForDownloads(s, 3);
  expect(downloadedFiles(dirs)).toContain('Sticker_Template_Gio_Vang.xlsx');
  await s.close();
});

test('Mở lại màn xem trước: không còn hiện bản in lần trước', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  const button = win.getByRole('button', { name: /Bấm để in/ }).first();
  await button.click();
  await printSummary(win);
  const first = await win.locator('[data-testid="print-preview"] iframe').getAttribute('src');
  await closePreview(win);

  // Theo dõi ngay từ khung hình đầu tiên sau khi bấm in lần hai
  await win.evaluate((oldSrc) => {
    (window as unknown as { __staleSeen: boolean }).__staleSeen = false;
    new MutationObserver(() => {
      if (document.querySelector(`[data-testid="print-preview"] iframe[src="${oldSrc}"]`)) {
        (window as unknown as { __staleSeen: boolean }).__staleSeen = true;
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  }, first);
  await button.click();
  await printSummary(win);
  const second = await win.locator('[data-testid="print-preview"] iframe').getAttribute('src');
  expect(second).not.toBe(first);
  expect(await win.evaluate(() => (window as unknown as { __staleSeen: boolean }).__staleSeen), 'Thấy bản in cũ').toBe(false);
  await closePreview(win);
  await s.close();
});

test('Giờ Vàng: dùng nền và tiêu đề riêng, không lẫn với Giá Sốc', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Giờ Vàng');
  await expect(win.locator('#print-section .sub-header')).toBeVisible();
  await win.getByRole('button', { name: /Bấm để in/ }).first().click();
  await printSummary(win);
  const type = await evalInPrintDoc<string>(s, `document.querySelector('.sticker-container').dataset.type`);
  expect(type).toBe('gio_vang');
  await closePreview(win);
  await s.close();
});

test('Danh sách sticker: nhập 2 sản phẩm thấy đủ 2 ảnh, bấm ảnh để sửa, nút Thêm có tác dụng, in và mở lại đúng', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Giá Sốc');
  const file = writeWorkbook(dirs, 'mau-2.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'A1', 'Quạt đứng Asia', '5490000', '3490000', 'KM'],
    ['NỒI', 'A2', 'Nồi cơm Sharp', '1290000', '990000', ''],
  ]);
  const thumbnails = win.getByTestId('sticker-thumbnail');
  const bigName = win.locator('#print-section .name');
  const note = win.getByTestId('sticker-editing-note');
  const printButton = win.getByRole('button', { name: /Bấm để in/ }).first();

  // Chưa có danh sách thì không có dải ảnh
  await expect(win.getByTestId('sticker-strip')).toHaveCount(0);

  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(file);
  await expect(thumbnails).toHaveCount(2);
  await expect(thumbnails.nth(0).locator('.name')).toHaveText('Quạt đứng Asia');
  await expect(thumbnails.nth(1).locator('.name')).toHaveText('Nồi cơm Sharp');
  await expect(bigName).toHaveText('Quạt đứng Asia');
  await expect(note).toContainText('Đang sửa sticker 1/2');
  await expect(printButton).toContainText('(2)');

  // Bấm ảnh thứ hai: mở đúng sticker đó, ảnh được đánh dấu
  await thumbnails.nth(1).click();
  await expect(bigName).toHaveText('Nồi cơm Sharp');
  await expect(note).toContainText('Đang sửa sticker 2/2');
  await expect(thumbnails.nth(1)).toHaveAttribute('aria-pressed', 'true');

  // Sửa trên bản xem trước: ảnh nhỏ và bản in đổi theo, sticker kia giữ nguyên
  await bigName.click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type('Nồi cơm đã sửa');
  await expect(thumbnails.nth(1).locator('.name')).toHaveText('Nồi cơm đã sửa');
  await expect(thumbnails.nth(0).locator('.name')).toHaveText('Quạt đứng Asia');

  // Thêm: danh sách có thêm một sticker, có thông báo, sửa tiếp không đổi sticker vừa thêm
  await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(win.getByText('Đã thêm vào danh sách, hiện có 3 sticker')).toBeVisible();
  await expect(thumbnails).toHaveCount(3);
  await expect(printButton).toContainText('(3)');
  await expect(note).toContainText('chưa có trong danh sách');
  await bigName.click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type('Sticker soạn mới');
  await expect(thumbnails.nth(2).locator('.name')).toHaveText('Nồi cơm đã sửa');

  await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(thumbnails).toHaveCount(4);
  await expect(thumbnails.nth(3).locator('.name')).toHaveText('Sticker soạn mới');
  await expect(printButton).toContainText('(4)');

  // Tên dài không bị cắt khi đưa vào danh sách
  const longName = 'Máy lọc nước nóng lạnh RO Kangaroo KG10A3 VTU 10 lõi dung tích lớn';
  await bigName.click();
  await win.keyboard.press('ControlOrMeta+a');
  await win.keyboard.type(longName);
  await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(thumbnails).toHaveCount(5);
  await expect(thumbnails.nth(4).locator('.name')).toHaveText(longName);

  // Bản in khớp đúng những gì thấy trong dải ảnh
  await printButton.click();
  expect(await printSummary(win)).toContain('Số trang | 5');
  const printedNames = await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('#print-host .name')].map((el) => el.textContent)`);
  expect(printedNames).toEqual(['Quạt đứng Asia', 'Nồi cơm đã sửa', 'Nồi cơm đã sửa', 'Sticker soạn mới', longName]);
  await closePreview(win);

  // Mở lại app: danh sách còn đủ
  await win.waitForTimeout(1500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Giá Sốc');
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(5);
  await expect(win.getByTestId('sticker-thumbnail').nth(1).locator('.name')).toHaveText('Nồi cơm đã sửa');

  // Phiếu in theo số lượng nên không có nút Thêm và không có dải ảnh
  await chooseMode(win, 'Phiếu');
  await expect(win.getByRole('button', { name: 'Thêm', exact: true })).toHaveCount(0);
  await expect(win.getByTestId('sticker-strip')).toHaveCount(0);
  await s.close();
});

test('Thêm khi chưa có danh sách: thấy ngay ảnh sticker và có thông báo', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Giờ Vàng');
  await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(win.getByText('Đã thêm vào danh sách, hiện có 1 sticker')).toBeVisible();
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(1);
  await expect(win.getByRole('button', { name: /Bấm để in/ }).first()).toContainText('(1)');
  await s.close();
});

test('Nút x trên ảnh sticker: xoá nhanh đúng sticker đó, không mở sticker, còn đúng sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Giờ Vàng');
  const thumbnails = win.getByTestId('sticker-thumbnail');
  const removeButtons = win.getByTestId('sticker-thumbnail-remove');
  const bigName = win.locator('#print-section .name');
  const printButton = win.getByRole('button', { name: /Bấm để in/ }).first();

  for (const name of ['Sticker A', 'Sticker B', 'Sticker C']) {
    await bigName.click();
    await win.keyboard.press('ControlOrMeta+a');
    await win.keyboard.type(name);
    await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  }
  await expect(thumbnails).toHaveCount(3);
  await expect(removeButtons).toHaveCount(3);

  // Xoá sticker giữa: không mở sticker đó, số thứ tự và số trang in cập nhật
  await thumbnails.nth(0).click();
  await win.getByRole('button', { name: 'Xoá sticker 2: Sticker B' }).click();
  await expect(thumbnails).toHaveCount(2);
  await expect(thumbnails.nth(0).locator('.name')).toHaveText('Sticker A');
  await expect(thumbnails.nth(1).locator('.name')).toHaveText('Sticker C');
  await expect(thumbnails.nth(1)).toHaveAttribute('aria-label', 'Mở sticker 2: Sticker C');
  await expect(thumbnails.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(bigName).toHaveText('Sticker A');
  await expect(printButton).toContainText('(2)');

  // Xoá sticker đang mở: bản xem trước thành sticker đang soạn, chưa có trong danh sách
  await removeButtons.nth(0).click();
  await expect(thumbnails).toHaveCount(1);
  await expect(win.getByTestId('sticker-editing-note')).toContainText('chưa có trong danh sách');

  await win.waitForTimeout(1500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Giờ Vàng');
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(1);
  await expect(win.getByTestId('sticker-thumbnail').nth(0).locator('.name')).toHaveText('Sticker C');

  // Xoá hết thì không còn dải ảnh, nút in quay về in sticker đang soạn
  await win.getByTestId('sticker-thumbnail-remove').click();
  await expect(win.getByTestId('sticker-strip')).toHaveCount(0);
  await expect(win.getByRole('button', { name: /Bấm để in/ }).first()).toContainText('(1)');
  await s.close();
});

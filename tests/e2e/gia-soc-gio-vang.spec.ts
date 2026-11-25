import { expect, test } from '@playwright/test';
import { chooseMode, chooseStickersPerPage, chooseSubTab, closePreview, downloadedFiles, evalInPrintDoc, newDirs, openApp, printSummary, waitForDownloads, writeWorkbook } from './helpers';

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

  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
  expect(await printSummary(win)).toContain('A4 dọc');
  const header = await evalInPrintDoc<string>(s, `document.querySelector('.header-text').textContent`);
  expect(header).toBe('TỦ LẠNH');
  await closePreview(win);
  await s.close();
});

test('Không còn nhập file giá ĐSD - TBBM và file in giá từ ERP; nút Đặt lại nằm trong nhóm file mẫu; lọc % giảm', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  await expect(win.getByText('Nhập file in giá từ ERP')).toHaveCount(0);
  await expect(win.getByText('Máy lọc nước (mẫu in 99)')).toHaveCount(0);
  await expect(win.getByText('Điện tử/Lạnh (mẫu in 97)')).toHaveCount(0);
  await expect(win.getByText('File giá ĐSD - TBBM')).toHaveCount(0);
  // Thứ tự trong nhóm Nhập từ file mẫu: Nhập file mẫu, Tải file mẫu, Đặt lại
  const order = await win.locator('label:has-text("Nhập file mẫu"), button:has-text("Tải file mẫu"), button:has-text("Đặt lại")')
    .evaluateAll((els) => els.map((el) => ({ text: (el.textContent ?? '').trim(), x: el.getBoundingClientRect().x })));
  expect(order.sort((a, b) => a.x - b.x).map((item) => item.text)).toEqual(['Nhập file mẫu', 'Tải file mẫu', 'Đặt lại']);

  const preview = win.locator('#print-section .sticker-container');
  const setSticker = async (header: string, newPrice: string) => {
    await preview.locator('.header-text').click();
    await win.keyboard.press('ControlOrMeta+a');
    await win.keyboard.type(header);
    await preview.locator('.extra2').click();
    await win.keyboard.press('ControlOrMeta+a');
    await win.keyboard.type(newPrice);
    await win.getByRole('button', { name: 'Thêm', exact: true }).click();
  };
  // Giá cũ 5.490.000: 2.745 là -50%, 4.990 là -9%
  await setSticker('TỦ LẠNH', '2745');
  await setSticker('NỒI CƠM', '4990');
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Số lượng: 2')).toBeVisible();
  // Không có sticker nào có giá dịch vụ nên không có nút đổi Giá giảm, Giá Dịch vụ
  await expect(win.getByRole('button', { name: 'Giá Dịch vụ' })).toHaveCount(0);

  // Lời giới thiệu nút đổi kiểu giảm giá chỉ hiện ở lần đầu, che nút bên cạnh (bản web cũng vậy)
  await win.getByRole('button', { name: 'Đã hiểu' }).click();
  await win.getByPlaceholder('% Giảm').fill('35');
  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
  expect(await printSummary(win)).toContain('Số trang | 1');
  expect(await evalInPrintDoc<string>(s, `document.querySelector('.header-text').textContent`)).toBe('TỦ LẠNH');
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

  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
  await printSummary(win);
  const amounts = await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('.extra1')].map((e) => e.textContent)`);
  expect(amounts).toEqual(['-2triệu', '-300K']);
  await closePreview(win);
  await s.close();
});

test('Mã vạch luôn hiện và in khi sticker có mã, không còn nút bật tắt; sticker không có mã thì không có mã vạch', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(writeWorkbook(dirs, 'mau.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'ABC123', 'Quạt A', '5490000', '3490000', 'KM'],
    ['NỒI', '', 'Nồi B', '1290000', '990000', ''],
  ]));
  const thumbnails = win.getByTestId('sticker-thumbnail');
  await expect(thumbnails).toHaveCount(2);

  // Không có nút bật tắt ở cả hai chỗ của danh sách
  await expect(win.getByTitle(/Mã Vạch:/)).toHaveCount(0);
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Số lượng: 2')).toBeVisible();
  await expect(win.getByTitle(/Mã Vạch:/)).toHaveCount(0);

  // Sticker có mã: xem trước và ảnh nhỏ có mã vạch; sticker không có mã thì không, kể cả mở sau sticker có mã
  await thumbnails.nth(0).click();
  await expect(win.locator('#print-section .barcode')).toHaveCount(1);
  await expect(thumbnails.nth(0).locator('.barcode img')).toHaveAttribute('alt', 'ABC123');
  await expect(thumbnails.nth(1).locator('.barcode')).toHaveCount(0);
  await thumbnails.nth(1).click();
  await expect(win.locator('#print-section .barcode')).toHaveCount(0);

  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
  await printSummary(win);
  expect(await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('.barcode img')].map((img) => img.alt)`)).toEqual(['ABC123']);
  await closePreview(win);

  // Giờ Vàng dùng chung danh sách, cũng luôn có mã vạch và không có nút
  await chooseMode(win, 'Giờ Vàng');
  await thumbnails.nth(0).click();
  await expect(win.locator('#print-section .barcode')).toHaveCount(1);
  await expect(win.getByTitle(/Mã Vạch:/)).toHaveCount(0);

  // Bấm vào dòng mã vạch để nhập mã: sticker chưa có mã có chỗ bấm, gõ xong Enter là có mã vạch, sticker trong danh sách nhận mã
  await thumbnails.nth(1).click();
  await win.locator('#print-section').getByRole('button', { name: 'Bấm để nhập mã vạch' }).click();
  await win.locator('#print-section').getByLabel('Mã vạch').fill('NB990');
  await win.keyboard.press('Enter');
  await expect(win.locator('#print-section .barcode img')).toHaveAttribute('alt', 'NB990');
  await expect(thumbnails.nth(1).locator('.barcode img')).toHaveAttribute('alt', 'NB990');
  // Sửa mã đang có
  await win.locator('#print-section').getByRole('button', { name: /Mã vạch NB990/ }).click();
  await win.locator('#print-section').getByLabel('Mã vạch').fill('NB991');
  await win.keyboard.press('Enter');
  await expect(thumbnails.nth(1).locator('.barcode img')).toHaveAttribute('alt', 'NB991');

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

  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
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
  const button = win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first();
  await button.click();
  await chooseStickersPerPage(win);
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
  await chooseStickersPerPage(win);
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
  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
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
  const printButton = win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first();

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
  await chooseStickersPerPage(win);
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
  await expect(win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first()).toContainText('(1)');
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
  const printButton = win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first();

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
  await expect(win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first()).toContainText('(1)');
  await s.close();
});

test('In nhiều sticker trên 1 trang A4: chọn lúc bấm in, đúng số trang và khổ giấy, nhớ lựa chọn sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Giá Sốc');
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(writeWorkbook(dirs, 'mau-5.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ...['Quạt đứng', 'Nồi cơm', 'Bếp từ', 'Lò vi sóng', 'Máy xay'].map((name, i) => ['QUẠT', `A${i}`, name, '5490000', '3490000', '']),
  ]));
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(5);

  const printButton = () => win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first();
  // Tìm theo cửa sổ hiện tại, vì giữa bài app được mở lại
  const dialog = () => win.getByRole('dialog', { name: 'Chọn số sticker trên 1 trang A4' });
  const option = (perPage: number) => dialog().getByRole('button', { name: new RegExp(`^${perPage} sticker / trang`) });

  // Lần đầu chọn sẵn 1 sticker mỗi trang; mỗi cách xếp báo số trang sẽ in
  await printButton().click();
  await expect(option(1)).toHaveAttribute('aria-pressed', 'true');
  for (const [perPage, pages] of [[1, 5], [2, 3], [4, 2], [8, 1], [16, 1]]) {
    await expect(option(perPage)).toContainText(`${pages} trang`);
  }
  // Không phải đặt tên: danh sách tự lưu vào Lịch sử; cách xếp đang chọn được chọn sẵn, bấm Enter là in
  await expect(dialog()).toContainText('Danh sách tự lưu vào tab Lịch sử');
  await expect(dialog().getByLabel('Tên danh sách')).toHaveCount(0);
  await expect(option(1)).toBeFocused();
  // Đóng hộp thì không in
  await win.keyboard.press('Escape');
  await expect(dialog()).toHaveCount(0);
  await expect(win.getByTestId('print-preview')).toHaveCount(0);

  // 4 sticker mỗi trang: A4 dọc, 2 trang, sticker đúng tỉ lệ và nằm gọn trong trang
  await printButton().click();
  await option(4).click();
  expect(await printSummary(win)).toMatch(/A4 dọc \| Số trang \| 2/);
  const sheet = await evalInPrintDoc<{ sheets: number[]; widthMm: number; ratio: number; inside: boolean; fontRatio: number }>(s, `(() => {
    const mm = (px) => px * 25.4 / 96;
    const sheets = [...document.querySelectorAll('.sticker-sheet')];
    const first = sheets[0].querySelector('.sticker-container').getBoundingClientRect();
    const inside = sheets.every((page) => {
      const box = page.getBoundingClientRect();
      return [...page.querySelectorAll('.sticker-container')].every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
      });
    });
    const price = document.querySelector('.sticker-sheet .extra2');
    return {
      sheets: sheets.map((page) => page.querySelectorAll('.sticker-container').length),
      widthMm: mm(first.width),
      ratio: first.width / first.height,
      inside,
      fontRatio: parseFloat(getComputedStyle(price).fontSize) / first.width,
    };
  })()`);
  expect(sheet.sheets).toEqual([4, 1]);
  expect(sheet.widthMm).toBeGreaterThan(95);
  expect(sheet.widthMm).toBeLessThan(99);
  expect(sheet.ratio).toBeCloseTo(197 / 285, 2);
  expect(sheet.inside).toBe(true);
  // Chữ thu nhỏ theo sticker (cỡ giá mới mặc định là 26,5% bề rộng sticker)
  expect(sheet.fontRatio).toBeCloseTo(0.265, 2);
  await closePreview(win);

  // Lần sau chọn sẵn cách xếp vừa dùng; 2 sticker mỗi trang in A4 ngang
  await printButton().click();
  await expect(option(4)).toHaveAttribute('aria-pressed', 'true');
  await expect(option(1)).toHaveAttribute('aria-pressed', 'false');
  await option(2).click();
  expect(await printSummary(win)).toMatch(/A4 ngang \| Số trang \| 3/);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.sticker-sheet').length`)).toBe(3);
  await closePreview(win);

  await win.waitForTimeout(800);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);

  // Giờ Vàng dùng chung lựa chọn đã lưu; bấm Enter là in theo cách đang chọn
  await chooseMode(win, 'Giờ Vàng');
  await printButton().click();
  await expect(option(2)).toHaveAttribute('aria-pressed', 'true');
  await option(8).click();
  expect(await printSummary(win)).toMatch(/A4 ngang \| Số trang \| 1/);
  expect(await evalInPrintDoc<string>(s, `document.querySelector('.sticker-sheet .sticker-container').dataset.type`)).toBe('gio_vang');
  await closePreview(win);
  await printButton().click();
  await expect(option(8)).toBeFocused();
  await win.keyboard.press('Enter');
  expect(await printSummary(win)).toMatch(/A4 ngang \| Số trang \| 1/);
  await closePreview(win);
  await s.close();
});

test('Xoá mã vạch của sticker đang soạn: hiện chỗ bấm để nhập, chỗ này không in ra; Esc thì giữ mã cũ', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Giá Sốc');
  const section = win.locator('#print-section');
  await expect(section.locator('.barcode img')).toHaveAttribute('alt', '123456');

  // Esc thì không đổi
  await section.getByRole('button', { name: /Mã vạch 123456/ }).click();
  await section.getByLabel('Mã vạch').fill('KHONG-LUU');
  await win.keyboard.press('Escape');
  await expect(section.locator('.barcode img')).toHaveAttribute('alt', '123456');

  // Xoá trống thì còn chỗ bấm để nhập, bản in không có mã vạch và không có chỗ bấm
  await section.getByRole('button', { name: /Mã vạch 123456/ }).click();
  await section.getByLabel('Mã vạch').fill('');
  await win.keyboard.press('Enter');
  await expect(section.getByRole('button', { name: 'Bấm để nhập mã vạch' })).toBeVisible();
  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
  await printSummary(win);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.barcode, [data-print-skip]').length`)).toBe(0);
  expect(await evalInPrintDoc<string>(s, `document.body.textContent`)).not.toContain('Bấm để nhập mã vạch');
  await closePreview(win);
  await s.close();
});

test('Số bản in cho từng sticker: đọc từ file mẫu, sửa trên ảnh nhỏ và D.Sách, in đúng số bản ở Giá Sốc, Giờ Vàng, Sticker, còn sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Giá Sốc');
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(writeWorkbook(dirs, 'mau-sl.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI', 'SỐ BẢN IN'],
    ['QUẠT', 'A1', 'Quạt đứng Asia', '5490000', '3490000', '', '2'],
    ['NỒI', 'A2', 'Nồi cơm Sharp', '1290000', '990000', '', ''],
  ]));
  const thumbnails = win.getByTestId('sticker-thumbnail');
  await expect(thumbnails).toHaveCount(2);
  const thumbQty = (i: number) => win.getByLabel(new RegExp(`^Số bản in của sticker ${i + 1}:`)).locator('input');
  // Cột SỐ BẢN IN trống thì 1 bản
  await expect(thumbQty(0)).toHaveValue('2');
  await expect(thumbQty(1)).toHaveValue('1');
  const printButton = win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first();
  await expect(printButton).toContainText('(3)');

  // Bấm + trên ảnh nhỏ không mở sticker; D.Sách thấy cùng số bản và sửa được
  await win.getByRole('group', { name: /^Số bản in của sticker 2:/ }).getByRole('button', { name: 'Thêm một bản' }).click();
  await expect(thumbQty(1)).toHaveValue('2');
  await expect(printButton).toContainText('(4)');
  await chooseSubTab(win, /D\.Sách/);
  const rowQty = win.getByRole('group', { name: 'Số bản in của sticker 1', exact: true });
  await expect(rowQty.locator('input')).toHaveValue('2');
  await rowQty.locator('input').fill('3');
  await rowQty.locator('input').press('Enter');
  await expect(thumbQty(0)).toHaveValue('3');
  await expect(printButton).toContainText('(5)');

  // Giá Sốc 4 sticker mỗi trang: 5 bản thành 2 trang
  await printButton.click();
  await chooseStickersPerPage(win, 4);
  expect(await printSummary(win)).toContain('Số trang | 2');
  expect(await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('#print-host .sticker-container .name')].map((el) => el.textContent)`))
    .toEqual(['Quạt đứng Asia', 'Quạt đứng Asia', 'Quạt đứng Asia', 'Nồi cơm Sharp', 'Nồi cơm Sharp']);
  await closePreview(win);

  // Giờ Vàng dùng chung danh sách và số bản
  await chooseMode(win, 'Giờ Vàng');
  await expect(printButton).toContainText('(5)');

  // Tab Sticker: ô Số bản in cạnh Khuyến mãi là của sticker đang mở (sticker 1: 3 bản)
  await chooseMode(win, 'Sticker');
  const editorQty = win.getByTestId('tag-editor').getByRole('group', { name: 'Số bản in' });
  await expect(editorQty.locator('input')).toHaveValue('3');
  // Thêm bản sao của sticker đang mở: giữ 3 bản; các ô trống cho sticker mới, số bản về 1
  await win.getByTestId('tag-preview').getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(thumbnails).toHaveCount(3);
  await expect(thumbQty(2)).toHaveValue('3');
  await expect(editorQty.locator('input')).toHaveValue('1');
  // Sticker soạn mới 4 bản
  await win.getByLabel('Tên sản phẩm').fill('Bếp từ Sunhouse');
  await win.getByLabel('Giá mới (nghìn đồng)').fill('1290');
  for (let i = 0; i < 3; i++) await editorQty.getByRole('button', { name: 'Thêm một bản' }).click();
  await win.getByTestId('tag-preview').getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(thumbnails).toHaveCount(4);
  await expect(thumbQty(3)).toHaveValue('4');
  await expect(editorQty.locator('input')).toHaveValue('1');
  await expect(printButton).toContainText('(12)');
  // Mở sticker 2 thì ô số bản là của sticker đó
  await thumbnails.nth(1).click();
  await expect(editorQty.locator('input')).toHaveValue('2');

  await printButton.click();
  await win.getByRole('dialog', { name: 'Chọn Kiểu & Bố Cục In' }).getByRole('button', { name: /^24 Sticker \/ Trang/ }).click();
  await printSummary(win);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag').length`)).toBe(12);
  await expect(win.getByTestId('print-preview')).toContainText('12 sticker');
  await closePreview(win);

  await win.waitForTimeout(1500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Giá Sốc');
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(4);
  await expect(win.getByLabel(/^Số bản in của sticker 4:/).locator('input')).toHaveValue('4');
  await expect(win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first()).toContainText('(12)');
  await s.close();
});

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { downloadedFiles, newDirs, openApp, waitForDownloads, XLSX } from './helpers';

const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });
const openNhacViec = (win: Page) => rail(win).getByRole('button', { name: 'Nhắc việc' }).click();
const pad = (n: number) => String(n).padStart(2, '0');

/** Dời đồng hồ của lịch nhắc tới `target` (ms) rồi cho kiểm tra ngay */
const jumpTo = (win: Page, target: number) => win.evaluate((at) => {
  const w = window as unknown as { __nhacViecOffset: number; __nhacViecTick: () => void };
  w.__nhacViecOffset = at - Date.now();
  w.__nhacViecTick();
}, target);

/** Chờ cửa sổ nhắc bật lên */
const nextPopup = async (app: ElectronApplication, trigger: () => Promise<unknown>): Promise<Page> => {
  const [popup] = await Promise.all([app.waitForEvent('window'), trigger()]);
  await popup.waitForSelector('[data-testid="cua-so-nhac"]');
  return popup;
};

/** Bấm nút trên cửa sổ nhắc: cửa sổ đóng ngay sau khi bấm */
const clickInPopup = async (popup: Page, name: string | RegExp) => {
  await popup.getByRole('button', { name }).click({ noWaitAfter: true }).catch(() => undefined);
  await expect.poll(() => popup.isClosed()).toBe(true);
};

test('Nhắc việc: tạo, nhắc trước hạn bằng cửa sổ luôn nằm trên cùng, hoãn 5 phút, bấm Đã xong; đóng cửa sổ thì app vẫn chạy nền', async () => {
  const s = await openApp();
  const { win, app } = s;
  await openNhacViec(win);
  await expect(win.getByRole('button', { name: 'Hôm nay' })).toBeVisible();
  await expect(win.getByRole('heading', { level: 1 })).toHaveText('Nhắc việc');

  // Hạn 3 giờ nữa, giờ chẵn phút
  const deadline = Math.ceil((Date.now() + 3 * 3600_000) / 60_000) * 60_000;
  const d = new Date(deadline);
  await win.getByRole('button', { name: 'Tạo nhắc việc' }).first().click();
  await win.getByLabel('Tiêu đề công việc').fill('Gửi báo cáo kiểm hàng');
  await win.getByLabel('Nội dung công việc').fill('Gửi báo cáo thiếu hàng cho kho chuyển');
  await win.getByLabel('Ngày hạn').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  await win.getByLabel('Giờ hạn').fill(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  await win.getByRole('group', { name: 'Mức độ' }).getByRole('button', { name: 'Quan trọng' }).click();
  await win.getByRole('radio', { name: 'Bíp dồn dập' }).check();
  await win.getByRole('button', { name: 'Tạo nhắc việc' }).last().click();
  await expect(win.getByText('Đã tạo nhắc việc')).toBeVisible();

  await win.getByRole('button', { name: 'Nhắc việc', exact: true }).last().click();
  const row = win.getByTestId('nhac-viec-dong').filter({ hasText: 'Gửi báo cáo kiểm hàng' });
  await expect(row).toContainText('Quan trọng');
  await expect(row).toContainText('Bíp dồn dập');

  // Trước hạn 15 phút: cửa sổ nhắc bật lên, nằm trên mọi ứng dụng
  let popup = await nextPopup(app, () => jumpTo(win, deadline - 15 * 60_000 + 5_000));
  await expect(popup.getByRole('heading', { name: 'Gửi báo cáo kiểm hàng' })).toBeVisible();
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('còn 15 phút');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.getTitle() === 'Nhắc việc').map(w => w.isAlwaysOnTop()))).toEqual([true]);

  // Hoãn 5 phút: nhắc lại đúng lúc đó
  await clickInPopup(popup, '5′');
  popup = await nextPopup(app, () => jumpTo(win, deadline - 10 * 60_000 + 10_000));
  await expect(popup.getByRole('heading', { name: 'Gửi báo cáo kiểm hàng' })).toBeVisible();
  await clickInPopup(popup, 'Đã xong');
  await win.getByRole('group', { name: 'Lọc nhắc việc' }).getByRole('button', { name: /^Đã xong/ }).click();
  await expect(row).toContainText('Đã xong');
  // Đã xong thì đến hạn không nhắc nữa
  await jumpTo(win, deadline + 5_000);
  await win.waitForTimeout(800);
  expect(app.windows().filter(page => !page.isClosed()).length).toBe(1);

  // Đóng cửa sổ chính: app vẫn chạy nền để nhắc việc, bấm biểu tượng app thì hiện lại
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => w.isVisible()))).toEqual([false]);
  await app.evaluate(({ app: electronApp }) => electronApp.emit('activate'));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
  await s.close();
});

test('Việc khẩn quá hạn: nhắc lại sau 10 phút, số đỏ trên thanh bên trái; nhắc bị lỡ khi app tắt thì báo gộp', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await openNhacViec(win);
  const deadline = Math.ceil((Date.now() + 2 * 3600_000) / 60_000) * 60_000;
  const d = new Date(deadline);
  await win.getByRole('button', { name: 'Tạo nhắc việc' }).first().click();
  await win.getByLabel('Tiêu đề công việc').fill('Đếm tiền quỹ');
  await win.getByLabel('Ngày hạn').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  await win.getByLabel('Giờ hạn').fill(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  await win.getByRole('group', { name: 'Nhắc trước hạn' }).getByRole('button', { name: '15 phút' }).click();
  await win.getByRole('group', { name: 'Mức độ' }).getByRole('button', { name: 'Khẩn' }).click();
  await win.getByRole('button', { name: 'Tạo nhắc việc' }).last().click();

  let popup = await nextPopup(s.app, () => jumpTo(win, deadline + 5_000));
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('Khẩn');
  await clickInPopup(popup, /^30′$/);
  // Hoãn 30 phút nhưng việc khẩn quá hạn vẫn nhắc lại mỗi 10 phút
  popup = await nextPopup(s.app, () => jumpTo(win, deadline + 10 * 60_000 + 5_000));
  await expect(popup.getByRole('heading', { name: 'Đếm tiền quỹ' })).toBeVisible();
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('trễ 10 phút');
  await clickInPopup(popup, /^5′$/);
  await expect(win.getByTestId('so-do-tools-nhac-viec')).toHaveText('1');
  await s.close();

  // App tắt lúc đến giờ (việc khẩn nhắc lại tối đa 3 giờ sau hạn): mở lại thì một cửa sổ báo các nhắc bị lỡ
  s = await openApp(dirs);
  win = s.win;
  popup = await nextPopup(s.app, () => jumpTo(win, deadline + 3 * 3600_000 + 15 * 60_000));
  await expect(popup.getByRole('heading', { name: /Bạn đã bỏ lỡ 1 nhắc việc/ })).toBeVisible();
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('Đếm tiền quỹ');
  await clickInPopup(popup, 'Xem danh sách');
  await expect(rail(win).getByRole('button', { name: 'Nhắc việc' })).toHaveAttribute('aria-current', 'page');
  await s.close();
});

test('Checklist: tạo mẫu, làm từng việc với ghi chú và ảnh, hoàn tất khi còn thiếu, báo cáo sao chép, ảnh, Excel, thống kê', async () => {
  const s = await openApp();
  const { win, app } = s;
  await openNhacViec(win);
  await win.getByRole('button', { name: 'Checklist', exact: true }).click();
  await win.getByRole('button', { name: 'Tạo mẫu checklist' }).click();
  await win.getByLabel('Tên checklist').fill('Mở ca sáng');
  await win.getByLabel('Việc 1', { exact: true }).fill('Bật đèn, máy lạnh');
  await win.getByLabel('Việc 2', { exact: true }).fill('Kiểm tem giá khu điện thoại');
  await win.getByLabel('Việc 3', { exact: true }).fill('Đếm tiền quỹ');
  // Việc 2 cần ảnh
  await win.getByRole('dialog').locator('li').nth(1).getByRole('button', { name: 'Cần ảnh' }).click();
  await win.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(win.getByTestId('mau-checklist')).toContainText('3 việc');

  await win.getByTestId('mau-checklist').getByRole('button', { name: 'Bắt đầu' }).click();
  await win.getByLabel('Người làm').fill('Ngọc');
  const item = (n: number) => win.getByTestId('viec-checklist').nth(n);
  await item(0).getByRole('button', { name: 'Hoàn tất' }).click();
  await item(1).getByRole('button', { name: 'Có vấn đề' }).click();
  await item(1).getByLabel('Ghi chú việc 2').fill('3 tem sai giá, đã in lại');
  // Ảnh từ file
  const photo = path.join(s.dirs.inputs, 'tem.png');
  fs.writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'));
  await item(1).getByLabel('Chọn ảnh việc 2').setInputFiles(photo);
  await expect(item(1).getByRole('img')).toHaveCount(1);
  await expect(win.getByTestId('tien-do-checklist')).toHaveText('2/3 việc · 67%');

  // Còn việc bắt buộc chưa làm: hỏi trước khi hoàn tất
  await win.getByLabel('Ghi chú chung').fill('Thiếu người đếm quỹ, ca chiều làm bù');
  await win.getByRole('button', { name: 'Hoàn tất checklist' }).click();
  await expect(win.getByRole('dialog')).toContainText('Còn 1 việc bắt buộc chưa làm');
  await win.getByRole('button', { name: 'Vẫn hoàn tất' }).click();
  await expect(win.getByText(/^Đã hoàn tất lúc/)).toBeVisible();

  await win.getByRole('button', { name: 'Sao chép để gửi' }).click();
  const copied = await app.evaluate(async ({ clipboard }) => {
    const read = async () => String(await clipboard.readText());
    for (let i = 0; i < 20 && !(await read()).includes('MỞ CA SÁNG'); i++) await new Promise(r => setTimeout(r, 100));
    return read();
  });
  expect(copied).toContain('BÁO CÁO CHECKLIST: MỞ CA SÁNG');
  expect(copied).toContain('Người làm: Ngọc');
  expect(copied).toContain('Kết quả: 1/3 hoàn tất, 1 có vấn đề, 1 chưa làm');
  expect(copied).toContain('[!] 2. Kiểm tem giá khu điện thoại - Có vấn đề');
  expect(copied).toContain('    Ghi chú: 3 tem sai giá, đã in lại');
  expect(copied).toContain('    1 ảnh');
  expect(copied).toContain('[ ] 3. Đếm tiền quỹ - Chưa làm');
  expect(copied).toContain('Ghi chú chung: Thiếu người đếm quỹ, ca chiều làm bù');

  await win.getByRole('button', { name: 'Xuất Excel' }).click();
  await waitForDownloads(s, 1);
  await win.getByRole('button', { name: 'Xuất ảnh' }).click();
  await waitForDownloads(s, 2);
  const files = downloadedFiles(s.dirs);
  expect(files.some(name => /^Checklist_Mở_ca_sáng_\d{4}-\d{2}-\d{2}\.png$/.test(name))).toBe(true);
  const excel = files.find(name => name.endsWith('.xlsx'))!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(fs.readFileSync(path.join(s.dirs.downloads, excel))).Sheets['Báo cáo'], { header: 1 });
  expect(rows.find(r => r[0] === 2)?.slice(0, 8)).toEqual([2, 'Kiểm tem giá khu điện thoại', 'Có', 'Có vấn đề', expect.stringMatching(/^\d\d:\d\d$/), 'Ngọc', '3 tem sai giá, đã in lại', 1]);

  await win.getByRole('button', { name: 'Quay lại' }).click();
  await win.getByRole('button', { name: 'Thống kê' }).click();
  await expect(win.getByText('Lượt checklist', { exact: true }).locator('..')).toContainText('1');
  await expect(win.getByText('Việc hay có vấn đề').locator('..')).toContainText('Kiểm tem giá khu điện thoại');
  await s.close();
});

test('Nhận việc từ Google Sheet: dán link đã sao chép, báo việc mới, checklist từ file, nhắc kèm người xử lý, cập nhật khi quản lý sửa hoặc huỷ, ngắt kết nối', async () => {
  const dirs = newDirs();
  const mock = path.join(dirs.inputs, 'google-sheet.xlsx');
  const taskHeader = ['Mã việc', 'Tiêu đề', 'Nội dung', 'Ngày hạn', 'Giờ hạn', 'Người xử lý', 'Mức độ', 'Nhắc trước', 'Lặp lại', 'Âm thanh', 'Câu đọc', 'Checklist', 'Trạng thái', 'Người giao'];
  const checklistHeader = ['Tên checklist', 'Việc', 'Hướng dẫn', 'Bắt buộc', 'Cần ảnh', 'Cần ghi chú', 'Lịch làm', 'Giờ bắt đầu', 'Giờ hạn', 'Người làm', 'Trạng thái'];
  const writeSheet = (tasks: string[][], checklists: string[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([taskHeader, ...tasks]), 'Nhắc việc');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([checklistHeader, ...checklists]), 'Checklist');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Người xử lý (nhân viên)'], ['Ngọc - 11443']]), 'Danh mục');
    XLSX.writeFile(wb, mock);
  };
  const deadline = Math.ceil((Date.now() + 3 * 3600_000) / 60_000) * 60_000;
  const d = new Date(deadline);
  const day = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const checklists = [
    ['Kiểm hàng nhận', 'Đếm số thùng', '', 'TRUE', 'FALSE', 'FALSE', 'Không theo lịch', '', '', 'Ngọc - 11443', 'Đang dùng'],
    ['Kiểm hàng nhận', 'Chụp ảnh thùng móp', '', 'FALSE', 'TRUE', 'FALSE', '', '', '', '', ''],
  ];
  writeSheet([
    ['CV001', 'Kiểm lệnh chuyển hàng Online', 'Giao hàng tiết kiệm gấp', day, time, 'Ngọc - 11443', 'Khẩn', 'Đúng hạn', 'Không lặp', 'Đọc chữ', 'Kiểm tra lệnh chuyển hàng Online', 'Kiểm hàng nhận', 'Đang giao', 'QL Sơn'],
    ['CV002', 'Dọn kho phụ kiện', '', day, time, '', '', 'Đúng hạn', '', '', '', '', '', 'QL Sơn'],
    ['CV003', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ], checklists);
  const s = await openApp(dirs, [], { STICKER_SHEET_MOCK: mock });
  const { win, app } = s;
  await openNhacViec(win);
  await win.getByRole('button', { name: 'Cài đặt' }).click();
  const settings = win.getByRole('dialog', { name: 'Cài đặt nhắc việc' });
  await expect(settings.getByRole('button', { name: 'Tạo file nhắc việc' })).toBeVisible();

  // Clipboard chưa có link Google Sheet thì nhắc cách sao chép
  await app.evaluate(({ clipboard }) => clipboard.writeText('nội dung khác'));
  await settings.getByRole('button', { name: 'Dán link đã sao chép' }).click();
  await expect(settings.getByRole('alert')).toContainText('Chưa có link Google Sheet');

  // Sao chép link trong Google Sheet rồi bấm một nút là kết nối
  await app.evaluate(({ clipboard }) => clipboard.writeText('https://docs.google.com/spreadsheets/d/1DrQV5W-YitTXIvEXjRfmqNStHy5MqC2AFDnWsOnCXyg/edit?usp=sharing'));
  let popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Dán link đã sao chép' }).click());
  await expect(popup.getByRole('heading', { name: 'Có 2 công việc mới' })).toBeVisible();
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('Giao cho Ngọc - 11443');
  await clickInPopup(popup, 'Đóng');
  await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('2 công việc đang giao, 1 checklist');
  await win.keyboard.press('Escape');

  await win.getByRole('button', { name: 'Nhắc việc', exact: true }).last().click();
  const row = win.getByTestId('nhac-viec-dong').filter({ hasText: 'Kiểm lệnh chuyển hàng Online' });
  await expect(row).toContainText('Google Sheet · CV001');
  await expect(row).toContainText('Giao cho: Ngọc - 11443 · Người giao: QL Sơn');
  // Việc từ Google Sheet sửa trong file, không có nút sửa trong app
  await expect(row.getByRole('button', { name: /^Sửa/ })).toHaveCount(0);

  // Checklist từ file thành mẫu checklist trong app
  await win.getByRole('button', { name: 'Checklist', exact: true }).click();
  const template = win.getByTestId('mau-checklist').filter({ hasText: 'Kiểm hàng nhận' });
  await expect(template).toContainText('Google Sheet');
  await expect(template).toContainText('2 việc · Làm khi cần · Người làm: Ngọc - 11443');

  // Đến hạn: hai việc cùng hạn nên bật hai cửa sổ; cửa sổ của CV001 ghi người xử lý, người giao và mở được checklist gắn kèm
  await jumpTo(win, deadline + 5_000);
  await expect.poll(() => app.windows().filter(page => page !== win && !page.isClosed()).length).toBe(2);
  const popups = app.windows().filter(page => page !== win && !page.isClosed());
  for (const page of popups) await page.waitForSelector('[data-testid="cua-so-nhac"]');
  const texts = await Promise.all(popups.map(page => page.getByTestId('cua-so-nhac').innerText()));
  popup = popups[texts.findIndex(text => text.includes('Kiểm lệnh chuyển hàng Online'))];
  const other = popups.find(page => page !== popup)!;
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('Giao cho: Ngọc - 11443 · Người giao: QL Sơn');
  await clickInPopup(other, /^30′$/);
  await clickInPopup(popup, 'Mở checklist liên kết');
  await expect(win.getByTestId('viec-checklist')).toHaveCount(2);
  await expect(win.getByText('Kiểm hàng nhận').first()).toBeVisible();
  await win.getByRole('button', { name: 'Quay lại' }).click();
  await win.evaluate(() => { (window as unknown as { __nhacViecOffset: number }).__nhacViecOffset = 0; });

  // Quản lý sửa tiêu đề CV001 và ghi Xong, huỷ CV002, giao thêm CV003, ghi sai hạn CV004
  writeSheet([
    ['CV001', 'Kiểm lệnh chuyển hàng Online (gấp)', 'Giao hàng tiết kiệm gấp', day, time, 'Ngọc - 11443', 'Khẩn', 'Đúng hạn', '', 'Đọc chữ', '', 'Kiểm hàng nhận', 'Xong', 'QL Sơn'],
    ['CV002', 'Dọn kho phụ kiện', '', day, time, '', '', '', '', '', '', '', 'Huỷ', 'QL Sơn'],
    ['CV003', 'Chụp ảnh kệ trưng bày', '', day, time, 'Linh', '', '', '', '', '', '', '', 'QL Sơn'],
    ['CV004', 'Việc ghi sai hạn', '', 'mai', '', '', '', '', '', '', '', '', '', ''],
  ], checklists);
  await win.getByRole('button', { name: 'Cài đặt' }).click();
  popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Đồng bộ ngay' }).click());
  await expect(popup.getByRole('heading', { name: 'Có 1 công việc mới' })).toBeVisible();
  await expect(popup.getByTestId('cua-so-nhac')).toContainText('Chụp ảnh kệ trưng bày');
  await clickInPopup(popup, 'Đóng');
  await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('2 công việc đang giao');
  await expect(settings).toContainText('Trang Nhắc việc, dòng 5: Hạn "mai" không đúng dạng');
  await win.keyboard.press('Escape');
  await win.getByRole('button', { name: 'Nhắc việc', exact: true }).last().click();
  await win.getByRole('group', { name: 'Lọc nhắc việc' }).getByRole('button', { name: /^Chưa xong/ }).click();
  await expect(win.getByText('Dọn kho phụ kiện')).toHaveCount(0);
  await win.getByRole('group', { name: 'Lọc nhắc việc' }).getByRole('button', { name: /^Đã xong/ }).click();
  // Quản lý ghi Xong trong file thì app đánh dấu xong, tiêu đề theo file
  await expect(win.getByTestId('nhac-viec-dong').filter({ hasText: 'Kiểm lệnh chuyển hàng Online (gấp)' })).toContainText('Đã xong');

  // Ngắt kết nối: bỏ các việc và checklist nhận từ file
  await win.getByRole('button', { name: 'Cài đặt' }).click();
  await settings.getByRole('button', { name: 'Ngắt kết nối' }).click();
  await expect(settings.getByRole('button', { name: 'Tạo file nhắc việc' })).toBeVisible();
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('nhac-viec-dong')).toHaveCount(0);
  await win.getByRole('button', { name: 'Checklist', exact: true }).click();
  await expect(win.getByTestId('mau-checklist')).toHaveCount(0);
  await s.close();
});

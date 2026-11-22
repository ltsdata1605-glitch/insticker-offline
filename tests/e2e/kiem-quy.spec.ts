import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { downloadedFiles, newDirs, openApp, waitForDownloads } from './helpers';

const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });
const sheets = (win: Page, denomination: string) => win.getByLabel(`Số tờ ${denomination}`, { exact: true });


test('Kiểm quỹ: nhập số tờ theo mệnh giá, tiền khác, đối chiếu sổ; tắt app giữa chừng vẫn còn; đặt tên, lưu lịch sử, sao chép, xuất ảnh, mở lại để sửa, xoá', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;
  await rail(win).getByRole('button', { name: 'Kiểm quỹ' }).click();
  await expect(win.getByRole('heading', { level: 1 })).toHaveText('Kiểm quỹ');
  await expect(win.getByTestId('dong-menh-gia')).toHaveCount(10);

  // Gõ số tờ, Enter sang mệnh giá kế tiếp
  await sheets(win, '500.000').fill('3');
  await sheets(win, '500.000').press('Enter');
  await expect(sheets(win, '200.000')).toBeFocused();
  await win.keyboard.type('2');
  await sheets(win, '10.000').fill('4');
  await win.getByRole('button', { name: 'Thêm một tờ 10.000' }).click();
  await sheets(win, '500').fill('4');
  await win.getByLabel('Tiền khác').fill('1200');
  await expect(win.getByLabel('Tiền khác')).toHaveValue('1.200');
  await expect(win.getByTestId('tong-thuc-te')).toContainText('1.953.200');
  await expect(win.getByTestId('bang-chu')).toHaveText('Một triệu chín trăm năm mươi ba nghìn hai trăm đồng');
  await win.getByLabel('Số tiền theo sổ').fill('2.000.000');
  await expect(win.getByTestId('chenh-lech')).toHaveText('Thiếu 46.800');
  await expect(win.getByTestId('tinh-trang-kiem-quy')).toHaveText('Chưa lưu · tắt app vẫn giữ');

  // Tắt app khi chưa lưu: mở lại vẫn còn đủ số đã nhập
  await win.waitForTimeout(400);
  await s.close();
  s = await openApp(dirs);
  win = s.win;
  // Mở lại app thì vào Nhắc việc; chuyển sang Kiểm quỹ
  await rail(win).getByRole('button', { name: 'Kiểm quỹ' }).click();
  await expect(win.getByRole('heading', { level: 1 })).toHaveText('Kiểm quỹ');
  await expect(sheets(win, '500.000')).toHaveValue('3');
  await expect(sheets(win, '10.000')).toHaveValue('5');
  await expect(win.getByTestId('tong-thuc-te')).toContainText('1.953.200');
  await expect(win.getByTestId('chenh-lech')).toHaveText('Thiếu 46.800');

  // Phải có tên mới lưu được
  await win.getByRole('button', { name: 'Lưu vào lịch sử' }).click();
  await expect(win.getByText('Nhập tên lần kiểm trước khi lưu')).toBeVisible();
  await expect(win.getByLabel('Tên lần kiểm')).toBeFocused();
  await win.getByLabel('Tên lần kiểm').fill('Ca tối - Ngọc');
  await win.getByLabel('Ghi chú kiểm quỹ').fill('Thiếu do thối nhầm');
  await win.getByRole('button', { name: 'Lưu vào lịch sử' }).click();
  await expect(win.getByText('Đã lưu "Ca tối - Ngọc" vào lịch sử')).toBeVisible();
  // Lưu xong là lần kiểm mới trống
  await expect(win.getByTestId('tong-thuc-te')).toContainText('0');
  await expect(win.getByTestId('tinh-trang-kiem-quy')).toHaveText('Lần kiểm mới');
  const entry = win.getByTestId('lich-su-kiem-quy');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Ca tối - Ngọc');
  await expect(entry).toContainText('1.953.200');
  await expect(entry).toContainText('Thiếu 46.800');

  // Lịch sử còn sau khi mở lại app
  await win.waitForTimeout(400);
  await s.close();
  s = await openApp(dirs);
  win = s.win;
  await rail(win).getByRole('button', { name: 'Kiểm quỹ' }).click();
  await expect(win.getByTestId('lich-su-kiem-quy')).toHaveCount(1);

  // Xem lần đã lưu: sao chép để gửi, xuất ảnh
  await win.getByTestId('lich-su-kiem-quy').click();
  const dialog = win.getByRole('dialog', { name: 'Lần kiểm quỹ đã lưu' });
  await expect(dialog).toContainText('Bằng chữ: Một triệu chín trăm năm mươi ba nghìn hai trăm đồng');
  await dialog.getByRole('button', { name: 'Sao chép để gửi' }).click();
  const copied = await s.app.evaluate(async ({ clipboard }) => {
    const read = async () => String(await clipboard.readText());
    for (let i = 0; i < 20 && !(await read()).includes('KIỂM QUỸ'); i++) await new Promise(r => setTimeout(r, 100));
    return read();
  });
  expect(copied).toContain('KIỂM QUỸ: Ca tối - Ngọc');
  expect(copied).toContain('500.000 x 3 tờ = 1.500.000');
  expect(copied).toContain('10.000 x 5 tờ = 50.000');
  expect(copied).toContain('Tổng thực tế: 1.953.200 đ (14 tờ)');
  expect(copied).toContain('Chênh lệch: Thiếu 46.800');
  expect(copied).toContain('Ghi chú: Thiếu do thối nhầm');
  await dialog.getByRole('button', { name: 'Xuất ảnh' }).click();
  await waitForDownloads(s, 1);
  expect(downloadedFiles(s.dirs).some(name => /^Kiem_quy_Ca_toi_Ngoc_\d{4}-\d{2}-\d{2}_\d{4}\.png$/.test(name))).toBe(true);

  // Mở lại để sửa: đếm lại thì lưu đè đúng lần đó, không thêm dòng mới
  await dialog.getByRole('button', { name: 'Mở lại để sửa' }).click();
  await expect(sheets(win, '500.000')).toHaveValue('3');
  await expect(win.getByTestId('tinh-trang-kiem-quy')).toContainText('Đã lưu');
  await win.getByRole('button', { name: 'Thêm một tờ 20.000' }).click();
  await win.getByRole('button', { name: 'Thêm một tờ 20.000' }).click();
  await win.getByLabel('Tiền khác').fill('8.000');
  await expect(win.getByTestId('chenh-lech')).toHaveText('Khớp sổ');
  await expect(win.getByTestId('tinh-trang-kiem-quy')).toHaveText('Đang sửa lần đã lưu, chưa lưu lại');
  await win.getByRole('button', { name: 'Lưu lại thay đổi' }).click();
  await expect(win.getByText('Đã cập nhật "Ca tối - Ngọc"')).toBeVisible();
  await expect(win.getByTestId('lich-su-kiem-quy')).toHaveCount(1);
  await expect(win.getByTestId('lich-su-kiem-quy')).toContainText('2.000.000');
  await expect(win.getByTestId('lich-su-kiem-quy')).toContainText('Khớp sổ');

  // Đang nhập dở mà làm lần mới thì hỏi trước
  await sheets(win, '1.000').fill('7');
  await win.getByRole('button', { name: 'Làm lần kiểm mới' }).click();
  await win.getByRole('button', { name: 'Làm lần mới' }).click();
  await expect(sheets(win, '1.000')).toHaveValue('');

  // Xoá khỏi lịch sử
  await win.getByTestId('lich-su-kiem-quy').click();
  await dialog.getByRole('button', { name: 'Xoá', exact: true }).click();
  await win.getByRole('button', { name: 'Xoá', exact: true }).last().click();
  await expect(win.getByTestId('lich-su-kiem-quy')).toHaveCount(0);
  await expect(win.getByText('Chưa có lần kiểm nào được lưu.')).toBeVisible();
  await s.close();
});

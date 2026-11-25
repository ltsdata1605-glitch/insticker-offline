import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { newDirs, openApp } from './helpers';
import { FakeBridge } from './cau-noi-gia';

const MINUTE = 60_000;
const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });
const pad = (n: number) => String(n).padStart(2, '0');
const dayText = (ms: number) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const timeText = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';

const nextPopup = async (app: ElectronApplication, trigger: () => Promise<unknown>): Promise<Page> => {
  const [popup] = await Promise.all([app.waitForEvent('window'), trigger()]);
  await popup.waitForSelector('[data-testid="cua-so-nhac"]');
  return popup;
};

const clickInPopup = async (popup: Page, name: string | RegExp) => {
  await popup.getByRole('button', { name }).click({ noWaitAfter: true }).catch(() => undefined);
  await expect.poll(() => popup.isClosed()).toBe(true);
};

const giveTask = (bridge: FakeBridge, id: string, title: string, deadline: number, extra: Record<string, string> = {}) =>
  bridge.setTask(id, { 'Tiêu đề': title, 'Ngày hạn': dayText(deadline), 'Giờ hạn': timeText(deadline), 'Trạng thái': 'Đang giao', 'Người giao': 'QL Sơn', ...extra });

/** Chọn bộ phận của máy trong Cài đặt (cần mật khẩu quản lý) */
const setDepartment = async (settings: ReturnType<Page['getByRole']>, name: string) => {
  await settings.getByRole('group', { name: 'Bộ phận của máy' }).getByRole('button', { name }).click();
  await settings.getByLabel('Mật khẩu quản lý').fill('12345');
  await settings.getByRole('button', { name: 'Đổi bộ phận' }).click();
  await expect(settings.getByRole('group', { name: 'Bộ phận của máy' }).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
};

test('Máy Kho: đổi bộ phận cần mật khẩu; script cũ thì nhắc cập nhật; chỉ nhận việc Kho và việc chung; Đã nhận, Xong kèm ảnh và ghi chú bắt buộc, Cần hỗ trợ ghi vào file; checklist tạo trong app lên file', async () => {
  const bridge = new FakeBridge();
  bridge.scriptVersion = 1;
  const deadline = Math.ceil((Date.now() + 3 * 3600_000) / MINUTE) * MINUTE;
  giveTask(bridge, 'CV001', 'Nhập hàng Samsung', deadline, { 'Bộ phận': 'Kho', 'Khi xong cần': 'Ảnh + ghi chú' });
  giveTask(bridge, 'CV002', 'Kết ca thu ngân', deadline, { 'Bộ phận': 'Thu ngân' });
  giveTask(bridge, 'CV003', 'Dọn kho phụ kiện', deadline);
  await bridge.listen();
  try {
    const s = await openApp(newDirs());
    const { win, app } = s;
    await rail(win).getByRole('button', { name: 'Nhắc việc' }).click();
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    const settings = win.getByRole('dialog', { name: 'Cài đặt nhắc việc' });

    // Đổi bộ phận của máy: sai mật khẩu thì không đổi
    await settings.getByRole('group', { name: 'Bộ phận của máy' }).getByRole('button', { name: 'Kho' }).click();
    await settings.getByLabel('Mật khẩu quản lý').fill('sai');
    await settings.getByRole('button', { name: 'Đổi bộ phận' }).click();
    await expect(settings.getByText('Mật khẩu không đúng.')).toBeVisible();
    await expect(win.getByTestId('bo-phan-may')).toHaveCount(0);
    await setDepartment(settings, 'Kho');
    await expect(win.getByTestId('bo-phan-may')).toHaveText('Máy: Kho');

    // Kết nối: chỉ báo việc Kho và việc chung, không báo việc Thu ngân
    await app.evaluate(({ clipboard }, link) => clipboard.writeText(link), bridge.link);
    const popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Dán link đã sao chép' }).click());
    await expect(popup.getByRole('heading', { name: 'Có 2 công việc mới' })).toBeVisible();
    await expect(popup.getByTestId('cua-so-nhac')).toContainText('Nhập hàng Samsung');
    await expect(popup.getByTestId('cua-so-nhac')).not.toContainText('Kết ca thu ngân');
    await clickInPopup(popup, 'Đóng');

    // Script trong file bản cũ: hướng dẫn cập nhật, sao chép sẵn script mới
    await expect(settings.getByTestId('cap-nhat-script')).toBeVisible();
    await settings.getByRole('button', { name: 'Sao chép script mới' }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toContain('const CN_PHIEN_BAN = 2;');
    await settings.getByLabel('Tên của bạn').fill('Linh');
    await settings.getByRole('button', { name: 'Lưu tên' }).click();
    bridge.scriptVersion = 2;
    await settings.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    await expect(settings.getByTestId('cap-nhat-script')).toHaveCount(0);
    await win.keyboard.press('Escape');

    await win.getByRole('button', { name: 'Nhắc việc', exact: true }).last().click();
    const rows = win.getByTestId('nhac-viec-dong');
    await expect(rows).toHaveCount(2);
    await expect(win.getByText('Kết ca thu ngân')).toHaveCount(0);
    const cv001 = rows.filter({ hasText: 'Nhập hàng Samsung' });
    await expect(cv001.getByTestId('bo-phan-viec')).toHaveText('Kho');
    await expect(cv001).toContainText('Khi xong cần ảnh + ghi chú');

    // Đã nhận: file ghi người nhận và giờ nhận
    await expect(cv001.getByTestId('da-nhan')).toHaveText('Chưa ai nhận');
    await cv001.getByRole('button', { name: 'Đã nhận Nhập hàng Samsung' }).click();
    await expect(cv001.getByTestId('da-nhan')).toContainText('Đã nhận: Linh');
    await expect(cv001.getByRole('button', { name: 'Đã nhận Nhập hàng Samsung' })).toHaveCount(0);
    await expect.poll(() => bridge.task('CV001')['Đã nhận']).toMatch(/^Linh · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

    // Xong: việc cần ảnh và ghi chú thì phải có đủ mới xong
    await cv001.getByRole('button', { name: 'Xong', exact: true }).click();
    const doneDialog = win.getByRole('dialog', { name: 'Hoàn tất việc' });
    await doneDialog.getByRole('button', { name: 'Xong', exact: true }).click();
    await expect(doneDialog.getByRole('alert')).toHaveText('Việc này cần ghi chú khi xong.');
    await doneDialog.getByLabel('Ghi chú khi xong').fill('Đã nhập 12 thùng');
    await doneDialog.getByRole('button', { name: 'Xong', exact: true }).click();
    await expect(doneDialog.getByRole('alert')).toContainText('Việc này cần ảnh khi xong');
    const photo = path.join(s.dirs.inputs, 'kho.png');
    fs.writeFileSync(photo, Buffer.from(PNG, 'base64'));
    await doneDialog.getByLabel('Chọn ảnh kèm theo').setInputFiles(photo);
    await expect(doneDialog.getByAltText('Ảnh 1')).toBeVisible();
    await doneDialog.getByRole('button', { name: 'Xong', exact: true }).click();
    await expect.poll(() => bridge.task('CV001')['Trạng thái']).toBe('Xong');
    expect(bridge.photos).toHaveLength(1);
    const doneRow = bridge.nhatKy.find(row => row[1] === 'CV001' && row[6] === 'Xong')!;
    expect([doneRow[4], doneRow[7], doneRow[9]]).toEqual(['Linh', 'Đã nhập 12 thùng', 'Kho']);
    expect(doneRow[8]).toMatch(/^https:\/\/drive\.google\.com\//);
    await win.getByRole('group', { name: 'Lọc nhắc việc' }).getByRole('button', { name: /^Đã xong/ }).click();
    await expect(rows.filter({ hasText: 'Nhập hàng Samsung' }).getByTestId('nguoi-xong')).toContainText('Xong: Linh');
    await expect(rows.filter({ hasText: 'Nhập hàng Samsung' }).getByTestId('nguoi-xong')).toContainText('Đã nhập 12 thùng · 1 ảnh');
    await win.getByRole('group', { name: 'Lọc nhắc việc' }).getByRole('button', { name: /^Chưa xong/ }).click();

    // Cần hỗ trợ: phải ghi lý do; file ghi người, giờ, lý do
    const cv003 = rows.filter({ hasText: 'Dọn kho phụ kiện' });
    await cv003.getByRole('button', { name: 'Cần hỗ trợ: Dọn kho phụ kiện' }).click();
    const helpDialog = win.getByRole('dialog', { name: 'Cần hỗ trợ' });
    await helpDialog.getByRole('button', { name: 'Gửi quản lý' }).click();
    await expect(helpDialog.getByRole('alert')).toHaveText('Ghi lý do cần hỗ trợ để quản lý biết.');
    await helpDialog.getByLabel('Lý do cần hỗ trợ').fill('Thiếu thùng carton');
    await helpDialog.getByRole('button', { name: 'Gửi quản lý' }).click();
    await expect(cv003.getByTestId('can-ho-tro')).toContainText('Linh');
    await expect(cv003.getByTestId('can-ho-tro')).toContainText('Thiếu thùng carton');
    await expect.poll(() => bridge.task('CV003')['Cần hỗ trợ']).toMatch(/^Linh · .+: Thiếu thùng carton$/);

    // Checklist tạo trong app: mặc định bộ phận của máy, ghi lên trang Checklist; đọc về vẫn một mẫu
    await win.getByRole('button', { name: 'Checklist', exact: true }).click();
    await win.getByRole('button', { name: 'Tạo mẫu checklist' }).click();
    const form = win.getByRole('dialog', { name: 'Tạo mẫu checklist' });
    await form.getByLabel('Tên checklist').fill('Mở kho');
    await form.getByLabel('Việc 1', { exact: true }).fill('Mở cửa kho');
    await form.getByLabel('Việc 2', { exact: true }).fill('Kiểm nhiệt độ');
    await expect(form.getByRole('group', { name: 'Bộ phận làm checklist' }).getByRole('button', { name: 'Kho' })).toHaveAttribute('aria-pressed', 'true');
    await form.getByRole('button', { name: 'Tạo mẫu' }).click();
    await expect.poll(() => bridge.checklist.filter(row => row[0] === 'Mở kho').map(row => row[1])).toEqual(['Mở cửa kho', 'Kiểm nhiệt độ']);
    expect(bridge.checklist.find(row => row[0] === 'Mở kho')![11]).toBe('Kho');
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    await settings.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('1 checklist');
    await win.keyboard.press('Escape');
    await expect(win.getByTestId('mau-checklist')).toHaveCount(1);
    await expect(win.getByTestId('mau-checklist')).toContainText('Google Sheet');

    // Cửa sổ nhắc 15 phút trước hạn có nút Đã nhận và Cần hỗ trợ
    const reminderPopup = await nextPopup(app, () => win.evaluate(at => {
      const w = window as unknown as { __nhacViecOffset: number; __nhacViecTick: () => void };
      w.__nhacViecOffset = at - Date.now();
      w.__nhacViecTick();
    }, deadline - 15 * MINUTE + 1000));
    await expect(reminderPopup.getByRole('heading', { name: 'Dọn kho phụ kiện' })).toBeVisible();
    await expect(reminderPopup.getByRole('button', { name: 'Cần hỗ trợ' })).toBeVisible();
    await clickInPopup(reminderPopup, 'Đã nhận');
    await expect.poll(() => bridge.task('CV003')['Đã nhận']).toMatch(/^Linh · /);
    await win.evaluate(() => { (window as unknown as { __nhacViecOffset: number }).__nhacViecOffset = 0; });
    await s.close();
  } finally {
    await bridge.close();
  }
});

test('Máy Quản lý: thấy việc mọi bộ phận, lọc theo bộ phận; được báo khi nhân viên cần hỗ trợ và khi việc của bộ phận khác quá hạn 15 phút; thống kê theo người', async () => {
  const bridge = new FakeBridge();
  const deadline = Math.ceil((Date.now() + 60 * MINUTE) / MINUTE) * MINUTE;
  giveTask(bridge, 'CV001', 'Nhập hàng Oppo', deadline, { 'Bộ phận': 'Kho' });
  giveTask(bridge, 'CV002', 'Kết ca chiều', deadline, { 'Bộ phận': 'Thu ngân', 'Người xử lý': 'Minh' });
  giveTask(bridge, 'CV003', 'Duyệt đơn đổi trả', deadline + 24 * 60 * MINUTE, { 'Bộ phận': 'Quản lý' });
  await bridge.listen();
  try {
    const s = await openApp(newDirs());
    const { win, app } = s;
    await rail(win).getByRole('button', { name: 'Nhắc việc' }).click();
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    const settings = win.getByRole('dialog', { name: 'Cài đặt nhắc việc' });
    await setDepartment(settings, 'Quản lý');

    // Việc mới: máy quản lý chỉ được báo việc của Quản lý
    await app.evaluate(({ clipboard }, link) => clipboard.writeText(link), bridge.link);
    let popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Dán link đã sao chép' }).click());
    await expect(popup.getByRole('heading', { name: 'Có 1 công việc mới' })).toBeVisible();
    await expect(popup.getByTestId('cua-so-nhac')).toContainText('Duyệt đơn đổi trả');
    await clickInPopup(popup, 'Đóng');
    await settings.getByLabel('Tên của bạn').fill('QL Sơn');
    await settings.getByRole('button', { name: 'Lưu tên' }).click();

    // Máy khác: Minh nhận việc, Linh ở kho bấm Cần hỗ trợ; đồng bộ thì máy quản lý được báo
    bridge.apply([{ op: 'ack', ref: 'may-thu-ngan', id: 'CV002', occ: deadline, at: Date.now() }], 'Minh');
    bridge.apply([{ op: 'help', ref: 'may-kho', id: 'CV001', occ: deadline, at: Date.now(), note: 'Xe hàng chưa tới' }], 'Linh');
    popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Đồng bộ ngay' }).click());
    await expect(popup.getByRole('heading', { name: 'Cần hỗ trợ: Nhập hàng Oppo' })).toBeVisible();
    await expect(popup.getByTestId('cua-so-nhac')).toContainText('Linh: Xe hàng chưa tới');
    await clickInPopup(popup, 'Đóng');
    await win.keyboard.press('Escape');

    // Thấy việc mọi bộ phận, lọc theo bộ phận; việc bộ phận khác chỉ xem ai đã nhận, không có nút Đã nhận
    await win.getByRole('button', { name: 'Nhắc việc', exact: true }).last().click();
    const rows = win.getByTestId('nhac-viec-dong');
    await expect(rows).toHaveCount(3);
    await win.getByLabel('Lọc theo bộ phận').selectOption('Kho');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByTestId('can-ho-tro')).toContainText('Linh');
    await expect(rows.first().getByTestId('can-ho-tro')).toContainText('Xe hàng chưa tới');
    await win.getByLabel('Lọc theo bộ phận').selectOption('');
    const cv002 = rows.filter({ hasText: 'Kết ca chiều' });
    await expect(cv002.getByTestId('da-nhan')).toContainText('Đã nhận: Minh');
    await expect(rows.filter({ hasText: 'Nhập hàng Oppo' }).getByRole('button', { name: /^Đã nhận/ })).toHaveCount(0);

    // 20 phút sau hạn chưa ai xong: đồng bộ xong thì báo một bảng gộp các việc quá hạn của bộ phận khác
    popup = await nextPopup(app, async () => {
      await win.evaluate(at => { (window as unknown as { __nhacViecOffset: number }).__nhacViecOffset = at - Date.now(); }, deadline + 20 * MINUTE);
      await win.getByRole('button', { name: 'Cài đặt' }).click();
      await settings.getByRole('button', { name: 'Đồng bộ ngay' }).click();
      await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('3 công việc đang giao');
      await win.evaluate(() => (window as unknown as { __nhacViecTick: () => void }).__nhacViecTick());
    });
    await expect(popup.getByRole('heading', { name: '2 việc quá hạn chưa xong' })).toBeVisible();
    const card = popup.getByTestId('cua-so-nhac');
    await expect(card).toContainText('Nhập hàng Oppo');
    await expect(card).toContainText('Kho · Chưa ai bấm Đã nhận');
    await expect(card).toContainText('Thu ngân · Giao cho Minh · Đã nhận: Minh');
    await expect(card).not.toContainText('Duyệt đơn đổi trả');
    await clickInPopup(popup, 'Đóng');
    await win.keyboard.press('Escape');

    // Thống kê theo người
    await win.getByRole('button', { name: 'Thống kê' }).click();
    const people = win.getByTestId('thong-ke-nguoi');
    await expect(people.filter({ hasText: 'Minh' })).toContainText(/Minh\s*1\s*1\s*0\s*0\s*1\s*0/);
    await expect(people.filter({ hasText: 'Bộ phận Kho' })).toContainText(/Bộ phận Kho\s*1\s*0\s*0\s*0\s*1\s*1/);
    await win.evaluate(() => { (window as unknown as { __nhacViecOffset: number }).__nhacViecOffset = 0; });
    await s.close();
  } finally {
    await bridge.close();
  }
});

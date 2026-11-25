import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { newDirs, openApp } from './helpers';
import { FakeBridge } from './cau-noi-gia';

const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });
const openNhacViec = (win: Page) => rail(win).getByRole('button', { name: 'Nhắc việc' }).click();
const pad = (n: number) => String(n).padStart(2, '0');
const dayText = (ms: number) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const timeText = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const nextPopup = async (app: ElectronApplication, trigger: () => Promise<unknown>): Promise<Page> => {
  const [popup] = await Promise.all([app.waitForEvent('window'), trigger()]);
  await popup.waitForSelector('[data-testid="cua-so-nhac"]');
  return popup;
};

const clickInPopup = async (popup: Page, name: string | RegExp) => {
  await popup.getByRole('button', { name }).click({ noWaitAfter: true }).catch(() => undefined);
  await expect.poll(() => popup.isClosed()).toBe(true);
};

test('Đồng bộ hai chiều với Google Sheet: dán Link kết nối, đưa việc trên máy lên file, tạo, sửa, xoá, bấm xong ghi vào file, nhận thay đổi của quản lý và máy khác, mất mạng giữ lại rồi gửi, báo cáo checklist, đổi mã', async () => {
  const bridge = new FakeBridge();
  const deadline = Math.ceil((Date.now() + 3 * 3600_000) / 60_000) * 60_000;
  bridge.setTask('CV001', {
    'Tiêu đề': 'Kiểm lệnh chuyển hàng Online', 'Ngày hạn': dayText(deadline), 'Giờ hạn': timeText(deadline), 'Người xử lý': 'Ngọc - 11443',
    'Mức độ': 'Khẩn', 'Lặp lại': 'Mỗi ngày', 'Trạng thái': 'Đang giao', 'Người giao': 'QL Sơn',
  });
  bridge.checklist.push(
    ['Mở ca', 'Bật đèn', '', 'TRUE', 'FALSE', 'FALSE', 'Không theo lịch', '', '', '', 'Đang dùng'],
    ['Mở ca', 'Đếm quỹ', '', 'TRUE', 'FALSE', 'FALSE', '', '', '', '', ''],
  );
  await bridge.listen();
  try {
    const s = await openApp(newDirs());
    const { win, app } = s;
    await openNhacViec(win);

    // Việc tạo trên máy khi chưa kết nối: chỉ ở máy này
    await win.getByRole('button', { name: 'Tạo nhắc việc' }).first().click();
    const localForm = win.getByRole('dialog', { name: 'Tạo nhắc việc' });
    await localForm.getByLabel('Tiêu đề công việc').fill('Gọi khách đặt cọc');
    await expect(localForm.getByText('Việc trên Google Sheet')).toHaveCount(0);
    await localForm.getByRole('button', { name: 'Tạo nhắc việc' }).click();

    // Quản lý gửi Link kết nối: sao chép rồi bấm một nút là kết nối, nhận việc trong file; việc tạo trên máy trước đó tự lên file
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    const settings = win.getByRole('dialog', { name: 'Cài đặt nhắc việc' });
    await app.evaluate(({ clipboard }, link) => clipboard.writeText(link), bridge.link);
    let popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Dán link đã sao chép' }).click());
    await expect(popup.getByRole('heading', { name: 'Có 1 công việc mới' })).toBeVisible();
    await clickInPopup(popup, 'Đóng');
    await expect(settings.getByText('Đồng bộ hai chiều', { exact: true })).toBeVisible();
    await expect(settings).toContainText('Nhắc việc cửa hàng');
    await expect.poll(() => bridge.taskByTitle('Gọi khách đặt cọc')?.['Mã việc']).toBe('CV002');
    await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('2 công việc đang giao, 1 checklist');
    await expect(settings.getByRole('button', { name: /^Đưa \d+ việc/ })).toHaveCount(0);

    // Đặt tên của mình: ghi vào cột Người giao, Người xong
    await settings.getByLabel('Tên của bạn').fill('Ngọc - 11443');
    await settings.getByRole('button', { name: 'Lưu tên' }).click();
    await win.keyboard.press('Escape');

    // Việc từ file sửa được ngay trong app
    await win.getByRole('button', { name: 'Nhắc việc', exact: true }).last().click();
    const cv001 = win.getByTestId('nhac-viec-dong').filter({ hasText: 'Kiểm lệnh chuyển hàng Online' });
    await expect(cv001.getByRole('button', { name: 'Sửa Kiểm lệnh chuyển hàng Online' })).toBeVisible();
    await expect(win.getByTestId('nhac-viec-dong').filter({ hasText: 'Gọi khách đặt cọc' })).toContainText('Google Sheet · CV002');

    // Tạo việc trong app: mặc định lên file, kèm người xử lý; file ghi đúng chữ của danh sách chọn
    await win.getByRole('button', { name: 'Tạo nhắc việc' }).first().click();
    const newForm = win.getByRole('dialog', { name: 'Tạo nhắc việc' });
    await newForm.getByLabel('Tiêu đề công việc').fill('Trả hàng lỗi cho NCC');
    await expect(newForm).toContainText('Việc trên Google Sheet');
    await newForm.getByLabel('Người xử lý').fill('Linh');
    await newForm.getByRole('group', { name: 'Mức độ' }).getByRole('button', { name: 'Khẩn' }).click();
    const dateValue = await newForm.getByLabel('Ngày hạn').inputValue();
    const timeValue = await newForm.getByLabel('Giờ hạn').inputValue();
    await newForm.getByRole('button', { name: 'Tạo nhắc việc' }).click();
    await expect.poll(() => bridge.taskByTitle('Trả hàng lỗi cho NCC')?.['Mã việc']).toBe('CV003');
    expect(bridge.task('CV003')).toMatchObject({
      'Người xử lý': 'Linh', 'Mức độ': 'Khẩn', 'Ngày hạn': dateValue.split('-').reverse().join('/'), 'Giờ hạn': timeValue,
      'Nhắc trước': '15 phút + đúng hạn', 'Lặp lại': 'Không lặp', 'Âm thanh': 'Chuông reo', 'Trạng thái': 'Đang giao', 'Người giao': 'Ngọc - 11443',
    });
    const cv003 = win.getByTestId('nhac-viec-dong').filter({ hasText: 'Trả hàng lỗi cho NCC' });
    await expect(cv003).toContainText('Google Sheet · CV003');
    await expect(cv003).toContainText('Giao cho: Linh · Người giao: Ngọc - 11443');

    // Bấm Xong việc lặp lại mỗi ngày: file ghi người xong, Nhật ký ghi lần này, việc vẫn Đang giao cho các ngày sau
    await cv001.getByRole('button', { name: 'Xong', exact: true }).click();
    await expect.poll(() => bridge.task('CV001')['Người xong']).toBe('Ngọc - 11443');
    expect(bridge.task('CV001')['Trạng thái']).toBe('Đang giao');
    expect(bridge.nhatKy.map(row => [row[1], row[4], row[5]])).toEqual([['CV001', 'Ngọc - 11443', String(deadline)]]);

    // Sửa trong app: file cập nhật
    await cv003.getByRole('button', { name: 'Sửa Trả hàng lỗi cho NCC' }).click();
    const editForm = win.getByRole('dialog', { name: 'Sửa nhắc việc' });
    await expect(editForm).toContainText('Việc trên Google Sheet');
    await editForm.getByLabel('Tiêu đề công việc').fill('Trả hàng lỗi Samsung');
    await editForm.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect.poll(() => bridge.task('CV003')['Tiêu đề']).toBe('Trả hàng lỗi Samsung');
    expect(bridge.task('CV003')['Người xử lý']).toBe('Linh');

    // Xoá trong app: file ghi Huỷ, không mất dòng
    await win.getByTestId('nhac-viec-dong').filter({ hasText: 'Trả hàng lỗi Samsung' }).getByRole('button', { name: 'Sửa Trả hàng lỗi Samsung' }).click();
    await win.getByRole('dialog', { name: 'Sửa nhắc việc' }).getByRole('button', { name: 'Xoá' }).click();
    await expect.poll(() => bridge.task('CV003')['Trạng thái']).toBe('Huỷ');
    await expect(win.getByText('Trả hàng lỗi Samsung')).toHaveCount(0);

    // Quản lý sửa trong file, giao thêm việc mà máy khác đã bấm xong: Đồng bộ ngay thì máy này nhận cả hai
    bridge.setTask('CV002', { 'Tiêu đề': 'Gọi khách đặt cọc (gấp)' });
    bridge.setTask('CV004', { 'Tiêu đề': 'Chụp ảnh kệ trưng bày', 'Ngày hạn': dayText(deadline), 'Giờ hạn': timeText(deadline), 'Lặp lại': 'Mỗi ngày', 'Người xử lý': 'Linh' });
    bridge.apply([{ op: 'done', ref: 'may-khac', id: 'CV004', occ: deadline, at: Date.now(), repeat: true }], 'Linh');
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    popup = await nextPopup(app, () => settings.getByRole('button', { name: 'Đồng bộ ngay' }).click());
    await expect(popup.getByRole('heading', { name: 'Có 1 công việc mới' })).toBeVisible();
    // Bảng việc mới có nút Đã nhận: file ghi người nhận
    await clickInPopup(popup, 'Đã nhận');
    await expect.poll(() => bridge.task('CV004')['Đã nhận']).toMatch(/^Ngọc - 11443 · /);
    await win.keyboard.press('Escape');
    const cv002 = win.getByTestId('nhac-viec-dong').filter({ hasText: 'Gọi khách đặt cọc (gấp)' });
    await expect(cv002).toBeVisible();
    const filters = win.getByRole('group', { name: 'Lọc nhắc việc' });
    await filters.getByRole('button', { name: /^Đã xong/ }).click();
    await expect(win.getByTestId('nhac-viec-dong').filter({ hasText: 'Chụp ảnh kệ trưng bày' })).toContainText('Đã xong');
    await filters.getByRole('button', { name: /^Chưa xong/ }).click();

    // Mất mạng: thay đổi giữ lại trong hàng chờ, có mạng thì gửi
    bridge.down = true;
    await cv002.getByRole('button', { name: 'Sửa Gọi khách đặt cọc (gấp)' }).click();
    await win.getByRole('dialog', { name: 'Sửa nhắc việc' }).getByLabel('Nội dung công việc').fill('Khách hẹn 16 giờ');
    await win.getByRole('dialog', { name: 'Sửa nhắc việc' }).getByRole('button', { name: 'Lưu', exact: true }).click();
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('Còn 1 thay đổi chưa gửi');
    await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('Không có mạng');
    bridge.down = false;
    await settings.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    await expect.poll(() => bridge.task('CV002')['Nội dung']).toBe('Khách hẹn 16 giờ');
    await expect(settings.getByTestId('tinh-trang-sheet')).not.toContainText('chưa gửi');
    await win.keyboard.press('Escape');

    // Hoàn tất checklist: file có dòng báo cáo ở trang Báo cáo checklist
    await win.getByRole('button', { name: 'Checklist', exact: true }).click();
    await win.getByTestId('mau-checklist').filter({ hasText: 'Mở ca' }).getByRole('button', { name: 'Bắt đầu' }).click();
    await win.getByTestId('viec-checklist').nth(0).getByRole('button', { name: 'Hoàn tất' }).click();
    await win.getByTestId('viec-checklist').nth(1).getByRole('button', { name: 'Hoàn tất' }).click();
    await win.getByRole('button', { name: 'Hoàn tất checklist' }).click();
    await expect.poll(() => bridge.baoCao.length).toBe(1);
    expect(bridge.baoCao[0].slice(1, 5)).toEqual(['Mở ca', dayText(Date.now()), 'Ngọc - 11443', '2/2 hoàn tất']);
    await win.getByRole('button', { name: 'Quay lại' }).click();

    // Quản lý đổi mã kết nối: máy báo cần link mới
    bridge.key = 'khoaMoiSauKhiDoiMa0123456789';
    await win.getByRole('button', { name: 'Cài đặt' }).click();
    await settings.getByRole('button', { name: 'Đồng bộ ngay' }).click();
    await expect(settings.getByTestId('tinh-trang-sheet')).toContainText('Link kết nối đã đổi mã');
    await win.keyboard.press('Escape');
    await s.close();
  } finally {
    await bridge.close();
  }
});

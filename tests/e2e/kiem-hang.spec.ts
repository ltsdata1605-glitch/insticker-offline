import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { downloadedFiles, newDirs, openApp, waitForDownloads, writeWorkbook, XLSX } from './helpers';
import type { Dirs } from './helpers';
import { HOA_DON_A, HOA_DON_B, detailRows, summaryRows } from '../unit/kiemHangMau';

const rail = (win: Page) => win.getByRole('navigation', { name: 'Chức năng' });
const openKiemHang = (win: Page) => rail(win).getByRole('button', { name: 'Kiểm hàng' }).click();
const scanBox = (win: Page) => win.getByLabel('Ô quét mã sản phẩm hoặc IMEI');
const result = (win: Page) => win.getByTestId('kiem-hang-ket-qua');
const kpi = (win: Page, id: string) => win.getByTestId(`kpi-${id}`);

const scan = async (win: Page, value: string) => {
  await scanBox(win).fill(value);
  await scanBox(win).press('Enter');
};

/** Bốn file của hai hoá đơn: file chi tiết đặt tên như app xuất, file phiếu có số hoá đơn. */
const writeSampleFiles = (dirs: Dirs): string[] => [
  writeWorkbook(dirs, '2000001(1).xlsx', detailRows(HOA_DON_A.transferId, HOA_DON_A.orderId, HOA_DON_A.items)),
  writeWorkbook(dirs, '2000002(1).xlsx', detailRows(HOA_DON_B.transferId, HOA_DON_B.orderId, HOA_DON_B.items)),
  writeWorkbook(dirs, '2000001.xlsx', summaryRows(HOA_DON_A.transferId, HOA_DON_A.invoiceNo)),
  writeWorkbook(dirs, '2000002.xlsx', summaryRows(HOA_DON_B.transferId, HOA_DON_B.invoiceNo)),
];

test('Kiểm hàng: nhập nhiều file, quét mã, IMEI, mã lạ, thừa, hoàn tác; còn sau khi mở lại; xuất Excel; kết thúc và mở lại từ lịch sử', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let win = s.win;

  // Thanh bên trái có hai chức năng, In sticker đang mở
  await expect(rail(win).getByRole('button', { name: 'In sticker' })).toHaveAttribute('aria-current', 'page');
  await openKiemHang(win);
  await expect(rail(win).getByRole('button', { name: 'Kiểm hàng' })).toHaveAttribute('aria-current', 'page');
  await expect(win.getByRole('heading', { name: 'Kiểm hàng nhận' })).toBeVisible();
  // Thanh trên không còn các tab của In sticker
  await expect(win.getByRole('button', { name: 'Giá Sốc' })).toHaveCount(0);

  await win.getByLabel('Chọn file Excel phiếu chuyển kho').setInputFiles([...writeSampleFiles(dirs), writeWorkbook(dirs, 'bang-gia.xlsx', [['Tên', 'Giá'], ['A', 1]])]);
  await expect(win.getByText('Đã nhập 2 hoá đơn: 6 dòng, 12 sản phẩm')).toBeVisible();
  await expect(win.getByText('bang-gia.xlsx: không phải file xuất từ phiếu chuyển kho', { exact: false })).toBeVisible();
  await expect(win.getByText('Chứng từ NB-THU-0001')).toBeVisible();
  await expect(win.getByRole('button', { name: /HĐ 2000001/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /HĐ 2000002/ })).toBeVisible();
  await expect(kpi(win, 'theo-file')).toHaveText('12');
  await expect(scanBox(win)).toBeFocused();

  // Mã có ở hai hoá đơn: đủ hoá đơn đầu rồi sang hoá đơn sau
  await scan(win, '0160010000745');
  await expect(result(win)).toHaveAttribute('data-kind', 'ok');
  await expect(result(win)).toContainText('1/3');
  await scan(win, '0160010000745');
  await scan(win, '0160010000745');
  await expect(result(win)).toContainText('3/3');
  await expect(kpi(win, 'da-kiem')).toHaveText('3');

  // Quét thêm: thừa, có tiếng và màu vàng
  await scan(win, '0160010000745');
  await expect(result(win)).toHaveAttribute('data-kind', 'over');
  await expect(kpi(win, 'thua')).toHaveText('1');

  // Hoàn tác bỏ đúng lần thừa
  await win.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(kpi(win, 'thua')).toHaveText('0');
  await expect(kpi(win, 'da-kiem')).toHaveText('3');

  // Hàng nhiều cái: gõ số lượng một lần
  await win.getByLabel('Số lượng mỗi lần quét').fill('4');
  await scan(win, '0162791000276');
  await expect(result(win)).toContainText('4/4');
  await expect(win.getByLabel('Số lượng mỗi lần quét')).toHaveValue('1');

  // Mã lạ: báo đỏ, ghi vào danh sách mã lạ, không cộng gì
  await scan(win, '8936012345678');
  await expect(result(win)).toHaveAttribute('data-kind', 'unknown');
  await expect(result(win)).toContainText('không có trong 2 hoá đơn');
  await expect(kpi(win, 'ma-la')).toHaveText('1');
  await expect(win.getByRole('region', { name: 'Mã lạ' })).toContainText('8936012345678');
  await expect(kpi(win, 'da-kiem')).toHaveText('7');

  // Sản phẩm có IMEI: quét mã thì chờ IMEI, IMEI sai báo đỏ, IMEI đúng thì nhận
  await scan(win, '0164779000261');
  await expect(result(win)).toHaveAttribute('data-kind', 'need-imei');
  await scan(win, 'XX-SAI-001');
  await expect(result(win)).toHaveAttribute('data-kind', 'imei-unknown');
  await scan(win, 'ik20gf-bk022997');
  await expect(result(win)).toHaveAttribute('data-kind', 'imei-ok');
  await expect(result(win)).toContainText('1/2');
  await scan(win, 'IK20GF-BK022997');
  await expect(result(win)).toHaveAttribute('data-kind', 'imei-dup');

  // Súng quét gõ như bàn phím: con trỏ đang ở chỗ khác vẫn vào ô quét
  await kpi(win, 'theo-file').click();
  await expect(scanBox(win)).not.toBeFocused();
  await win.keyboard.type('IK20GF-BK022998');
  await win.keyboard.press('Enter');
  await expect(result(win)).toHaveAttribute('data-kind', 'imei-ok');
  await expect(kpi(win, 'da-kiem')).toHaveText('9');
  await expect(kpi(win, 'con-thieu')).toHaveText('3');

  // Lọc: chỉ còn dòng chưa đủ (adapter thiếu 3)
  await win.getByRole('button', { name: /^Chưa đủ/ }).click();
  await expect(win.locator('tbody tr')).toHaveCount(1);
  await expect(win.locator('tbody tr')).toContainText('0160014000813');
  // Sửa tay số thực nhận
  await win.getByRole('group', { name: 'Thực nhận của 0160014000813' }).getByRole('button', { name: 'Tăng 1' }).click();
  await expect(kpi(win, 'con-thieu')).toHaveText('2');
  await win.getByRole('button', { name: /^Tất cả/ }).click();

  // Lọc theo nhóm hàng
  await win.getByLabel('Lọc theo nhóm hàng').selectOption('Loa di động');
  await expect(win.locator('tbody tr')).toHaveCount(2);
  await win.getByLabel('Lọc theo nhóm hàng').selectOption('');
  await expect(win.locator('tbody tr')).toHaveCount(6);

  // Thẻ hoá đơn hiện đủ kho chuyển và người chuyển
  await expect(win.getByRole('button', { name: /HĐ 2000001/ })).toContainText('Người chuyển 10001 - Nguyễn Văn Thử');
  await expect(win.getByRole('button', { name: /HĐ 2000001/ })).toContainText('Kho chuyển 20001 - KHO_THU - Kho tổng thử');

  // Báo cáo: theo MYC, nhóm thiếu, kho và người chuyển; sao chép thành tin nhắn
  await win.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  const report = win.getByRole('dialog', { name: 'Báo cáo kiểm hàng' });
  await expect(report.getByTestId('bao-cao-tom-tat')).toHaveText('1/2 MYC đủ hàng, thiếu 2 sản phẩm thuộc 1 nhóm, 2 mã không có trong phiếu. Đã nhận 10/12 sản phẩm.');
  await expect(report).toContainText('Người chuyển10001 - Nguyễn Văn Thử');
  await expect(report).toContainText('Kho nhận900 - CH_THU - Cửa hàng thử');
  await expect(report.getByRole('list', { name: 'Kết quả theo MYC' })).toContainText('MYC CO0000000001');
  await expect(report).toContainText('Thiếu 2 SP · 1 nhóm');
  await report.getByRole('button', { name: 'Sao chép để gửi' }).click();
  await expect(win.getByText('Đã sao chép báo cáo', { exact: false })).toBeVisible();
  const copied = await s.app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toContain('BÁO CÁO KIỂM HÀNG NHẬN');
  expect(copied).toContain('[CHƯA ĐỦ] MYC CO0000000001 (HĐ 2000001, phiếu SC0000000001)');
  expect(copied).toContain('0160014000813 Adapter sạc Thử 20W: thiếu 2 (nhận 1/3)');
  // Mặc định chỉ gửi MYC chưa đủ
  expect(copied).not.toContain('[ĐỦ]');
  await win.keyboard.press('Escape');

  // Đóng và mở lại app: vẫn kiểm tiếp được
  await s.close();
  s = await openApp(dirs);
  win = s.win;
  await expect(rail(win).getByRole('button', { name: 'Kiểm hàng' })).toHaveAttribute('aria-current', 'page');
  await expect(kpi(win, 'da-kiem')).toHaveText('10');
  await expect(kpi(win, 'ma-la')).toHaveText('2');

  // Xuất Excel: đủ các trang, mã giữ dạng chữ, có số thực nhận và chênh lệch
  await win.getByRole('button', { name: 'Xuất Excel' }).click();
  await waitForDownloads(s, 1);
  const [file] = downloadedFiles(dirs).filter(name => name.endsWith('.xlsx'));
  expect(file).toMatch(/^Kiem_hang_NB-THU-0001_\d{8}_\d{4}\.xlsx$/);
  const wb = XLSX.read(fs.readFileSync(path.join(dirs.downloads, file)));
  expect(wb.SheetNames).toEqual(['Báo cáo', 'Tổng hợp', 'Chi tiết', 'Thiếu thừa', 'Mã lạ', 'Nhật ký quét']);
  const detail = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Chi tiết'], { header: 1 });
  expect(detail[2].slice(0, 8)).toEqual(['2000001', '0160014000813', 'Adapter sạc Thử 20W', '', 3, 1, -2, 'Thiếu']);
  const summary = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Tổng hợp'], { header: 1 });
  expect(summary.at(-1)).toEqual(['Tổng', '', '', '', '', '', '', 12, 10, 2, 0, 'Thiếu 2']);

  // Sang In sticker rồi quay lại: thanh trên có lại các tab, phiên kiểm vẫn giữ nguyên
  await rail(win).getByRole('button', { name: 'In sticker' }).click();
  await expect(win.getByRole('button', { name: 'Giá Sốc' })).toBeVisible();
  // Màn Kiểm hàng vẫn giữ trong cây nhưng ẩn với người dùng và trình đọc màn hình
  await expect(win.getByRole('textbox', { name: 'Ô quét mã sản phẩm hoặc IMEI' })).toHaveCount(0);
  await openKiemHang(win);
  await expect(kpi(win, 'da-kiem')).toHaveText('10');

  // Kết thúc: hiện báo cáo, kết thúc và lưu thì về màn chọn file, phiên vào lịch sử; mở lại từ lịch sử
  await win.getByRole('button', { name: 'Kết thúc' }).click();
  await win.getByRole('dialog', { name: 'Báo cáo kiểm hàng' }).getByRole('button', { name: 'Kết thúc và lưu' }).click();
  await expect(win.getByRole('heading', { name: 'Kiểm hàng nhận' })).toBeVisible();
  await win.getByRole('button', { name: 'Lịch sử (1)' }).click();
  const history = win.getByRole('dialog', { name: 'Lịch sử kiểm hàng' });
  await expect(history).toContainText('Chứng từ NB-THU-0001');
  await expect(history).toContainText('10/12 sản phẩm');
  await expect(history).toContainText('Thiếu 2, 2 mã lạ');
  await history.getByRole('button', { name: 'Mở lại' }).click();
  await expect(kpi(win, 'da-kiem')).toHaveText('10');

  // Nhập lại file đã có: bỏ qua, không nhân đôi
  await win.getByLabel('Chọn file Excel phiếu chuyển kho').setInputFiles(writeSampleFiles(dirs).slice(0, 1));
  await expect(win.getByText('Bỏ qua 1 hoá đơn đã nhập trước đó: 2000001')).toBeVisible();
  await expect(kpi(win, 'theo-file')).toHaveText('12');
  expect(s.errors).toEqual([]);
  await s.close();
});

test('Tắt Kiểm hàng trong bảng bật tắt tab thì thanh bên trái ẩn; tắt hết tab In sticker thì chỉ còn Kiểm hàng', async () => {
  const s = await openApp();
  const { win } = s;
  // Cửa sổ nhỏ nhất (như máy Mac của CI): bảng bật tắt tab cao gần hết cửa sổ, nút Đóng không được bị thanh trên che
  await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 680));
  const openPanel = async () => {
    for (let i = 0; i < 7; i++) await win.getByTestId('app-logo').click();
    await win.getByRole('dialog', { name: 'Nhập mật khẩu' }).getByLabel('Mật khẩu').fill('12345');
    await win.getByRole('button', { name: 'Mở' }).click();
    return win.getByRole('dialog', { name: 'Bật tắt các tab' });
  };
  let panel = await openPanel();
  await panel.getByRole('switch', { name: 'Kiểm hàng' }).click();
  await panel.getByRole('button', { name: /Đóng/ }).first().click();
  await expect(rail(win)).toHaveCount(0);

  panel = await openPanel();
  await panel.getByRole('switch', { name: 'Kiểm hàng' }).click();
  for (const name of ['Giá Sốc', 'Giờ Vàng', 'Sticker', 'Phiếu']) await panel.getByRole('switch', { name }).click();
  await panel.getByRole('button', { name: /Đóng/ }).first().click();
  // Chỉ còn một chức năng thì không cần thanh bên trái, mở thẳng Kiểm hàng
  await expect(rail(win)).toHaveCount(0);
  await expect(win.getByRole('heading', { name: 'Kiểm hàng nhận' })).toBeVisible();
  await s.close();
});

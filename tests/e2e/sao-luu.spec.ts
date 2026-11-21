import { expect, test } from '@playwright/test';
import path from 'node:path';
import { chooseMode, chooseSubTab, downloadedFiles, newDirs, openApp, waitForDownloads, writeWorkbook } from './helpers';

test('Sao lưu ở máy này, khôi phục ở máy khác: đủ danh sách, bảng giá, cài đặt', async () => {
  const may1 = newDirs();
  let s = await openApp(may1);
  let win = s.win;
  await chooseMode(win, 'Giá Sốc');
  const file = writeWorkbook(may1, 'mau.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'A1', 'Quạt A', '5490000', '3490000', 'KM'],
    ['NỒI', 'A2', 'Nồi B', '1290000', '990000', 'KM'],
  ]);
  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(file);
  await expect(win.getByText('Số lượng: 2')).toBeVisible();
  await win.waitForTimeout(2500); // chờ app lưu trạng thái xuống máy (trễ 500 ms, chậm hơn khi máy bận)

  await win.getByRole('button', { name: 'Sao lưu và khôi phục dữ liệu' }).click();
  await win.getByRole('button', { name: 'Sao lưu ra file' }).click();
  await waitForDownloads(s, 1);
  const backup = path.join(may1.downloads, downloadedFiles(may1).find((f) => f.startsWith('tools-sao-luu-')) as string);
  await win.keyboard.press('Escape');
  await s.close();

  // Máy khác, dữ liệu trống
  const may2 = newDirs();
  s = await openApp(may2);
  win = s.win;
  await chooseMode(win, 'Giá Sốc');
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Danh sách in trống')).toBeVisible();

  // File sai bị từ chối
  await win.getByRole('button', { name: 'Sao lưu và khôi phục dữ liệu' }).click();
  await win.getByTestId('backup-file').setInputFiles(file);
  await expect(win.getByText(/không đọc được|không phải file sao lưu/)).toBeVisible();

  await win.getByTestId('backup-file').setInputFiles(backup);
  await expect(win.getByTestId('backup-confirm')).toContainText('thay toàn bộ dữ liệu');
  // App tự tải lại với dữ liệu từ file
  await Promise.all([win.waitForEvent('load'), win.getByRole('button', { name: 'Thay dữ liệu' }).click()]);
  await win.waitForSelector('#global-header-actions button', { timeout: 120_000 });
  await win.waitForTimeout(800);
  await chooseMode(win, 'Giá Sốc');
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Số lượng: 2')).toBeVisible();
  await s.close();
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseMode, newDirs, openApp } from './helpers';

/** Bấm 7 lần vào logo, nhập mật khẩu (mặc định 12345) để bật tắt các tab. Event mặc định tắt; luôn còn ít nhất một tab. */
const modeNames = async (win: Page) => (await win.locator('#global-header-actions').getByRole('button').allInnerTexts())
  .map((text) => text.trim())
  .filter((text) => ['Giá Sốc', 'Giờ Vàng', 'Sticker', 'Phiếu', 'Event'].includes(text));
const passwordDialog = (win: Page) => win.getByRole('dialog', { name: 'Nhập mật khẩu' });
const panel = (win: Page) => win.getByRole('dialog', { name: 'Bật tắt các tab' });
const clickLogo = async (win: Page, times: number) => {
  for (let i = 0; i < times; i++) await win.getByTestId('app-logo').click();
};
const unlock = async (win: Page, password: string) => {
  await clickLogo(win, 7);
  await passwordDialog(win).getByLabel('Mật khẩu').fill(password);
  await win.keyboard.press('Enter');
};
const tabSwitch = (win: Page, name: string) => panel(win).getByRole('switch', { name });

test('Event mặc định tắt; bấm 7 lần vào logo, nhập mật khẩu để bật tắt tab; tab đang mở bị tắt thì chuyển tab; còn ít nhất một tab; nhớ sau khi mở lại; đổi mật khẩu', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  expect(await modeNames(win)).toEqual(['Giá Sốc', 'Giờ Vàng', 'Sticker', 'Phiếu']);
  await chooseMode(win, 'Giá Sốc');

  // Bấm 6 lần, hay nghỉ lâu giữa chừng, thì chưa mở
  await clickLogo(win, 6);
  await expect(passwordDialog(win)).toHaveCount(0);
  await win.waitForTimeout(1700);
  await clickLogo(win, 3);
  await expect(passwordDialog(win)).toHaveCount(0);
  await win.waitForTimeout(1700);

  // Sai mật khẩu thì không mở, có nhắc không lấy lại được mật khẩu
  await unlock(win, '1111');
  await expect(passwordDialog(win).getByRole('alert')).toHaveText('Sai mật khẩu.');
  await expect(passwordDialog(win)).toContainText('không có cách lấy lại');
  await expect(panel(win)).toHaveCount(0);
  await passwordDialog(win).getByLabel('Mật khẩu').fill('12345');
  await win.keyboard.press('Enter');
  await expect(panel(win)).toBeVisible();
  await expect(tabSwitch(win, 'Event')).toHaveAttribute('aria-checked', 'false');

  // Tắt Giá Sốc khi đang mở Giá Sốc: chuyển sang Giờ Vàng
  await tabSwitch(win, 'Giá Sốc').click();
  await expect(tabSwitch(win, 'Giá Sốc')).toHaveAttribute('aria-checked', 'false');
  expect(await modeNames(win)).toEqual(['Giờ Vàng', 'Sticker', 'Phiếu']);
  await expect(win.locator('#print-section .sub-header')).toBeVisible();

  // Còn mỗi một tab thì không tắt được tab đó. Kiểm hàng và Nhắc việc cũng tính là tab nên tắt trước.
  await tabSwitch(win, 'Kiểm hàng').click();
  await tabSwitch(win, 'Nhắc việc').click();
  for (const name of ['Giờ Vàng', 'Sticker']) await tabSwitch(win, name).click();
  expect(await modeNames(win)).toEqual(['Phiếu']);
  await expect(tabSwitch(win, 'Phiếu')).toBeDisabled();

  // Bật Event rồi tắt Phiếu: chỉ còn Event
  await tabSwitch(win, 'Event').click();
  await expect(tabSwitch(win, 'Phiếu')).toBeEnabled();
  await tabSwitch(win, 'Phiếu').click();
  expect(await modeNames(win)).toEqual(['Event']);
  await expect(tabSwitch(win, 'Event')).toBeDisabled();
  await win.keyboard.press('Escape');
  await expect(panel(win)).toHaveCount(0);
  await expect(win.getByRole('heading', { name: /Hướng dẫn sử dụng Hệ thống In Sticker Event/ })).toBeVisible();

  // Mở lại app vẫn chỉ có Event
  await win.waitForTimeout(500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await expect.poll(() => modeNames(win)).toEqual(['Event']);

  // Đổi mật khẩu: nhập lại không khớp thì báo, khớp thì lưu
  await unlock(win, '12345');
  await panel(win).getByLabel('Mật khẩu mới', { exact: true }).fill('abcd');
  await panel(win).getByLabel('Nhập lại mật khẩu mới').fill('abce');
  await panel(win).getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(panel(win).getByRole('alert')).toHaveText('Hai lần nhập mật khẩu mới không giống nhau.');
  await panel(win).getByLabel('Nhập lại mật khẩu mới').fill('abcd');
  await panel(win).getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(win.getByText(/Đã đổi mật khẩu/)).toBeVisible();
  await win.keyboard.press('Escape');
  await win.waitForTimeout(1700);

  // Mật khẩu cũ không còn dùng được, mật khẩu mới thì được; bật lại Sticker
  await unlock(win, '12345');
  await expect(passwordDialog(win).getByRole('alert')).toHaveText('Sai mật khẩu.');
  await passwordDialog(win).getByLabel('Mật khẩu').fill('abcd');
  await win.keyboard.press('Enter');
  await tabSwitch(win, 'Sticker').click();
  await win.keyboard.press('Escape');
  expect(await modeNames(win)).toEqual(['Sticker', 'Event']);
  await chooseMode(win, 'Sticker');
  await expect(win.getByTestId('tag-preview')).toBeVisible();

  // Mở lại app: mật khẩu mới vẫn giữ
  await win.waitForTimeout(500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await expect.poll(() => modeNames(win)).toEqual(['Sticker', 'Event']);
  await unlock(win, 'abcd');
  await expect(panel(win)).toBeVisible();
  await s.close();
});

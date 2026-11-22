import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseMode, chooseStickersPerPage, chooseSubTab, closePreview, evalInPrintDoc, newDirs, openApp, printSummary, writeWorkbook } from './helpers';

/**
 * Tab Sticker: danh sách và cách nhập như Giá Sốc, nhưng khung xem trước là tem giá (kiểu có sẵn hoặc hiện đại, không có nền
 * Giá Sốc) và bấm in thì chọn kiểu tem và bố cục trang.
 */
const layoutDialog = (win: Page) => win.getByRole('dialog', { name: 'Chọn Kiểu & Bố Cục In' });
const pressPrint = (win: Page) => win.getByRole('button', { name: /Bấm để in/ }).first().click();
const tagPreview = (win: Page) => win.getByTestId('tag-preview');
// Tem xem trước nằm trong shadow DOM; bộ chọn CSS của Playwright đi xuyên qua được
const previewTags = (win: Page) => tagPreview(win).getByTestId('tag-render').locator('.price-tag');

test('Tab Sticker: đứng trước Phiếu, xem trước là tem giá theo kiểu chọn, sửa ở các ô, bấm in chọn bố cục; danh sách dùng chung với Giá Sốc', async () => {
  const s = await openApp();
  const { win } = s;
  const modes = await win.locator('#global-header-actions').getByRole('button').allInnerTexts();
  // Tab Event mặc định tắt
  expect(modes.map((text) => text.trim()).filter((text) => ['Giá Sốc', 'Giờ Vàng', 'Sticker', 'Phiếu', 'Event'].includes(text)))
    .toEqual(['Giá Sốc', 'Giờ Vàng', 'Sticker', 'Phiếu']);
  await chooseMode(win, 'Sticker');

  // Không còn sticker nền Giá Sốc, chỉ có tem giá
  await expect(tagPreview(win)).toBeVisible();
  await expect(win.locator('#print-section')).toHaveCount(0);
  await expect(previewTags(win)).toHaveCount(1);
  await expect(previewTags(win).locator('.product-name')).toHaveText('Quạt điều hoà Daikiosan DMI03');
  await expect(win.getByRole('button', { name: 'Cỡ chữ gốc' })).toHaveCount(0);

  // Sửa ở các ô thì tem đổi theo
  await win.getByLabel('Giá mới (nghìn đồng)').fill('2745');
  await expect(previewTags(win).locator('.final-price')).toHaveText('2.745');
  await expect(previewTags(win).locator('.original-price')).toHaveText('5.490');

  // Chọn kiểu ngay trên khung xem trước
  await tagPreview(win).getByRole('button', { name: 'Kiểu hiện đại' }).click();
  await expect(tagPreview(win).getByTestId('tag-render').locator('.price-tag.modern')).toHaveCount(1);
  await tagPreview(win).getByRole('button', { name: 'Kiểu có sẵn' }).click();
  await expect(tagPreview(win).getByTestId('tag-render').locator('.price-tag.modern')).toHaveCount(0);

  // Mã QR luôn in khi có mã; xoá mã thì chỗ QR chỉ còn khung mờ, không in
  await expect(previewTags(win).locator('img.qr-code:not(.tag-ghost)')).toHaveCount(1);
  await win.getByLabel('Mã QR').fill('');
  await expect(previewTags(win).locator('img.qr-code.tag-ghost')).toHaveCount(1);
  await expect(previewTags(win).locator('img.qr-code:not(.tag-ghost)')).toHaveCount(0);
  await expect(tagPreview(win).getByText(/Phần mờ là chỗ chưa nhập/)).toBeVisible();

  // Nút Thêm nằm ở khung xem trước, không còn ở khung bên phải
  await expect(win.getByRole('button', { name: 'Thêm', exact: true })).toHaveCount(1);
  await tagPreview(win).getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(1);
  // Không có nút bật tắt mã vạch
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByTitle(/Mã Vạch:/)).toHaveCount(0);
  await expect(win.getByTestId('sticker-thumbnail').getByTestId('tag-render').locator('.price-tag')).toHaveCount(1);

  // Hộp chọn kiểu và bố cục như tab Event, mở sẵn kiểu đang chọn; đóng hộp thì không in
  await pressPrint(win);
  const dialog = layoutDialog(win);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Kiểu có sẵn' })).toHaveAttribute('aria-pressed', 'true');
  for (const label of ['Kiểu hiện đại', '1 Sticker / Trang', '24 Sticker / Trang', 'Máy in bill (80mm)']) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }
  await win.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(win.getByTestId('print-preview')).toHaveCount(0);

  await pressPrint(win);
  // Không phải đặt tên danh sách: bấm bố cục là in, danh sách tự lưu vào Lịch sử
  await expect(layoutDialog(win).getByLabel('Tên danh sách')).toHaveCount(0);
  await layoutDialog(win).getByRole('button', { name: /^8 Sticker \/ Trang/ }).click();
  expect(await printSummary(win)).toContain('A4 dọc');
  const tag = await evalInPrintDoc<{ count: number; name: string; price: string; old: string; qr: number }>(s, `(() => {
    const tags = document.querySelectorAll('.price-tag');
    return {
      count: tags.length,
      name: tags[0].querySelector('.product-name').textContent.trim(),
      price: tags[0].querySelector('.final-price').textContent.trim(),
      old: tags[0].querySelector('.original-price')?.textContent.trim() ?? '',
      qr: document.querySelectorAll('img.qr-code').length,
    };
  })()`);
  // Giá mới 2745 (nghìn đồng) in thành 2.745.000, rút gọn trên tem là 2.745; sticker đã xoá mã nên không có ô QR
  expect(tag).toEqual({ count: 1, name: 'Quạt điều hoà Daikiosan DMI03', price: '2.745', old: '5.490', qr: 0 });
  await closePreview(win);
  // Khung xem trước theo bố cục vừa in
  await expect(tagPreview(win).getByText('8 sticker / trang', { exact: false })).toBeVisible();

  // Giá Sốc thấy cùng danh sách, vẫn là sticker nền Giá Sốc; bấm in chỉ hỏi số sticker mỗi trang A4, không hỏi kiểu tem
  await chooseMode(win, 'Giá Sốc');
  await expect(win.locator('#print-section .sticker-container')).toBeVisible();
  await chooseSubTab(win, /D\.Sách/);
  await expect(win.getByText('Số lượng: 1')).toBeVisible();
  await expect(win.getByTitle(/Mã Vạch:/)).toHaveCount(0);
  await pressPrint(win);
  await expect(layoutDialog(win)).toHaveCount(0);
  await chooseStickersPerPage(win);
  expect(await printSummary(win)).toContain('A4 dọc');
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag').length`)).toBe(0);
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.sticker-container').length`)).toBe(1);
  await closePreview(win);
  await s.close();
});

test('Tab Sticker: nhập file mẫu thành tem từng sản phẩm, in kiểu hiện đại trên máy in bill, nhớ kiểu đã chọn sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Sticker');
  await expect(win.getByText('File giá ĐSD - TBBM')).toHaveCount(0);

  await win.locator('label:has-text("Nhập file mẫu") input[type="file"]').setInputFiles(writeWorkbook(dirs, 'mau.xlsx', [
    ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI'],
    ['QUẠT', 'A1', 'Quạt điều hoà Daikiosan', '5490000', '3490000', 'Tặng quạt mini'],
    ['NỒI', 'A2', 'Nồi cơm Sharp', '1290000', '990000', ''],
  ]));
  // Mỗi sản phẩm một ảnh tem bên trái, khung xem trước mở sản phẩm đầu để sửa
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(2);
  await expect(previewTags(win).locator('.product-name')).toHaveText('Quạt điều hoà Daikiosan');
  await expect(previewTags(win).locator('.final-price')).toHaveText('3.490');
  await expect(win.getByLabel('Mã QR')).toHaveValue('A1');

  await pressPrint(win);
  const dialog = layoutDialog(win);
  await dialog.getByRole('button', { name: 'Kiểu hiện đại' }).click();
  await dialog.getByRole('button', { name: /Máy in bill/ }).click();
  expect(await printSummary(win)).toContain('Giấy cuộn 80 mm');
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag.modern').length`)).toBe(2);
  // Mã của từng sản phẩm in thành QR
  expect(await evalInPrintDoc<number>(s, `document.querySelectorAll('.price-tag.modern img[alt="QR"]').length`)).toBe(2);
  expect(await evalInPrintDoc<string>(s, `document.body.textContent`)).toContain('Nồi cơm Sharp');
  await closePreview(win);
  await expect(tagPreview(win).getByRole('button', { name: 'Kiểu hiện đại' })).toHaveAttribute('aria-pressed', 'true');

  await win.waitForTimeout(800);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Sticker');
  await expect(tagPreview(win).getByRole('button', { name: 'Kiểu hiện đại' })).toHaveAttribute('aria-pressed', 'true');
  await pressPrint(win);
  await expect(layoutDialog(win).getByRole('button', { name: 'Kiểu hiện đại' })).toHaveAttribute('aria-pressed', 'true');
  await win.keyboard.press('Escape');
  await expect(layoutDialog(win)).toHaveCount(0);
  await s.close();
});

test('Tab Sticker: bấm Thêm thì các ô để trống cho sticker sau; ô trống thì không thêm; khuyến mãi của sticker sau không lẫn sang sticker trước', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Sticker');
  const add = tagPreview(win).getByRole('button', { name: 'Thêm', exact: true });
  const fields = ['Tên sản phẩm', 'Mã QR', 'Giá cũ', 'Giá mới (nghìn đồng)', 'Khuyến mãi'];
  const thumbnails = win.getByTestId('sticker-thumbnail');
  const thumbTag = (i: number) => thumbnails.nth(i).getByTestId('tag-render').locator('.price-tag');

  await win.getByLabel('Mã QR').fill('A1');
  await add.click();
  await expect(thumbnails).toHaveCount(1);
  for (const label of fields) await expect(win.getByLabel(label), label).toHaveValue('');
  await expect(win.getByLabel('Tên sản phẩm')).toBeFocused();
  // Tem đang soạn không trống trơn: còn khung xương mờ của tên, giá, khuyến mãi và QR
  const editing = tagPreview(win).getByTestId('tag-render').locator('.price-tag');
  for (const part of ['.product-name', '.final-price', '.original-price', 'img.qr-code']) {
    await expect(editing.locator(`${part}.tag-ghost`), part).toHaveCount(1);
  }
  await expect(editing.locator('.final-price')).toHaveText('3.490');
  // Gõ tên thì tên hết mờ, các phần khác vẫn mờ
  await win.getByLabel('Tên sản phẩm').fill('Bếp từ');
  await expect(editing.locator('.product-name')).toHaveText('Bếp từ');
  await expect(editing.locator('.product-name.tag-ghost')).toHaveCount(0);
  await expect(editing.locator('.final-price.tag-ghost')).toHaveCount(1);
  await win.getByLabel('Tên sản phẩm').fill('');
  // Sticker vừa thêm giữ đủ nội dung
  await expect(thumbTag(0).locator('.product-name')).toHaveText('Quạt điều hoà Daikiosan DMI03');
  await expect(thumbTag(0)).toContainText('Khuyến mãi áp dụng đến hết ngày 3/5/2026');
  await expect(thumbTag(0).locator('img.qr-code')).toHaveCount(1);

  // Các ô đều trống thì không thêm
  await add.click();
  await expect(win.getByText('Nhập tên sản phẩm hoặc giá trước khi thêm')).toBeVisible();
  await expect(thumbnails).toHaveCount(1);

  // Sticker thứ hai không có khuyến mãi, không có mã
  await win.getByLabel('Tên sản phẩm').fill('Nồi cơm Sharp');
  await win.getByLabel('Giá mới (nghìn đồng)').fill('990');
  await add.click();
  await expect(thumbnails).toHaveCount(2);
  await expect(thumbTag(1).locator('.product-name')).toHaveText('Nồi cơm Sharp');
  await expect(thumbTag(1).locator('img.qr-code')).toHaveCount(0);

  // Gõ khuyến mãi cho sticker đang soạn: hai sticker đã thêm không đổi
  await win.getByLabel('Khuyến mãi').fill('Tặng quạt mini');
  await expect(tagPreview(win).getByTestId('tag-render').locator('.price-tag')).toContainText('Tặng quạt mini');
  await expect(thumbTag(1)).not.toContainText('Tặng quạt mini');
  await expect(thumbTag(0)).not.toContainText('Tặng quạt mini');

  // Bản in là hai sticker đã thêm, sticker đang soạn chưa bấm Thêm thì không in
  await pressPrint(win);
  await layoutDialog(win).getByRole('button', { name: /^4 Sticker \/ Trang/ }).click();
  await printSummary(win);
  const printed = await evalInPrintDoc<string[]>(s, `[...document.querySelectorAll('.price-tag')].map((tag) => tag.textContent)`);
  expect(printed).toHaveLength(2);
  expect(printed[1]).toContain('Nồi cơm Sharp');
  expect(printed.join(' ')).not.toContain('Tặng quạt mini');
  await closePreview(win);
  await s.close();
});

test('Tab Sticker: xem trước đúng phông và cỡ chữ bản in; người in nhập riêng ở tab Sticker, in ra tem, nhớ sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Sticker');
  const render = () => tagPreview(win).getByTestId('tag-render');

  // Không lấy chất liệu của app: chữ dùng phông nét đậm như tài liệu in, tên dài vẫn một dòng, tem không tràn
  const fit = (selector: string) => render().evaluate((host, sel) => {
    const root = host.shadowRoot!;
    const tag = root.querySelector('.price-tag')!.getBoundingClientRect();
    const name = root.querySelector(sel)!;
    const inner = root.querySelector('.inner-border, .modern-outer-border')!.getBoundingClientRect();
    return {
      family: getComputedStyle(name).fontFamily,
      // Số dòng chữ thật sự hiện ra: đếm các hàng khác nhau của chữ (không phụ thuộc tỉ lệ thu nhỏ của khung xem trước)
      lines: (() => {
        const range = document.createRange();
        range.selectNodeContents(name);
        return new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      })(),
      inside: inner.bottom <= tag.bottom + 0.5 && inner.right <= tag.right + 0.5,
    };
  }, selector);
  const plain = await fit('.product-name');
  expect(plain.family).toContain('Tem Oswald');
  expect(plain.lines).toBe(1);
  expect(plain.inside).toBe(true);
  await tagPreview(win).getByRole('button', { name: 'Kiểu hiện đại' }).click();
  await expect(render().locator('.price-tag.modern')).toHaveCount(1);
  const modern = await fit('.price-tag.modern h1');
  expect(modern.family).toContain('Tem Roboto Condensed');
  expect(modern.lines).toBe(1);
  expect(modern.inside).toBe(true);
  await tagPreview(win).getByRole('button', { name: 'Kiểu có sẵn' }).click();

  // Cột giữa không cuộn: tem thu nhỏ cho vừa, các ô sửa nằm gọn bên dưới
  const scroll = await tagPreview(win).evaluate((card) => card.parentElement!.scrollHeight - card.parentElement!.clientHeight);
  expect(scroll).toBeLessThanOrEqual(0);

  // Người in: mặc định trống, tem vẫn có ngày giờ in
  const employee = tagPreview(win).getByLabel('Người in');
  await expect(employee).toHaveValue('');
  await expect(render().locator('.print-time')).toHaveText(/^\d{2}:\d{2} \d{2}[-/]\d{2}$/);
  await employee.fill('21707');
  await expect(render().locator('.price-tag')).toContainText('21707');
  await pressPrint(win);
  await layoutDialog(win).getByRole('button', { name: /^1 Sticker \/ Trang/ }).click();
  await printSummary(win);
  expect(await evalInPrintDoc<string>(s, `document.body.textContent`)).toContain('21707');
  await closePreview(win);

  // Tab Event không dùng tên này
  await chooseMode(win, 'Event');
  await expect(win.getByText('21707', { exact: true })).toHaveCount(0);

  await win.waitForTimeout(800);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Sticker');
  await expect(tagPreview(win).getByLabel('Người in')).toHaveValue('21707');
  await s.close();
});

test('Mỗi lần in tự lưu danh sách vào Lịch sử, tên theo sản phẩm; in lại danh sách trùng thì không lưu thêm; tìm không dấu, mở lại được', async () => {
  const s = await openApp();
  const { win } = s;
  const printTag = async () => {
    await pressPrint(win);
    await layoutDialog(win).getByRole('button', { name: /^4 Sticker \/ Trang/ }).click();
    await printSummary(win);
    await closePreview(win);
  };
  await chooseMode(win, 'Sticker');
  await win.getByLabel('Tên sản phẩm').fill('Máy lọc nước Karofi');
  await printTag();
  // Danh sách khác: thêm một mục
  await win.getByLabel('Tên sản phẩm').fill('Nồi cơm Sharp');
  await printTag();
  // In lại đúng danh sách đó, ở tab Sticker hay Giá Sốc: không lưu thêm
  await printTag();
  await chooseMode(win, 'Giá Sốc');
  await pressPrint(win);
  await chooseStickersPerPage(win, 1);
  await printSummary(win);
  await closePreview(win);

  // Hai tab dùng chung Lịch sử; tên tự đặt theo sản phẩm, mới in gần nhất ở trên
  await chooseSubTab(win, /Lịch sử/);
  const rows = win.locator('div.group').filter({ has: win.getByRole('button', { name: 'Khôi phục' }) });
  await expect(rows).toHaveCount(2);
  await expect(rows.locator('p.font-bold')).toHaveText(['Nồi cơm Sharp', 'Máy lọc nước Karofi']);
  await expect(rows.nth(1)).toContainText('Sticker');

  // Tìm không cần dấu, không phân biệt chữ hoa
  const search = win.getByLabel('Tìm theo tên danh sách');
  await search.fill('MAY LOC');
  await expect(rows.locator('p.font-bold')).toHaveText(['Máy lọc nước Karofi']);
  await search.fill('tủ lạnh');
  await expect(win.getByText(/Không có danh sách nào tên giống/)).toBeVisible();
  await search.fill('may loc');

  // Mở lại danh sách đã in: sticker đã in vào lại danh sách
  await rows.first().getByRole('button', { name: 'Khôi phục' }).click();
  await expect(win.getByTestId('sticker-thumbnail')).toHaveCount(1);
  await expect(win.getByTestId('sticker-thumbnail')).toHaveAttribute('aria-label', /Máy lọc nước Karofi/);
  await s.close();
});

test('Tab Sticker: các kiểu làm nổi giá (không nền đen), chọn ở khung xem trước hoặc hộp in, tem vừa khung ở mọi bố cục, nhớ sau khi mở lại', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Sticker');
  const render = () => tagPreview(win).getByTestId('tag-render');
  const styles = await tagPreview(win).getByRole('group', { name: 'Kiểu sticker' }).getByRole('button').allInnerTexts();
  expect(styles).toEqual(['Kiểu có sẵn', 'Kiểu hiện đại', 'Kiểu giá to', 'Kiểu phiếu giảm giá']);

  // Sáu kiểu mới đều không có mảng nền đen (in trắng đen tốn mực)
  for (const name of ['Kiểu giá to', 'Kiểu phiếu giảm giá']) {
    await tagPreview(win).getByRole('button', { name }).click();
    await expect(render().locator('.price-tag.canvas-tag')).toHaveCount(1);
    const darkFill = await render().evaluate((host) => Array.from(host.shadowRoot!.querySelectorAll('.ct-wrapper *'))
      .filter((el) => getComputedStyle(el).backgroundColor === 'rgb(0, 0, 0)').length);
    expect(darkFill, name).toBe(0);
  }

  // Kiểu phiếu giảm giá: cuống phiếu ghi % giảm và giá gốc gạch ngang, thân phiếu ghi giá ưu đãi
  await tagPreview(win).getByRole('button', { name: 'Kiểu phiếu giảm giá' }).click();
  const bold = render().locator('.price-tag.style-coupon');
  await expect(bold).toHaveCount(1);
  await expect(bold.locator('.ct-old')).toHaveText('5.490.000đ');
  await expect(bold.locator('.ct-badge-value')).toHaveText('36%');
  await expect(bold.locator('.ct-price-big')).toHaveText('3.490');

  // Khung xương mờ cũng dùng được với kiểu mới
  await win.getByLabel('Giá cũ').fill('');
  await expect(bold.locator('.ct-old.tag-ghost')).toHaveCount(1);
  await expect(bold.locator('.ct-price-big.tag-ghost')).toHaveCount(0);
  await win.getByLabel('Giá cũ').fill('5.490.000');

  // Chọn kiểu Giá to ngay trong hộp in; mọi bố cục tem đều nằm gọn trong trang
  for (const [layout, label] of [[16, /^16 Sticker \/ Trang/], [80, /Máy in bill/]] as const) {
    await pressPrint(win);
    await layoutDialog(win).getByRole('button', { name: 'Kiểu giá to' }).click();
    await layoutDialog(win).getByRole('button', { name: label }).click();
    await printSummary(win);
    const fit = await evalInPrintDoc<{ count: number; inside: boolean; old: string; price: string }>(s, `(() => {
      const tag = document.querySelector('.price-tag.style-big');
      const box = tag.getBoundingClientRect();
      const inner = tag.querySelector('.ctg').getBoundingClientRect();
      return {
        count: document.querySelectorAll('.price-tag.style-big').length,
        inside: inner.left >= box.left - 0.5 && inner.right <= box.right + 0.5 && inner.top >= box.top - 0.5 && inner.bottom <= box.bottom + 0.5,
        old: tag.querySelector('.ct-old').textContent.trim(),
        price: tag.querySelector('.ct-price-big').textContent.trim(),
      };
    })()`);
    expect(fit, `bố cục ${layout}`).toEqual({ count: 1, inside: true, old: '5.490.000đ', price: '3.490' });
    await closePreview(win);
  }
  await expect(tagPreview(win).getByRole('button', { name: 'Kiểu giá to' })).toHaveAttribute('aria-pressed', 'true');

  await win.waitForTimeout(800);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Sticker');
  await expect(tagPreview(win).getByRole('button', { name: 'Kiểu giá to' })).toHaveAttribute('aria-pressed', 'true');
  await expect(render().locator('.price-tag.style-big')).toHaveCount(1);
  await s.close();
});

test('Tab Sticker: trang in có đường cắt nét đứt nằm giữa khe giữa các tem và quanh khối tem', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Sticker');
  const qty = win.getByTestId('tag-editor').getByRole('group', { name: 'Số bản in' }).locator('input');
  await qty.fill('2');
  await qty.press('Enter');
  await pressPrint(win);
  await layoutDialog(win).getByRole('button', { name: /^8 Sticker \/ Trang/ }).click();
  await printSummary(win);
  const cut = await evalInPrintDoc<{ vertical: number; horizontal: number; middleBetween: boolean; aroundTags: boolean; dashed: string }>(s, `(() => {
    const tags = [...document.querySelectorAll('.price-tag')].map((t) => t.getBoundingClientRect());
    const v = [...document.querySelectorAll('.cut-v')].map((l) => l.getBoundingClientRect());
    const h = [...document.querySelectorAll('.cut-h')].map((l) => l.getBoundingClientRect());
    return {
      vertical: v.length,
      horizontal: h.length,
      middleBetween: v[1].left > tags[0].right && v[1].left < tags[1].left,
      aroundTags: v[0].left < tags[0].left && v[2].left > tags[1].right && h[0].top < tags[0].top && h[1].top > tags[0].bottom,
      dashed: getComputedStyle(document.querySelector('.cut-v')).borderLeftStyle,
    };
  })()`);
  expect(cut).toEqual({ vertical: 3, horizontal: 2, middleBetween: true, aroundTags: true, dashed: 'dashed' });
  await closePreview(win);
  await s.close();
});

test('Máy in bill 80mm: cả bốn kiểu tem nằm gọn giữa khổ giấy, không lệch, không cao quá khổ tem', async () => {
  const s = await openApp();
  const { win } = s;
  await chooseMode(win, 'Sticker');
  for (const style of ['Kiểu có sẵn', 'Kiểu hiện đại', 'Kiểu giá to', 'Kiểu phiếu giảm giá']) {
    await tagPreview(win).getByRole('button', { name: style }).click();
    // Khung xem trước: nội dung tem nằm trong tem
    const previewFit = await tagPreview(win).getByTestId('tag-render').evaluate((host) => {
      const root = host.shadowRoot!;
      const tag = root.querySelector('.price-tag')!.getBoundingClientRect();
      const inner = (root.querySelector('.modern-wrapper, .ct-wrapper, .inner-border') ?? root.querySelector('.price-tag')!).getBoundingClientRect();
      return inner.left >= tag.left - 1 && inner.right <= tag.right + 1;
    });
    await pressPrint(win);
    await layoutDialog(win).getByRole('button', { name: /Máy in bill/ }).click();
    const summary = await printSummary(win);
    const rollMm = Number(/Giấy cuộn 80 mm × (\d+) mm/.exec(summary)?.[1]);
    const fit = await evalInPrintDoc<{ inside: boolean; centered: boolean }>(s, `(() => {
      const tag = document.querySelector('.price-tag');
      const box = tag.getBoundingClientRect();
      const inner = (tag.querySelector('.modern-wrapper, .ct-wrapper, .inner-border') || tag).getBoundingClientRect();
      return {
        inside: inner.left >= box.left - 1 && inner.right <= box.right + 1 && inner.top >= box.top - 1 && inner.bottom <= box.bottom + 1,
        centered: Math.abs((inner.left + inner.right) / 2 - (box.left + box.right) / 2) < 3,
      };
    })()`);
    expect({ style, previewFit, ...fit, rollOk: rollMm > 0 && rollMm <= 80 }).toEqual({ style, previewFit: true, inside: true, centered: true, rollOk: true });
    await closePreview(win);
  }
  await s.close();
});

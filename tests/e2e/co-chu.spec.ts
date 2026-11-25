import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseMode, chooseStickersPerPage, closePreview, evalInPrintDoc, newDirs, openApp, printSummary } from './helpers';

/** Bôi đen cả ô, hoặc một từ trong ô, giống người dùng kéo chuột. */
const selectText = async (win: Page, selector: string, word?: string) => {
  await win.evaluate(({ selector, word }) => {
    const el = document.querySelector(selector) as HTMLElement;
    el.focus();
    const range = document.createRange();
    if (word) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const at = node.data.indexOf(word);
        if (at >= 0) {
          range.setStart(node, at);
          range.setEnd(node, at + word.length);
          break;
        }
      }
    } else {
      range.selectNodeContents(el);
    }
    const selection = getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
  }, { selector, word });
  await win.waitForTimeout(120);
};

/** Cỡ chữ thật của chữ trên màn hình, đơn vị cqw. Có `word` thì đo đúng từ đó, không thì đo đoạn chữ đầu tiên của ô. */
const realSize = (win: Page, selector: string, word?: string) => win.evaluate(({ selector, word }) => {
  const el = document.querySelector(selector) as HTMLElement;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let holder: Element = el;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || (word && !node.data.includes(word))) continue;
    holder = node.parentElement as Element;
    break;
  }
  const width = (el.closest('.sticker-container') as HTMLElement).clientWidth;
  return Number(((parseFloat(getComputedStyle(holder).fontSize) / width) * 100).toFixed(1));
}, { selector, word });

const plus = (win: Page) => win.getByRole('button', { name: 'Tăng size chữ' }).click();
const minus = (win: Page) => win.getByRole('button', { name: 'Giảm size chữ' }).click();
const sizeBox = (win: Page) => win.getByLabel('Cỡ chữ', { exact: true });
const clearSelection = async (win: Page) => {
  await win.evaluate(() => (getSelection() as Selection).removeAllRanges());
  await win.waitForTimeout(80);
};

test('Đầu trang không còn ô chỉnh cỡ chữ ở mọi chế độ', async () => {
  const s = await openApp();
  const { win } = s;
  for (const mode of ['Giá Sốc', 'Giờ Vàng', 'Phiếu', 'Sticker', 'Event'] as const) {
    await chooseMode(win, mode);
    await expect(win.getByTitle('Tăng size', { exact: true })).toHaveCount(0);
    await expect(win.getByTitle('Giảm size', { exact: true })).toHaveCount(0);
    await expect(win.locator('#global-header-actions').getByText(/Tiêu đề:|Cỡ chữ/)).toHaveCount(0);
  }
  await s.close();
});

test('Thanh chọn chế độ: bấm và rê chuột vào nút ở hai đầu không lộ góc vuông', async () => {
  const s = await openApp();
  const { win } = s;
  const header = win.locator('#global-header-actions');
  // Tab Event mặc định tắt nên nút cuối thanh là Phiếu
  for (const [name, corner] of [['Giá Sốc', 'borderTopLeftRadius'], ['Phiếu', 'borderTopRightRadius']] as const) {
    const button = header.getByRole('button', { name, exact: true });
    await button.click();
    await button.hover();
    await win.waitForTimeout(250);
    const shape = await button.evaluate((el, corner) => ({
      radius: parseFloat(getComputedStyle(el)[corner]),
      overflow: getComputedStyle(el.parentElement as HTMLElement).overflow,
    }), corner);
    expect(shape.overflow, `${name}: nhóm vẫn cắt theo đường bo`).toBe('hidden');
    expect(shape.radius, `${name}: nút tự bo theo nhóm`).toBeGreaterThan(0);
  }
  await s.close();
});

test('Cụm nút cuối thanh trên: nút đầu và nút phiên bản bo theo nhóm, viền focus không lộ góc vuông', async () => {
  const s = await openApp();
  const { win } = s;
  const corner = (name: RegExp, side: 'borderTopLeftRadius' | 'borderTopRightRadius') =>
    win.getByRole('button', { name }).first().evaluate((el, c) => parseFloat(getComputedStyle(el)[c]), side);
  expect(await corner(/^Font hiện tại|Chọn font|Phông/, 'borderTopLeftRadius'), 'Nút chữ T bo đầu trái').toBeGreaterThan(10);
  expect(await corner(/Cập nhật ứng dụng/, 'borderTopRightRadius'), 'Nút phiên bản bo đầu phải').toBeGreaterThan(10);
  await s.close();
});

test('Tem: thanh định dạng hiện đúng cỡ của mọi ô, tăng giảm đều nhận, in và mở lại vẫn đúng, nút gốc đưa về mặc định', async () => {
  const dirs = newDirs();
  let s = await openApp(dirs);
  let { win } = s;
  await chooseMode(win, 'Giá Sốc');

  const fields: [string, number, number][] = [
    ['.header-text', 8, 0.2],
    ['.extra1', 36.9, 1],
    ['.old', 14.2, 0.5],
    ['.name', 3.6, 0.2],
    ['.extra2', 26.5, 1],
    ['.footer-text', 3.2, 0.2],
  ];
  for (const [selector, size, step] of fields) {
    await selectText(win, selector);
    await expect(sizeBox(win), `${selector} hiện đúng cỡ thật`).toHaveValue(size.toFixed(1));
    await plus(win);
    await plus(win);
    await expect.poll(() => realSize(win, selector), `${selector} tăng`).toBeCloseTo(size + 2 * step, 1);
    await expect(sizeBox(win)).toHaveValue((size + 2 * step).toFixed(1));
    await minus(win);
    await expect.poll(() => realSize(win, selector), `${selector} giảm`).toBeCloseTo(size + step, 1);
    await expect(sizeBox(win)).toHaveValue((size + step).toFixed(1));
    await clearSelection(win);
  }

  // Gõ số trực tiếp, kể cả số lớn hơn mức 8 trước đây
  await selectText(win, '.extra2');
  await sizeBox(win).fill('30');
  await expect.poll(() => realSize(win, '.extra2')).toBeCloseTo(30, 1);
  await sizeBox(win).press('Enter');
  await clearSelection(win);

  // Bản in nhận đúng cỡ đã chỉnh
  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await chooseStickersPerPage(win);
  await printSummary(win);
  const printed = await evalInPrintDoc<number>(s, `(() => {
    const el = document.querySelector('.extra2');
    return parseFloat(getComputedStyle(el).fontSize) / el.closest('.sticker-container').clientWidth * 100;
  })()`);
  expect(printed).toBeCloseTo(30, 0);
  await closePreview(win);

  // Đổi chế độ rồi quay lại, đóng và mở lại app: cỡ chữ vẫn còn, kể cả tiêu đề
  await chooseMode(win, 'Phiếu');
  await chooseMode(win, 'Giá Sốc');
  expect(await realSize(win, '.header-text')).toBeCloseTo(8.2, 1);
  await win.waitForTimeout(1500);
  await s.close();
  s = await openApp(dirs);
  ({ win } = s);
  await chooseMode(win, 'Giá Sốc');
  expect(await realSize(win, '.extra2')).toBeCloseTo(30, 1);
  expect(await realSize(win, '.header-text')).toBeCloseTo(8.2, 1);

  // Khôi phục riêng một ô từ thanh định dạng
  await selectText(win, '.extra2');
  await win.getByRole('button', { name: 'Khôi phục cỡ chữ mặc định của ô này' }).click();
  await expect.poll(() => realSize(win, '.extra2')).toBeCloseTo(26.5, 1);
  await expect(sizeBox(win)).toHaveValue('26.5');
  expect(await realSize(win, '.header-text')).toBeCloseTo(8.2, 1);
  await clearSelection(win);

  // Một từ trong tên: chỉ từ đó đổi; nút gốc đưa tất cả về mặc định
  await selectText(win, '.name', 'Daikiosan');
  await plus(win);
  await expect.poll(() => realSize(win, '.name', 'Daikiosan')).toBeGreaterThan(await realSize(win, '.name', 'Quạt'));
  // Từ được chỉnh vẫn đúng phông của ô, không dính vào hai từ bên cạnh
  const partial = await win.evaluate(() => {
    const field = document.querySelector('.name') as HTMLElement;
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    const rects: Record<string, DOMRect> = {};
    let word: HTMLElement | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      // Chỉ đo phần chữ, không tính khoảng trắng ở hai đầu đoạn
      const text = node.data.trim();
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      rects[text] = range.getBoundingClientRect();
      if (text === 'Daikiosan') word = node.parentElement;
    }
    const keys = Object.keys(rects);
    return {
      fieldFont: getComputedStyle(field).fontFamily,
      wordFont: getComputedStyle(word as unknown as HTMLElement).fontFamily,
      text: field.innerText,
      gapBefore: rects.Daikiosan.left - rects[keys[0]].right,
      gapAfter: rects[keys[2]].left - rects.Daikiosan.right,
    };
  });
  expect(partial.wordFont).toBe(partial.fieldFont);
  expect(partial.text).toBe('Quạt điều hoà Daikiosan DMI03');
  expect(partial.gapBefore, 'có khoảng trắng trước từ').toBeGreaterThan(1);
  expect(partial.gapAfter, 'có khoảng trắng sau từ').toBeGreaterThan(1);

  await clearSelection(win);
  await win.getByRole('button', { name: 'Cỡ chữ gốc' }).click();
  await expect(win.getByText('Đã khôi phục cỡ chữ mặc định')).toBeVisible();
  for (const [selector, size] of fields) {
    await expect.poll(() => realSize(win, selector), `${selector} về mặc định`).toBeCloseTo(size, 1);
  }
  expect(await realSize(win, '.name', 'Daikiosan')).toBeCloseTo(3.6, 1);
  // Về gốc thì không còn thẻ bọc nào trong ô
  expect(await win.evaluate(() => document.querySelector('.name')?.innerHTML)).toBe('Quạt điều hoà Daikiosan DMI03');
  await s.close();
});

test('Phiếu: chọn nhiều dòng vẫn đổi được, chọn một từ không kéo cả ô, in đúng, khôi phục đúng cỡ từng dòng', async () => {
  const dirs = newDirs();
  const s = await openApp(dirs);
  const { win } = s;
  await chooseMode(win, 'Phiếu');
  await win.locator('input[type="number"]:visible').nth(1).fill('4');
  await win.waitForTimeout(600);

  // Bôi đen cả ô nhiều dòng: trước đây bấm + không có tác dụng vì mỗi dòng có cỡ riêng
  await selectText(win, '.input-content-bottom-left');
  await expect(sizeBox(win)).toHaveValue('2.9');
  await plus(win);
  await plus(win);
  await expect.poll(() => realSize(win, '.input-content-bottom-left', '150 Bộ')).toBeCloseTo(3.3, 1);
  expect(await realSize(win, '.input-content-bottom-left', '8 Nồi cơm')).toBeCloseTo(3.3, 1);
  await expect(sizeBox(win)).toHaveValue('3.3');
  await clearSelection(win);

  // Ô hai dòng khác cỡ: cả hai cùng tăng, không bị san bằng
  await selectText(win, '.input-content-top-left');
  await plus(win);
  await expect.poll(() => realSize(win, '.input-content-top-left', 'RÚT THĂM')).toBeCloseTo(4.7, 1);
  expect(await realSize(win, '.input-content-top-left', 'MIỄN PHÍ')).toBeCloseTo(3.7, 1);
  await clearSelection(win);

  // Một từ: từ khác trong ô và cỡ của cả ô giữ nguyên
  const fieldSizeBefore = await win.evaluate(() => (document.querySelector('.input-content-bottom-right') as HTMLElement).style.fontSize);
  await selectText(win, '.input-content-bottom-right', 'MÁY');
  await plus(win);
  await expect.poll(() => realSize(win, '.input-content-bottom-right', 'MÁY')).toBeCloseTo(7.8, 1);
  expect(await realSize(win, '.input-content-bottom-right', '2 ')).toBeCloseTo(7.6, 1);
  expect(await win.evaluate(() => (document.querySelector('.input-content-bottom-right') as HTMLElement).style.fontSize)).toBe(fieldSizeBefore);
  // Từ được chỉnh giữ đúng phông và đậm của dòng
  const wordStyle = await win.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('.input-content-bottom-right') as HTMLElement, NodeFilter.SHOW_TEXT);
    const styles: Record<string, string> = {};
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const cs = getComputedStyle(node.parentElement as Element);
      styles[node.data.trim()] = `${cs.fontFamily}|${cs.fontWeight}`;
    }
    return styles;
  });
  expect(wordStyle['MÁY']).toBe(wordStyle['GIẶT']);
  await minus(win);
  await minus(win);
  await expect.poll(() => realSize(win, '.input-content-bottom-right', 'MÁY')).toBeCloseTo(7.4, 1);
  await clearSelection(win);

  // Ô một dòng không có cỡ riêng: đổi cỡ của cả ô, chạm giới hạn của tiêu đề thì dừng và hiện đúng số
  await selectText(win, '.input-title-single');
  await expect(sizeBox(win)).toHaveValue('4.3');
  await sizeBox(win).fill('5');
  await expect.poll(() => realSize(win, '.input-title-single')).toBeCloseTo(5, 1);
  await sizeBox(win).press('Enter');
  await clearSelection(win);

  // Khoảng dòng giảm được thật
  await selectText(win, '.input-content-bottom-left', '150 Bộ');
  const lineBefore = await win.evaluate(() => (document.querySelector('.input-content-bottom-left > div') as HTMLElement).getBoundingClientRect().height);
  await win.getByRole('button', { name: 'Giảm khoảng cách dòng' }).click();
  await win.getByRole('button', { name: 'Giảm khoảng cách dòng' }).click();
  await expect.poll(() => win.evaluate(() => (document.querySelector('.input-content-bottom-left > div') as HTMLElement).getBoundingClientRect().height)).toBeLessThan(lineBefore);
  await clearSelection(win);

  // Bản in và các phiếu sau cùng nhận
  await win.waitForTimeout(400);
  await win.getByRole('button', { name: /Bấm để in|In đã chọn/ }).first().click();
  await printSummary(win);
  const printed = await evalInPrintDoc<{ html: string; title: string; second: string }>(s, `({
    html: document.querySelector('.input-content-bottom-left').innerHTML,
    second: document.querySelectorAll('.input-content-bottom-left')[1].innerHTML,
    title: document.querySelector('.input-title-single').style.fontSize,
  })`);
  expect(printed.html).toContain('font-size: 3.3cqw');
  expect(printed.second).toContain('font-size: 3.3cqw');
  expect(printed.title).toBe('5cqw');
  await closePreview(win);

  // Khôi phục một ô: dòng nào về đúng cỡ dòng đó trong mẫu
  await selectText(win, '.input-content-top-left');
  await win.getByRole('button', { name: 'Khôi phục cỡ chữ mặc định của ô này' }).click();
  await expect.poll(() => realSize(win, '.input-content-top-left', 'RÚT THĂM')).toBeCloseTo(4.5, 1);
  expect(await realSize(win, '.input-content-top-left', 'MIỄN PHÍ')).toBeCloseTo(3.5, 1);
  await clearSelection(win);

  // Nút gốc: mọi ô về mặc định, chữ và đậm nghiêng giữ nguyên
  await win.getByRole('button', { name: 'Cỡ chữ gốc' }).click();
  await expect.poll(() => realSize(win, '.input-content-bottom-left', '150 Bộ')).toBeCloseTo(2.9, 1);
  expect(await realSize(win, '.input-content-bottom-left', '8 Nồi cơm')).toBeCloseTo(2.9, 1);
  expect(await realSize(win, '.input-content-bottom-right', 'MÁY')).toBeCloseTo(7.6, 1);
  expect(await realSize(win, '.input-title-single')).toBeCloseTo(4.3, 1);
  const html = await win.evaluate(() => document.querySelector('.input-content-bottom-left')?.innerHTML ?? '');
  expect(html).toContain('<b>- 150 Bộ 3 hộp</b>');
  await s.close();
});

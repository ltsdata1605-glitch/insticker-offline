import QRCode from 'qrcode';

// ---------- Mã vạch Code 128 ----------

/** Độ rộng vạch, khoảng trắng xen kẽ của 107 ký hiệu Code 128 (106 là STOP, 7 phần tử) */
const PATTERNS: readonly string[] = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const START_C = 105;
const TO_C = 99;
const TO_B = 100;
const STOP = 106;
/** Vùng trắng hai bên, tính theo vạch nhỏ nhất */
export const QUIET = 10;

/** Mã vạch Code 128 chỉ nhận chữ không dấu, số và ký hiệu trên bàn phím (mã ASCII 32 đến 126) */
export const barcodeProblem = (text: string): string => {
    if (!text) return 'Chưa có nội dung';
    if (/[^\x20-\x7e]/.test(text)) return 'Mã vạch chỉ nhận chữ không dấu, số và ký hiệu (không dấu tiếng Việt, không xuống dòng)';
    if (text.length > 80) return 'Mã vạch quá dài (tối đa 80 ký tự), dùng mã QR';
    return '';
};

const digitRun = (text: string, from: number): number => {
    let end = from;
    while (end < text.length && text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57) end += 1;
    return end - from;
};

/**
 * Giá trị các ký hiệu Code 128 (gồm START, các ký tự, số kiểm tra, STOP). Tự chuyển bộ C cho dãy số dài (hai chữ số một ký hiệu,
 * mã ngắn hơn), còn lại dùng bộ B.
 */
export const code128Values = (text: string): number[] => {
    const problem = barcodeProblem(text);
    if (problem) throw new Error(problem);
    const values: number[] = [];
    const leading = digitRun(text, 0);
    let set: 'B' | 'C' = leading >= 4 || (leading === text.length && leading % 2 === 0) ? 'C' : 'B';
    values.push(set === 'C' ? START_C : START_B);
    let i = 0;
    while (i < text.length) {
        if (set === 'C') {
            if (digitRun(text, i) >= 2) {
                values.push(Number(text.slice(i, i + 2)));
                i += 2;
                continue;
            }
            values.push(TO_B);
            set = 'B';
            continue;
        }
        const run = digitRun(text, i);
        // Dãy số từ 4 chữ số (hoặc 6 ở giữa chữ) thì sang bộ C; số chữ số lẻ thì để chữ số đầu ở bộ B
        const worth = run >= 6 || (run >= 4 && i + run === text.length);
        if (worth) {
            if (run % 2 === 1) {
                values.push(text.charCodeAt(i) - 32);
                i += 1;
            }
            values.push(TO_C);
            set = 'C';
            continue;
        }
        values.push(text.charCodeAt(i) - 32);
        i += 1;
    }
    const check = values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
    values.push(check, STOP);
    return values;
};

/** Độ rộng từng vạch và khoảng trắng (bắt đầu bằng vạch), kèm tổng số vạch nhỏ nhất */
export const code128Bars = (text: string): { widths: number[]; modules: number } => {
    const widths = code128Values(text).flatMap(value => PATTERNS[value].split('').map(Number));
    return { widths, modules: widths.reduce((a, b) => a + b, 0) };
};

/** Đọc ngược độ rộng vạch thành giá trị ký hiệu (dùng trong bài kiểm thử) */
export const decodeCode128 = (widths: number[]): number[] => {
    const values: number[] = [];
    for (let i = 0; i < widths.length;) {
        const size = widths.length - i === 7 ? 7 : 6;
        const index = PATTERNS.indexOf(widths.slice(i, i + size).join(''));
        if (index < 0) throw new Error(`Vạch lạ ở vị trí ${i}`);
        values.push(index);
        i += size;
    }
    return values;
};

/** Mã vạch dạng SVG: co giãn theo khung chứa (vạch giữ đúng tỉ lệ chiều ngang) */
export const barcodeSvg = (text: string): string => {
    const { widths, modules } = code128Bars(text);
    const total = modules + QUIET * 2;
    let x = QUIET;
    let path = '';
    widths.forEach((width, index) => {
        if (index % 2 === 0) path += `M${x} 0h${width}v40h-${width}z`;
        x += width;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 40" preserveAspectRatio="none" shape-rendering="crispEdges" role="img"><rect width="${total}" height="40" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
};

// ---------- Mã QR ----------

/** Ô vuông của mã QR (true là ô đen). Nội dung tiếng Việt có dấu dùng được. */
export const qrMatrix = (text: string): boolean[][] => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const { size, data } = qr.modules;
    return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => Boolean(data[row * size + col])));
};

export const qrProblem = (text: string): string => {
    if (!text) return 'Chưa có nội dung';
    try {
        qrMatrix(text);
        return '';
    } catch {
        return 'Nội dung quá dài cho mã QR (tối đa khoảng 2.000 ký tự)';
    }
};

/**
 * Mã QR dạng SVG, có viền trắng 4 ô theo chuẩn. Ô đen vẽ bằng một hình tô kín (không dùng nét vẽ): ô nhỏ hơn 1pt thì bản PDF
 * của Chromium vẽ nét thành sợi tóc. `margin` nhỏ hơn cho chỗ chật như góc tem giá (In sticker dùng 1 ô); `width` đặt cỡ gốc
 * cho ảnh khi dùng SVG làm nguồn thẻ img.
 */
export const qrSvg = (text: string, { margin = 4, width }: { margin?: number; width?: number } = {}): string => {
    const matrix = qrMatrix(text);
    const size = matrix.length + margin * 2;
    let path = '';
    matrix.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            if (!row[x]) {
                x += 1;
                continue;
            }
            const start = x;
            while (x < row.length && row[x]) x += 1;
            path += `M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`;
        }
    });
    const box = width ? ` width="${width}" height="${width}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg"${box} viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
};

// ---------- Danh sách mã ----------

export type CodeKind = 'qr' | 'barcode' | 'both';

export const KIND_TEXT: Record<CodeKind, string> = { qr: 'Mã QR', barcode: 'Mã vạch', both: 'QR + mã vạch' };

export interface CodeItem {
    id: string;
    title: string;
    content: string;
    /** Số bản in của mã này */
    copies: number;
}

/** Mã của dòng không tạo được (rỗng là được) */
export const itemProblem = (item: Pick<CodeItem, 'content'>, kind: CodeKind): string => {
    const content = item.content.trim();
    if (!content) return 'Chưa có nội dung';
    if (kind !== 'barcode') {
        const problem = qrProblem(content);
        if (problem) return problem;
    }
    return kind === 'qr' ? '' : barcodeProblem(content);
};

/**
 * Dán nhiều dòng: mỗi dòng một mã. Hai cột (dán từ Excel, hoặc cách nhau bằng dấu |) thì cột đầu là tiêu đề, cột sau là nội dung;
 * một cột thì chỉ có nội dung.
 */
export const parseLines = (text: string): { title: string; content: string }[] => text
    .split(/\r?\n/)
    .map(line => {
        const parts = line.includes('\t') ? line.split('\t') : line.includes('|') ? line.split('|') : [line];
        const cells = parts.map(part => part.trim());
        return cells.length >= 2 ? { title: cells[0], content: cells.slice(1).join(' ').trim() } : { title: '', content: cells[0] };
    })
    .filter(line => line.content);

// ---------- Trang in ----------

export interface PageSettings {
    kind: CodeKind;
    perPage: number;
    landscape: boolean;
    /** Ghi nội dung dưới mã */
    showText: boolean;
    /** Viền nét đứt quanh từng mã để cắt */
    cutLines: boolean;
}

export const DEFAULT_SETTINGS: PageSettings = { kind: 'qr', perPage: 12, landscape: false, showText: true, cutLines: true };
export const PER_PAGE_CHOICES = [1, 2, 4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 28, 30, 35, 40, 48, 54, 63, 70] as const;

const MARGIN = 8;
const GAP = 4;

export interface Grid {
    cols: number;
    rows: number;
    pageW: number;
    pageH: number;
    cellW: number;
    cellH: number;
}

/** Chia trang A4 thành lưới đủ chỗ cho `perPage` mã, ô gần với hình dáng của loại mã nhất (QR gần vuông, mã vạch dài ngang) */
export const gridFor = (perPage: number, landscape: boolean, kind: CodeKind): Grid => {
    const pageW = landscape ? 297 : 210;
    const pageH = landscape ? 210 : 297;
    const target = kind === 'barcode' ? 2.4 : kind === 'both' ? 0.8 : 0.9;
    const n = Math.max(1, Math.round(perPage));
    let best: Grid | null = null;
    let bestScore = Infinity;
    for (let cols = 1; cols <= n; cols += 1) {
        const rows = Math.ceil(n / cols);
        if (cols * (rows - 1) >= n) continue;
        const cellW = (pageW - MARGIN * 2 - GAP * (cols - 1)) / cols;
        const cellH = (pageH - MARGIN * 2 - GAP * (rows - 1)) / rows;
        const score = Math.abs(Math.log(cellW / cellH / target)) + (cols * rows - n) * 0.35;
        if (score < bestScore) {
            bestScore = score;
            best = { cols, rows, pageW, pageH, cellW, cellH };
        }
    }
    return best!;
};

/** Các mã theo thứ tự in (mỗi mã lặp theo số bản), chia theo trang */
export const pagesOf = <T extends Pick<CodeItem, 'copies'>>(items: T[], perPage: number): T[][] => {
    const all = items.flatMap(item => Array.from({ length: Math.max(1, Math.min(500, Math.round(item.copies) || 1)) }, () => item));
    const pages: T[][] = [];
    for (let i = 0; i < all.length; i += perPage) pages.push(all.slice(i, i + perPage));
    return pages;
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const round = (n: number) => Math.round(n * 100) / 100;

/** Phông chữ của trang mã (Roboto Condensed đủ nét thường và đậm, có sẵn trong app) */
export const FONT_CSS = '/fonts/google-fonts.css';

/** CSS của trang in, dùng chung cho xem trước trong app, xuất ảnh và in (cỡ chữ theo cỡ ô) */
/** Lề trong ô, cỡ tiêu đề và cỡ chữ nội dung (mm) theo cỡ ô */
const cellMetrics = (settings: Pick<PageSettings, 'kind'>, grid: Grid) => {
    const small = Math.min(grid.cellW, grid.cellH * (settings.kind === 'barcode' ? 2 : 1));
    const pad = round(Math.min(5, Math.max(1.5, small * 0.06)));
    const title = round(Math.min(9, Math.max(2.6, small * 0.085)));
    return { pad, title, text: round(Math.max(2.2, title * 0.72)) };
};

/** Vạch nhỏ nhất của mã vạch nhỏ hơn mức này (mm) thì máy quét khó đọc */
export const MIN_BAR_MM = 0.17;

/** Bề rộng vạch nhỏ nhất (mm) của mã vạch khi in trong ô của lưới */
export const barWidthMm = (content: string, settings: Pick<PageSettings, 'kind'>, grid: Grid): number => {
    const { pad } = cellMetrics(settings, grid);
    return (grid.cellW - pad * 2 - 0.6) / (code128Bars(content).modules + QUIET * 2);
};

/** Mã vạch quá dày ở cỡ ô đang chọn (rỗng là ổn) */
export const densityProblem = (item: Pick<CodeItem, 'content'>, settings: PageSettings): string => {
    if (settings.kind === 'qr' || itemProblem(item, settings.kind)) return '';
    const grid = gridFor(settings.perPage, settings.landscape, settings.kind);
    return barWidthMm(item.content.trim(), settings, grid) < MIN_BAR_MM
        ? 'Mã vạch dày quá ở cỡ này, máy quét khó đọc: chọn ít mã mỗi trang hơn, khổ ngang, hoặc dùng mã QR'
        : '';
};

export const pageCss = (settings: PageSettings, grid: Grid): string => {
    const { pad, title, text } = cellMetrics(settings, grid);
    return `
.tm-trang { width: ${grid.pageW}mm; height: ${grid.pageH}mm; box-sizing: border-box; padding: ${MARGIN}mm; display: grid;
  grid-template-columns: repeat(${grid.cols}, minmax(0, 1fr)); grid-template-rows: repeat(${grid.rows}, minmax(0, 1fr)); gap: ${GAP}mm;
  background: #fff; overflow: hidden; break-after: page; page-break-after: always; font-family: 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif; color: #000; }
.tm-trang:last-child { break-after: auto; page-break-after: auto; }
/* Bộ chọn phông của app ép phông cho mọi thẻ div bằng !important: trang mã giữ phông của bản in */
.tm-trang, .tm-trang * { font-family: 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif !important; }
.tm-o { display: flex; flex-direction: column; align-items: center; gap: ${round(pad * 0.5)}mm; min-width: 0; min-height: 0; box-sizing: border-box;
  padding: ${pad}mm; border-radius: 2mm; ${settings.cutLines ? 'border: 0.3mm dashed #9ca3af;' : 'border: 0.3mm solid transparent;'} }
.tm-td { width: 100%; font-weight: 700; font-size: ${title}mm; line-height: 1.15; text-align: center; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: none; }
.tm-ma { flex: 1 1 0; min-height: 0; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${round(pad * 0.6)}mm; }
.tm-qr { flex: 3 1 0; min-height: 0; width: 100%; display: flex; justify-content: center; }
.tm-qr svg { height: 100%; width: auto; max-width: 100%; aspect-ratio: 1; display: block; }
.tm-vach { flex: ${settings.kind === 'both' ? '1.2 1 0' : '0 1 auto'}; min-height: 0; width: 100%; ${settings.kind === 'barcode' ? `height: min(100%, ${round(grid.cellW * 0.42)}mm);` : ''} }
.tm-vach svg { width: 100%; height: 100%; display: block; }
.tm-nd { width: 100%; font-weight: 400; font-size: ${text}mm; line-height: 1.2; text-align: center; overflow-wrap: anywhere; flex: none;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tm-loi { font-size: ${text}mm; color: #b91c1c; text-align: center; }
`;
};

/** Một ô mã: tiêu đề, mã (QR, mã vạch hoặc cả hai), nội dung */
export const cellHtml = (item: Pick<CodeItem, 'title' | 'content'>, settings: PageSettings): string => {
    const content = item.content.trim();
    const problem = itemProblem(item, settings.kind);
    const title = item.title.trim() ? `<div class="tm-td">${escapeHtml(item.title.trim())}</div>` : '';
    const codes = problem
        ? `<div class="tm-loi">${escapeHtml(problem)}</div>`
        : `${settings.kind !== 'barcode' ? `<div class="tm-qr">${qrSvg(content)}</div>` : ''}${settings.kind !== 'qr' ? `<div class="tm-vach">${barcodeSvg(content)}</div>` : ''}`;
    const text = settings.showText ? `<div class="tm-nd">${escapeHtml(content)}</div>` : '';
    return `<div class="tm-o">${title}<div class="tm-ma">${codes}</div>${text}</div>`;
};

export const pageHtml = (page: Pick<CodeItem, 'title' | 'content'>[], settings: PageSettings): string =>
    // print-page: màn in đếm số trang theo lớp này
    `<div class="tm-trang print-page">${page.map(item => cellHtml(item, settings)).join('')}</div>`;

/** Tài liệu in đầy đủ: mỗi trang A4 một lưới mã */
export const printDocument = (items: CodeItem[], settings: PageSettings, title: string): string => {
    const grid = gridFor(settings.perPage, settings.landscape, settings.kind);
    const pages = pagesOf(items, settings.perPage);
    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<link href="${FONT_CSS}" rel="stylesheet">
<style>
@page { size: A4 ${settings.landscape ? 'landscape' : 'portrait'}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
${pageCss(settings, grid)}
</style>
</head>
<body>${pages.map(page => pageHtml(page, settings)).join('')}</body>
</html>`;
};

/** Tên file an toàn từ tiêu đề hoặc nội dung */
export const fileSlug = (text: string): string => text
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'ma';

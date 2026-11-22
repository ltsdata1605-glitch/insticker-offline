import { barcodeProblem, barcodeSvg, code128Bars, qrProblem, qrSvg, QUIET } from '../tao-ma/maCode';

// ---------- Mẫu tờ nhãn ----------

export type TemplateId = 'tomy-117' | 'tomy-105';

/**
 * Tờ nhãn Tomy khổ A5 (148 x 210 mm), đặt ngang khi in (210 x 148). Nhà bán ghi: Tomy 117 tem tròn đường kính 23 mm, 48 tem;
 * Tomy 105 tem chữ nhật 25 x 37 mm, 30 tem. Tem cắt sát nhau gần kín tờ (30 tem 25 x 37 không xếp vừa nếu có lề), nên mỗi tem
 * nằm giữa một ô chia đều tờ; lệch so với tờ thật thì chỉnh bằng phần Căn chỉnh.
 */
export interface LabelTemplate {
    id: TemplateId;
    name: string;
    shape: 'round' | 'rect';
    cols: number;
    rows: number;
    /** Kích thước tem (mm) */
    width: number;
    height: number;
    paperW: number;
    paperH: number;
}

export const TEMPLATES: Record<TemplateId, LabelTemplate> = {
    'tomy-117': { id: 'tomy-117', name: 'Tem tròn Tomy 117', shape: 'round', cols: 8, rows: 6, width: 23, height: 23, paperW: 210, paperH: 148 },
    'tomy-105': { id: 'tomy-105', name: 'Tem vuông Tomy 105', shape: 'rect', cols: 5, rows: 6, width: 37, height: 24, paperW: 210, paperH: 148 },
};

export const perSheet = (template: LabelTemplate): number => template.cols * template.rows;

/** Căn chỉnh khi in (mm): dịch cả lưới, và nới hoặc thu khoảng cách giữa các tem */
export interface Calibration {
    offsetX: number;
    offsetY: number;
    gapX: number;
    gapY: number;
}

export const NO_CALIBRATION: Calibration = { offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 };

/** Góc trên trái của tem thứ `index` trong tờ (mm, tính từ góc trên trái tờ đặt ngang) */
export const labelBox = (template: LabelTemplate, index: number, calibration: Calibration = NO_CALIBRATION) => {
    const col = index % template.cols;
    const row = Math.floor(index / template.cols) % template.rows;
    const pitchX = template.paperW / template.cols + calibration.gapX;
    const pitchY = template.paperH / template.rows + calibration.gapY;
    // Lưới đặt giữa tờ: nới khoảng cách thì hai mép lưới cùng giãn ra
    const startX = (template.paperW - pitchX * template.cols) / 2;
    const startY = (template.paperH - pitchY * template.rows) / 2;
    return {
        x: round2(startX + (col + 0.5) * pitchX - template.width / 2 + calibration.offsetX),
        y: round2(startY + (row + 0.5) * pitchY - template.height / 2 + calibration.offsetY),
        col,
        row,
    };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Nội dung tem ----------

export type LabelKind = 'text' | 'qr' | 'barcode';

export const KIND_TEXT: Record<LabelKind, string> = { text: 'Chữ', qr: 'Mã QR', barcode: 'Mã vạch' };

/**
 * Một tem. Chữ: ba dòng, dòng 1 to (ví dụ ngày 22/11, màu, ghi chú). Mã QR, mã vạch: `name` là tên sản phẩm, `code` là nội
 * dung mã; tem in tên, mã và dòng chữ của mã.
 */
export interface LabelCell {
    kind: LabelKind;
    line1: string;
    line2: string;
    line3: string;
    name: string;
    code: string;
}

export const emptyCell = (kind: LabelKind = 'text'): LabelCell => ({ kind, line1: '', line2: '', line3: '', name: '', code: '' });

export const isEmptyCell = (cell: LabelCell | null | undefined): boolean =>
    !cell || (cell.kind === 'text' ? !cell.line1.trim() && !cell.line2.trim() && !cell.line3.trim() : !cell.code.trim() && !cell.name.trim());

/** Vì sao tem không in được (rỗng là được) */
export const cellProblem = (cell: LabelCell): string => {
    if (cell.kind === 'text' || isEmptyCell(cell)) return '';
    const code = cell.code.trim();
    if (!code) return 'Chưa có nội dung mã';
    return cell.kind === 'qr' ? qrProblem(code) : barcodeProblem(code);
};

/** Vùng mã vạch trên tem (mm) */
const barcodeWidth = (template: LabelTemplate) => (template.shape === 'round' ? 17 : 33);

/** Mã vạch dài in trên tem nhỏ: vạch mảnh hơn mức máy quét đọc được */
export const densityProblem = (cell: LabelCell, template: LabelTemplate): string => {
    if (cell.kind !== 'barcode' || cellProblem(cell) || !cell.code.trim()) return '';
    const bar = barcodeWidth(template) / (code128Bars(cell.code.trim()).modules + QUIET * 2);
    return bar < 0.17 ? 'Mã vạch dài quá so với tem, máy quét khó đọc: rút ngắn mã hoặc dùng mã QR' : '';
};

// ---------- Tạo nhanh ----------

/** Đặt các tem vào danh sách ô từ vị trí `start` (đếm từ 0), ghi đè ô cũ; thiếu ô thì thêm */
export const placeCells = (cells: (LabelCell | null)[], start: number, labels: LabelCell[]): (LabelCell | null)[] => {
    const next = [...cells];
    while (next.length < start + labels.length) next.push(null);
    labels.forEach((label, i) => { next[start + i] = label; });
    return next;
};

export interface FifoRow {
    color: string;
    quantity: number;
    note: string;
}

export const FIFO_COLORS = ['Đen', 'Trắng', 'Bạc', 'Xanh', 'Vàng', 'Hồng', 'Tím'];

/** Tem FIFO: mỗi màu in đủ số lượng, dòng 1 ngày, dòng 2 màu, dòng 3 ghi chú (ví dụ dung lượng 8/128) */
export const fifoLabels = (date: string, rows: FifoRow[]): LabelCell[] => rows.flatMap(row => {
    const count = Math.max(0, Math.min(1000, Math.round(row.quantity) || 0));
    return Array.from({ length: count }, () => ({ ...emptyCell('text'), line1: date.trim(), line2: row.color.trim(), line3: row.note.trim() }));
});

/** Mã tự tăng: SP001, SP002… (giữ số chữ số của số bắt đầu) */
export const sequenceLabels = (kind: LabelKind, prefix: string, from: number, count: number, name: string): LabelCell[] => {
    const width = String(from).length;
    return Array.from({ length: Math.max(0, Math.min(1000, count)) }, (_, i) => {
        const code = `${prefix}${String(from + i).padStart(width, '0')}`;
        return kind === 'text' ? { ...emptyCell('text'), line1: code, line2: name } : { ...emptyCell(kind), name, code };
    });
};

/** Dòng đọc từ Excel: Tên sản phẩm, Mã, Số tem */
export interface SheetRow {
    name: string;
    code: string;
    count: number;
}

const norm = (text: unknown) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Đọc bảng Excel (mảng dòng): có dòng tiêu đề thì theo tên cột, không thì cột A tên, B mã, C số tem */
export const parseSheetRows = (rows: unknown[][]): SheetRow[] => {
    const header = (rows[0] ?? []).map(norm);
    const find = (...names: string[]) => header.findIndex(cell => names.some(name => cell === name || cell.startsWith(name)));
    const nameCol = find('ten san pham', 'ten', 'noi dung', 'san pham');
    const codeCol = find('ma vach', 'ma qr', 'ma', 'code', 'barcode');
    const countCol = find('so tem', 'so luong', 'sl');
    const hasHeader = nameCol >= 0 || codeCol >= 0;
    const [n, c, q] = hasHeader ? [nameCol, codeCol, countCol] : [0, 1, 2];
    return rows.slice(hasHeader ? 1 : 0)
        .map(row => ({
            name: n >= 0 ? String(row[n] ?? '').trim() : '',
            code: c >= 0 ? String(row[c] ?? '').trim() : '',
            count: q >= 0 && row[q] !== undefined && row[q] !== '' ? Math.max(0, Math.min(1000, Math.round(Number(row[q])) || 0)) : 1,
        }))
        .filter(row => (row.name || row.code) && row.count > 0);
};

/** Tem từ các dòng Excel theo loại đã chọn (chữ: dòng 1 tên, dòng 2 mã) */
export const sheetLabels = (rows: SheetRow[], kind: LabelKind): LabelCell[] => rows.flatMap(row => Array.from({ length: row.count }, () => (
    kind === 'text' ? { ...emptyCell('text'), line1: row.name || row.code, line2: row.name ? row.code : '' } : { ...emptyCell(kind), name: row.name, code: row.code || row.name }
)));

// ---------- Dựng tem ----------

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Cỡ chữ (mm) cho vừa bề ngang: chữ đứng hẹp, mỗi ký tự khoảng nửa cỡ chữ */
export const fitFont = (text: string, widthMm: number, baseMm: number, minMm = 1.6): number =>
    Math.max(minMm, Math.min(baseMm, Math.round((widthMm / Math.max(1, text.length * 0.52)) * 100) / 100));

/** Nội dung bên trong một tem (HTML), cỡ theo mm */
export const cellContentHtml = (cell: LabelCell, template: LabelTemplate): string => {
    const round = template.shape === 'round';
    // Vùng chữ: tem tròn hẹp dần về hai đầu nên chỉ dùng phần giữa
    const textWidth = round ? 18 : template.width - 3;
    const line = (text: string, base: number, bold: boolean) => text.trim()
        ? `<div class="tn-dong" style="font-size:${fitFont(text.trim(), textWidth, base)}mm;font-weight:${bold ? 700 : 400}">${escapeHtml(text.trim())}</div>` : '';
    if (cell.kind === 'text') {
        const sizes = round ? [5.2, 3.2, 3] : [5.6, 3.8, 3.3];
        return `<div class="tn-chu">${line(cell.line1, sizes[0], true)}${line(cell.line2, sizes[1], false)}${line(cell.line3, sizes[2], false)}</div>`;
    }
    const code = cell.code.trim();
    const problem = cellProblem(cell);
    if (problem) return `<div class="tn-loi">${escapeHtml(problem)}</div>`;
    const name = cell.name.trim();
    const small = (text: string, base: number, bold = false) => (text ? `<div class="tn-dong tn-nho" style="font-size:${fitFont(text, textWidth, base, 1.4)}mm;font-weight:${bold ? 700 : 400}">${escapeHtml(text)}</div>` : '');
    if (cell.kind === 'barcode') {
        const width = barcodeWidth(template);
        const height = round ? 6 : 9.5;
        return `<div class="tn-vach-o">${small(name, round ? 2 : 2.7, true)}<div class="tn-vach" style="width:${width}mm;height:${height}mm">${barcodeSvg(code)}</div>${small(code, round ? 2 : 2.6)}</div>`;
    }
    // Mã QR: tem tròn để mã giữa, chữ nhỏ bên dưới; tem vuông để mã bên trái, tên và mã bên phải
    if (round) {
        return `<div class="tn-qr-tron"><div class="tn-qr" style="width:12.5mm;height:12.5mm">${qrSvg(code)}</div>${small(name || code, 2)}</div>`;
    }
    return `<div class="tn-qr-ngang"><div class="tn-qr" style="width:19mm;height:19mm">${qrSvg(code)}</div><div class="tn-qr-chu">${name ? `<div class="tn-ten">${escapeHtml(name)}</div>` : ''}<div class="tn-ma">${escapeHtml(code)}</div></div></div>`;
};

/** CSS dùng chung cho xem trước và bản in */
export const LABEL_CSS = `
.tn-to, .tn-to * { font-family: 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif !important; }
.tn-to { position: relative; background: #fff; color: #000; overflow: hidden; }
.tn-tem { position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.tn-tem.tron { border-radius: 50%; }
.tn-khung { outline: 0.25mm dashed #94a3b8; outline-offset: -0.25mm; }
.tn-chu { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.12; width: 100%; }
.tn-dong { white-space: nowrap; overflow: hidden; max-width: 100%; }
.tn-nho { line-height: 1.15; }
.tn-vach-o, .tn-qr-tron { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5mm; width: 100%; }
.tn-vach svg, .tn-qr svg { width: 100%; height: 100%; display: block; }
.tn-qr-ngang { display: flex; align-items: center; gap: 1.2mm; width: 100%; padding: 0 1.2mm; box-sizing: border-box; }
.tn-qr { flex: none; }
.tn-qr-chu { min-width: 0; display: flex; flex-direction: column; gap: 0.8mm; }
.tn-ten { font-size: 2.7mm; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.tn-ma { font-size: 2.5mm; overflow-wrap: anywhere; line-height: 1.15; }
.tn-loi { font-size: 2mm; color: #b91c1c; text-align: center; padding: 1mm; }
.tn-so { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 3mm; color: #64748b; }
`;

/** Một tờ: các tem ở đúng vị trí; `outline` vẽ khung từng tem (xem trước, in thử khung) */
export const sheetHtml = (template: LabelTemplate, cells: (LabelCell | null)[], calibration: Calibration, options: { outline?: boolean; numbers?: boolean } = {}): string => {
    const items = Array.from({ length: perSheet(template) }, (_, index) => {
        const cell = cells[index];
        const empty = isEmptyCell(cell);
        if (empty && !options.outline) return '';
        const box = labelBox(template, index, calibration);
        const content = empty ? (options.numbers ? `<div class="tn-so">${index + 1}</div>` : '') : cellContentHtml(cell!, template);
        return `<div class="tn-tem${template.shape === 'round' ? ' tron' : ''}${options.outline ? ' tn-khung' : ''}" style="left:${box.x}mm;top:${box.y}mm;width:${template.width}mm;height:${template.height}mm">${content}</div>`;
    }).join('');
    return `<div class="tn-to print-page" style="width:${template.paperW}mm;height:${template.paperH}mm">${items}</div>`;
};

/** Chia danh sách ô thành từng tờ; bỏ các tờ cuối không có tem nào */
export const sheetsOf = (cells: (LabelCell | null)[], template: LabelTemplate): (LabelCell | null)[][] => {
    const size = perSheet(template);
    let last = cells.length - 1;
    while (last >= 0 && isEmptyCell(cells[last])) last -= 1;
    const count = Math.max(1, Math.ceil((last + 1) / size));
    return Array.from({ length: count }, (_, i) => cells.slice(i * size, (i + 1) * size));
};

/** Tài liệu in khổ A5 ngang, mỗi tờ một trang. `testFrame`: chỉ in khung và số thứ tự để áp lên tờ nhãn kiểm tra vị trí. */
export const printDocument = (template: LabelTemplate, cells: (LabelCell | null)[], calibration: Calibration, fontCss: string, testFrame = false): string => {
    const sheets = testFrame ? [[]] : sheetsOf(cells, template);
    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(template.name)}</title>
<link href="${fontCss}" rel="stylesheet">
<style>
@page { size: A5 landscape; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.tn-to { break-after: page; page-break-after: always; }
.tn-to:last-child { break-after: auto; page-break-after: auto; }
${LABEL_CSS}
</style>
</head>
<body>${sheets.map(sheet => sheetHtml(template, sheet, calibration, testFrame ? { outline: true, numbers: true } : {})).join('')}</body>
</html>`;
};

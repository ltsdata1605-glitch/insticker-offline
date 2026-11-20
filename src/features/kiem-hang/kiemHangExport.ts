import type { KiemHangSession, ScanResultKind } from './kiemHangData';
import { lineState, sessionTitle, totalsOf } from './kiemHangData';

const STATE_TEXT = { pending: 'Chưa kiểm', partial: 'Thiếu', ok: 'Đủ', over: 'Thừa' } as const;

const KIND_TEXT: Record<ScanResultKind, string> = {
    'ok': 'Đã cộng',
    'over': 'Thừa',
    'imei-ok': 'IMEI khớp',
    'imei-dup': 'IMEI đã quét rồi',
    'imei-unknown': 'IMEI không có trong hoá đơn',
    'need-imei': 'Chờ quét IMEI',
    'unknown': 'Mã không có trong danh sách',
};

const pad = (n: number) => String(n).padStart(2, '0');
export const timeText = (ms: number): string => {
    const d = new Date(ms);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export interface ExportSheet {
    name: string;
    rows: (string | number)[][];
    /** Độ rộng cột (số ký tự) */
    widths: number[];
}

/** Dữ liệu các trang của file Excel kết quả kiểm. Mã sản phẩm và IMEI để dạng chữ để không mất số 0 đầu. */
export const buildExportSheets = (session: KiemHangSession): ExportSheet[] => {
    const byInvoice = new Map(session.invoices.map(invoice => [invoice.transferId, invoice]));
    const invoiceNo = (transferId: string) => byInvoice.get(transferId)?.invoiceNo ?? '';
    const all = totalsOf(session.lines, session.received);

    const summary: ExportSheet = {
        name: 'Tổng hợp',
        widths: [14, 22, 22, 34, 18, 10, 22, 12, 12, 10, 10, 12],
        rows: [
            ['Số hoá đơn', 'Mã phiếu chuyển', 'MYC', 'Kho chuyển', 'Ngày tạo', 'User chuyển', 'Tên user chuyển', 'SL theo file', 'Đã nhận', 'Thiếu', 'Thừa', 'Kết quả'],
            ...session.invoices.map(invoice => {
                const lines = session.lines.filter(line => line.transferId === invoice.transferId);
                const t = totalsOf(lines, session.received);
                const result = !invoice.hasDetail ? 'Chưa có file chi tiết' : t.missing === 0 && t.extra === 0 ? 'Đủ' : [t.missing && `Thiếu ${t.missing}`, t.extra && `Thừa ${t.extra}`].filter(Boolean).join(', ');
                return [invoice.invoiceNo, invoice.transferId, invoice.orderId, invoice.fromStoreId ? `${invoice.fromStoreId} - ${invoice.fromStoreName}` : invoice.fromStoreName,
                    invoice.createdAt, invoice.user, invoice.userName, t.expected, t.received, t.missing, t.extra, result];
            }),
            ['Tổng', '', '', '', '', '', '', all.expected, all.received, all.missing, all.extra,
                all.missing === 0 && all.extra === 0 ? 'Đủ' : [all.missing && `Thiếu ${all.missing}`, all.extra && `Thừa ${all.extra}`].filter(Boolean).join(', ')],
        ],
    };

    const detailHeader = ['Số hoá đơn', 'Mã sản phẩm', 'Tên sản phẩm', 'IMEI', 'SL theo file', 'SL thực nhận', 'Chênh lệch', 'Kết quả',
        'Trạng thái SP', 'Nhóm', 'MYC', 'Ngày tạo', 'User chuyển', 'Tên user chuyển', 'Mã kho chuyển', 'Tên kho chuyển', 'Mã phiếu chuyển'];
    const detailWidths = [12, 16, 48, 22, 11, 12, 11, 11, 12, 22, 22, 17, 11, 20, 13, 32, 20];
    const detailRow = (line: KiemHangSession['lines'][number]) => {
        const got = session.received[line.key] ?? 0;
        return [invoiceNo(line.transferId), line.code, line.name, line.imei, line.expected, got, got - line.expected, STATE_TEXT[lineState(line.expected, got)],
            line.status, line.group, line.orderId, line.createdAt, line.user, line.userName, line.fromStoreId, line.fromStoreName, line.transferId];
    };
    const detail: ExportSheet = { name: 'Chi tiết', widths: detailWidths, rows: [detailHeader, ...session.lines.map(detailRow)] };
    const diff: ExportSheet = {
        name: 'Thiếu thừa',
        widths: detailWidths,
        rows: [detailHeader, ...session.lines.filter(line => (session.received[line.key] ?? 0) !== line.expected).map(detailRow)],
    };

    const unknown: ExportSheet = {
        name: 'Mã lạ',
        widths: [26, 10, 18, 9, 20],
        rows: [
            ['Mã hoặc IMEI đã quét', 'Loại', 'Khi đang chờ IMEI của mã', 'Số lần', 'Lần cuối'],
            ...session.unknown.map(entry => [entry.value, entry.type === 'imei' ? 'IMEI lạ' : 'Mã lạ', entry.forCode ?? '', entry.count, timeText(entry.lastAt)]),
        ],
    };

    const lineByKey = new Map(session.lines.map(line => [line.key, line]));
    const log: ExportSheet = {
        name: 'Nhật ký quét',
        widths: [20, 26, 26, 8, 12, 16, 44],
        rows: [
            ['Thời gian', 'Nội dung quét', 'Kết quả', 'SL', 'Số hoá đơn', 'Mã sản phẩm', 'Tên sản phẩm'],
            ...session.log.map(event => {
                const line = event.lineKey ? lineByKey.get(event.lineKey) : undefined;
                const kind = event.manual ? (event.qty >= 0 ? 'Sửa tay: tăng' : 'Sửa tay: giảm') : KIND_TEXT[event.kind];
                return [timeText(event.at), event.input, kind, event.qty, line ? invoiceNo(line.transferId) : '', line?.code ?? '', line?.name ?? ''];
            }),
        ],
    };

    return [summary, detail, diff, unknown, log];
};

const safeName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 60);

export const exportFileName = (session: KiemHangSession, now = new Date()): string => {
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `Kiem_hang_${safeName(sessionTitle(session).replace(/^Chứng từ /, ''))}_${stamp}.xlsx`;
};

/** Tải file Excel kết quả kiểm về thư mục Tải về. */
export const exportSessionToExcel = async (session: KiemHangSession): Promise<string> => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const sheet of buildExportSheets(session)) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        ws['!cols'] = sheet.widths.map(wch => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    const fileName = exportFileName(session);
    XLSX.writeFile(wb, fileName);
    return fileName;
};


/**
 * Báo cáo kiểm hàng: từng MYC (mã yêu cầu chuyển) đã đủ hay chưa, thiếu bao nhiêu sản phẩm thuộc bao nhiêu nhóm hàng, danh
 * sách cụ thể, thông tin kho và người chuyển. Dùng để gửi nhanh cho người chuyển khi hàng chuyển thiếu.
 */
import type { KiemHangInvoice, KiemHangLine, KiemHangSession, Totals, UnknownEntry } from './kiemHangData';
import { sessionTitle, timeText, totalsOf } from './kiemHangData';

export interface ReportItem {
    line: KiemHangLine;
    received: number;
    /** Âm là thiếu, dương là thừa */
    diff: number;
}

export interface ReportGroup {
    name: string;
    missing: number;
    extra: number;
    items: ReportItem[];
}

export interface InvoiceReport {
    invoice: KiemHangInvoice;
    totals: Totals;
    /** Đủ đúng số lượng, không thiếu không thừa */
    complete: boolean;
    /** Nhóm hàng có dòng thiếu hoặc thừa */
    groups: ReportGroup[];
    missingGroups: number;
}

export interface SessionReport {
    title: string;
    at: number;
    totals: Totals;
    invoices: InvoiceReport[];
    completeCount: number;
    /** Số nhóm hàng có thiếu, tính trên cả phiên */
    missingGroups: number;
    unknown: UnknownEntry[];
    /** Thông tin chung, gộp từ các hoá đơn. Nhiều giá trị khác nhau thì nối bằng dấu phẩy. */
    fromStores: string[];
    toStores: string[];
    senders: string[];
    vouchers: string[];
}

const distinct = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];

export const fromStoreText = (invoice: KiemHangInvoice): string =>
    invoice.fromStoreId && !invoice.fromStoreName.startsWith(invoice.fromStoreId) ? `${invoice.fromStoreId} - ${invoice.fromStoreName}` : invoice.fromStoreName;

export const senderText = (invoice: KiemHangInvoice): string => [invoice.user, invoice.userName].filter(Boolean).join(' - ');

export const mycText = (invoice: KiemHangInvoice): string => invoice.orderId || invoice.transferId;

export const buildReport = (session: KiemHangSession, at = Date.now()): SessionReport => {
    const invoices = session.invoices.filter(invoice => invoice.hasDetail).map((invoice): InvoiceReport => {
        const lines = session.lines.filter(line => line.transferId === invoice.transferId);
        const totals = totalsOf(lines, session.received);
        const byGroup = new Map<string, ReportGroup>();
        for (const line of lines) {
            const received = session.received[line.key] ?? 0;
            const diff = received - line.expected;
            if (diff === 0) continue;
            const name = line.group || 'Chưa có nhóm';
            const group = byGroup.get(name) ?? { name, missing: 0, extra: 0, items: [] };
            if (diff < 0) group.missing += -diff;
            else group.extra += diff;
            group.items.push({ line, received, diff });
            byGroup.set(name, group);
        }
        const groups = [...byGroup.values()];
        return {
            invoice,
            totals,
            complete: totals.missing === 0 && totals.extra === 0,
            groups,
            missingGroups: groups.filter(group => group.missing > 0).length,
        };
    });
    const missingGroupNames = new Set(invoices.flatMap(item => item.groups.filter(group => group.missing > 0).map(group => group.name)));
    return {
        title: sessionTitle(session),
        at,
        totals: totalsOf(session.lines, session.received),
        invoices,
        completeCount: invoices.filter(item => item.complete).length,
        missingGroups: missingGroupNames.size,
        unknown: session.unknown,
        fromStores: distinct(session.invoices.map(fromStoreText)),
        toStores: distinct(session.invoices.map(invoice => invoice.toStoreName)),
        senders: distinct(session.invoices.map(senderText)),
        vouchers: distinct(session.invoices.map(invoice => invoice.transportVoucher)),
    };
};

const n = (value: number) => value.toLocaleString('vi-VN');

/** Một câu tóm tắt kết quả cả phiên. */
export const reportSummary = (report: SessionReport): string => {
    const { totals } = report;
    const parts = [`${report.completeCount}/${report.invoices.length} MYC đủ hàng`];
    if (totals.missing) parts.push(`thiếu ${n(totals.missing)} sản phẩm thuộc ${report.missingGroups} nhóm`);
    if (totals.extra) parts.push(`thừa ${n(totals.extra)} sản phẩm`);
    const unknown = report.unknown.reduce((sum, entry) => sum + entry.count, 0);
    if (unknown) parts.push(`${unknown} mã không có trong phiếu`);
    return `${parts.join(', ')}.`;
};

const invoiceHeading = (item: InvoiceReport): string => {
    const ids = [item.invoice.invoiceNo && `HĐ ${item.invoice.invoiceNo}`, `phiếu ${item.invoice.transferId}`].filter(Boolean).join(', ');
    return `MYC ${mycText(item.invoice)} (${ids})`;
};

/** Nội dung chữ để dán vào Zalo, tin nhắn hoặc email gửi người chuyển. */
export const reportText = (report: SessionReport, options: { onlyProblems?: boolean } = {}): string => {
    const out: string[] = [];
    out.push(`BÁO CÁO KIỂM HÀNG NHẬN - ${timeText(report.at).slice(0, 16)}`);
    if (report.fromStores.length) out.push(`Kho chuyển: ${report.fromStores.join(', ')}`);
    if (report.toStores.length) out.push(`Kho nhận: ${report.toStores.join(', ')}`);
    if (report.senders.length) out.push(`Người chuyển: ${report.senders.join(', ')}`);
    if (report.vouchers.length) out.push(`Chứng từ vận chuyển: ${report.vouchers.join(', ')}`);
    out.push(`Kết quả: ${reportSummary(report)} Đã nhận ${n(report.totals.received)}/${n(report.totals.expected)} sản phẩm.`);

    for (const item of report.invoices) {
        if (options.onlyProblems && item.complete) continue;
        out.push('');
        const t = item.totals;
        if (item.complete) {
            out.push(`[ĐỦ] ${invoiceHeading(item)}: ${n(t.received)}/${n(t.expected)}`);
            continue;
        }
        const status = [t.missing && `thiếu ${n(t.missing)} SP, ${item.missingGroups} nhóm`, t.extra && `thừa ${n(t.extra)} SP`].filter(Boolean).join('; ');
        out.push(`[CHƯA ĐỦ] ${invoiceHeading(item)}: nhận ${n(t.received)}/${n(t.expected)}, ${status}`);
        const sender = senderText(item.invoice);
        if (report.senders.length > 1 && sender) out.push(`Người chuyển: ${sender}`);
        for (const group of item.groups) {
            out.push(`* Nhóm ${group.name}:`);
            for (const { line, received, diff } of group.items) {
                const what = diff < 0 ? `thiếu ${-diff}` : `thừa ${diff}`;
                out.push(`  - ${line.code} ${line.name}${line.imei ? ` (IMEI ${line.imei})` : ''}: ${what} (nhận ${received}/${line.expected})`);
            }
        }
    }
    if (report.unknown.length) {
        out.push('');
        out.push('Mã đã quét nhưng không có trong phiếu:');
        for (const entry of report.unknown) out.push(`  - ${entry.type === 'imei' ? 'IMEI ' : ''}${entry.value}${entry.count > 1 ? ` (${entry.count} lần)` : ''}`);
    }
    return out.join('\n');
};

/** Trang "Báo cáo" đầu file Excel: thông tin chung, bảng theo MYC, danh sách thiếu thừa theo nhóm. */
export const reportSheetRows = (report: SessionReport): (string | number)[][] => {
    const rows: (string | number)[][] = [
        ['Báo cáo kiểm hàng nhận', timeText(report.at)],
        ['Phiên kiểm', report.title],
        ['Kho chuyển', report.fromStores.join(', ')],
        ['Kho nhận', report.toStores.join(', ')],
        ['Người chuyển', report.senders.join(', ')],
        ['Chứng từ vận chuyển', report.vouchers.join(', ')],
        ['Kết quả', reportSummary(report)],
        [],
        ['MYC', 'Số hoá đơn', 'Mã phiếu chuyển', 'Ngày tạo', 'Người chuyển', 'SL theo file', 'Đã nhận', 'Thiếu', 'Thừa', 'Số nhóm thiếu', 'Nhóm thiếu', 'Trạng thái'],
        ...report.invoices.map(item => [
            mycText(item.invoice), item.invoice.invoiceNo, item.invoice.transferId, item.invoice.createdAt, senderText(item.invoice),
            item.totals.expected, item.totals.received, item.totals.missing, item.totals.extra, item.missingGroups,
            item.groups.filter(group => group.missing > 0).map(group => `${group.name} (${group.missing})`).join(', '),
            item.complete ? 'Đủ' : 'Chưa đủ',
        ]),
        [],
        ['Danh sách thiếu, thừa'],
        ['MYC', 'Số hoá đơn', 'Nhóm', 'Mã sản phẩm', 'Tên sản phẩm', 'IMEI', 'SL theo file', 'Đã nhận', 'Thiếu', 'Thừa'],
    ];
    for (const item of report.invoices) {
        for (const group of item.groups) {
            for (const { line, received, diff } of group.items) {
                rows.push([mycText(item.invoice), item.invoice.invoiceNo, group.name, line.code, line.name, line.imei, line.expected, received,
                    diff < 0 ? -diff : 0, diff > 0 ? diff : 0]);
            }
        }
    }
    return rows;
};

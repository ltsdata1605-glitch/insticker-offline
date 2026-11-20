/**
 * Kiểm hàng: đối chiếu hàng nhận thực tế với file Excel phiếu chuyển kho.
 *
 * Mỗi hoá đơn xuất ra hai loại file:
 *  - File chi tiết: mỗi dòng một sản phẩm (Mã sản phẩm, Tên, IMEI, Số lượng, ... STORECHANGEID).
 *  - File phiếu: một dòng tóm tắt (Mã phiếu chuyển, Số hóa đơn, Chứng từ vận chuyển...).
 * File chi tiết không ghi số hoá đơn, chỉ có STORECHANGEID (= Mã phiếu chuyển của file phiếu), nên app ghép hai loại theo mã
 * này. Tên file do người dùng đặt nên không dùng để nhận hoá đơn.
 *
 * Phần này không đụng giao diện hay IndexedDB để kiểm thử được.
 */

export interface KiemHangLine {
    /** Khoá riêng của dòng trong phiên: mã phiếu chuyển + số thứ tự dòng trong file */
    key: string;
    transferId: string;
    code: string;
    name: string;
    /** IMEI ghi trong file, rỗng nếu sản phẩm không quản lý IMEI */
    imei: string;
    expected: number;
    unit: string;
    /** INVENTORYSTATUSNAME */
    status: string;
    /** SUBGROUPNAME */
    group: string;
    /** STORECHANGEORDERID (mã yêu cầu chuyển, MYC) */
    orderId: string;
    /** DATECREATE, dạng dd/mm/yyyy HH:mm */
    createdAt: string;
    /** STORECHANGEUSER */
    user: string;
    /** FULLNAME của người chuyển */
    userName: string;
    fromStoreId: string;
    fromStoreName: string;
}

export interface KiemHangInvoice {
    transferId: string;
    /** Số hóa đơn, lấy từ file phiếu. Rỗng khi chưa nhập file phiếu. */
    invoiceNo: string;
    transportVoucher: string;
    orderId: string;
    createdAt: string;
    user: string;
    userName: string;
    fromStoreId: string;
    fromStoreName: string;
    toStoreName: string;
    /** Đã có file chi tiết chưa. Chỉ nhập file phiếu thì chưa có dòng sản phẩm nào để kiểm. */
    hasDetail: boolean;
    fileNames: string[];
}

export type ScanResultKind =
    | 'ok'          // mã có trong danh sách, đã cộng
    | 'over'        // mã có nhưng đã đủ, tính là thừa
    | 'imei-ok'     // IMEI khớp
    | 'imei-dup'    // IMEI đã quét rồi
    | 'imei-unknown'// đang chờ IMEI mà IMEI không có trong file
    | 'need-imei'   // mã của sản phẩm có IMEI: chờ quét IMEI
    | 'unknown';    // mã không có trong danh sách

export interface ScanEvent {
    at: number;
    input: string;
    kind: ScanResultKind;
    /** Dòng hiện trên thông báo kết quả */
    lineKey?: string;
    /** Tổng số cộng thêm (âm khi sửa giảm bằng tay) */
    qty: number;
    /** Số cộng vào từng dòng, để hoàn tác trả lại đúng như cũ */
    split?: Record<string, number>;
    /** Sửa số lượng bằng tay, không phải quét */
    manual?: boolean;
}

export interface UnknownEntry {
    value: string;
    /** Mã lạ hay IMEI lạ */
    type: 'code' | 'imei';
    /** Mã sản phẩm đang chờ IMEI, khi type = imei */
    forCode?: string;
    count: number;
    lastAt: number;
}

export interface KiemHangSession {
    id: string;
    createdAt: number;
    updatedAt: number;
    finishedAt?: number;
    invoices: KiemHangInvoice[];
    lines: KiemHangLine[];
    /** Số thực nhận theo khoá dòng */
    received: Record<string, number>;
    unknown: UnknownEntry[];
    log: ScanEvent[];
}

/** So khớp tên cột: bỏ dấu, đ thành d, bỏ khoảng trắng thừa, chữ thường. "Số hóa đơn" và "Số hoá đơn" là một. */
export const headerKey = (value: unknown): string =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

/** Mã sản phẩm, IMEI và mã phiếu trong file có khoảng trắng thừa ở cuối. So khớp không phân biệt hoa thường. */
export const normalizeScan = (value: unknown): string => String(value ?? '').replace(/\s+/g, '').toUpperCase();

const text = (value: unknown): string => String(value ?? '').trim();

const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày trong file là số ngày kiểu Excel (46343.43...). Ô đã là chữ thì giữ nguyên. */
export const excelDateText = (value: unknown): string => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        // Ngày 0 của Excel là 30/12/1899 (đã tính lỗi năm nhuận 1900)
        const ms = Math.round((value - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
    return text(value);
};

const toQuantity = (value: unknown): number => {
    const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Kết quả đọc một file */
export type ParsedFile =
    | { kind: 'detail'; fileName: string; transferIds: string[]; lines: KiemHangLine[] }
    | { kind: 'summary'; fileName: string; invoices: Pick<KiemHangInvoice, 'transferId' | 'invoiceNo' | 'transportVoucher' | 'fromStoreName' | 'toStoreName' | 'createdAt'>[] }
    | { kind: 'invalid'; fileName: string; reason: string };

const DETAIL_COLUMNS = {
    code: 'ma san pham',
    name: 'ten san pham',
    imei: 'imei',
    quantity: 'so luong',
    unit: 'don vi tinh',
    status: 'inventorystatusname',
    group: 'subgroupname',
    orderId: 'storechangeorderid',
    createdAt: 'datecreate',
    user: 'storechangeuser',
    userName: 'fullname',
    fromStoreId: 'fromstoreid',
    fromStoreName: 'fromstorename',
    transferId: 'storechangeid',
} as const;

const SUMMARY_COLUMNS = {
    transferId: 'ma phieu chuyen',
    invoiceNo: 'so hoa don',
    from: 'kho xuat',
    to: 'kho nhap',
    date: 'ngay chuyen kho',
    voucher: 'chung tu van chuyen',
} as const;

const findHeader = (rows: unknown[][], required: string[]): { index: number; cols: Map<string, number> } | null => {
    for (let index = 0; index < Math.min(rows.length, 15); index++) {
        const cols = new Map<string, number>();
        rows[index].forEach((cell, col) => {
            const key = headerKey(cell);
            if (key && !cols.has(key)) cols.set(key, col);
        });
        if (required.every(name => cols.has(name))) return { index, cols };
    }
    return null;
};

/** Đọc bảng của trang đầu (mảng các hàng) thành dòng sản phẩm hoặc thông tin phiếu. */
export const parseSheetRows = (fileName: string, rows: unknown[][]): ParsedFile => {
    const detail = findHeader(rows, [DETAIL_COLUMNS.code, DETAIL_COLUMNS.quantity, DETAIL_COLUMNS.transferId]);
    if (detail) {
        const get = (row: unknown[], name: string) => {
            const col = detail.cols.get(name);
            return col === undefined ? '' : row[col];
        };
        const lines: KiemHangLine[] = [];
        rows.slice(detail.index + 1).forEach((row, rowIndex) => {
            const code = normalizeScan(get(row, DETAIL_COLUMNS.code));
            if (!code || headerKey(code) === DETAIL_COLUMNS.code.replace(/ /g, '')) return;
            const transferId = normalizeScan(get(row, DETAIL_COLUMNS.transferId));
            const imei = text(get(row, DETAIL_COLUMNS.imei));
            lines.push({
                key: `${transferId}#${rowIndex + 1}`,
                transferId,
                code,
                name: text(get(row, DETAIL_COLUMNS.name)),
                imei,
                // Dòng có IMEI là một chiếc. File mẫu luôn ghi số lượng 1 cho dòng này.
                expected: imei ? 1 : toQuantity(get(row, DETAIL_COLUMNS.quantity)),
                unit: text(get(row, DETAIL_COLUMNS.unit)),
                status: text(get(row, DETAIL_COLUMNS.status)),
                group: text(get(row, DETAIL_COLUMNS.group)),
                orderId: text(get(row, DETAIL_COLUMNS.orderId)),
                createdAt: excelDateText(get(row, DETAIL_COLUMNS.createdAt)),
                user: text(get(row, DETAIL_COLUMNS.user)),
                userName: text(get(row, DETAIL_COLUMNS.userName)),
                fromStoreId: text(get(row, DETAIL_COLUMNS.fromStoreId)),
                fromStoreName: text(get(row, DETAIL_COLUMNS.fromStoreName)),
            });
        });
        const valid = lines.filter(line => line.expected > 0);
        if (valid.length === 0) return { kind: 'invalid', fileName, reason: 'không có dòng sản phẩm nào' };
        return { kind: 'detail', fileName, transferIds: [...new Set(valid.map(line => line.transferId))], lines: valid };
    }

    const summary = findHeader(rows, [SUMMARY_COLUMNS.transferId, SUMMARY_COLUMNS.invoiceNo]);
    if (summary) {
        const get = (row: unknown[], name: string) => {
            const col = summary.cols.get(name);
            return col === undefined ? '' : row[col];
        };
        const invoices = rows.slice(summary.index + 1)
            .filter(row => {
                const id = text(get(row, SUMMARY_COLUMNS.transferId));
                // File phiếu lặp lại dòng tiêu đề ngay dưới tiêu đề
                return id && headerKey(id) !== SUMMARY_COLUMNS.transferId;
            })
            .map(row => ({
                transferId: normalizeScan(get(row, SUMMARY_COLUMNS.transferId)),
                invoiceNo: text(get(row, SUMMARY_COLUMNS.invoiceNo)),
                transportVoucher: text(get(row, SUMMARY_COLUMNS.voucher)),
                fromStoreName: text(get(row, SUMMARY_COLUMNS.from)),
                toStoreName: text(get(row, SUMMARY_COLUMNS.to)),
                createdAt: excelDateText(get(row, SUMMARY_COLUMNS.date)),
            }));
        if (invoices.length === 0) return { kind: 'invalid', fileName, reason: 'không có dòng phiếu chuyển nào' };
        return { kind: 'summary', fileName, invoices };
    }

    return { kind: 'invalid', fileName, reason: 'không phải file xuất từ phiếu chuyển kho (thiếu cột Mã sản phẩm hoặc Mã phiếu chuyển)' };
};

export const createSession = (now = Date.now()): KiemHangSession => ({
    id: `kh-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
    invoices: [],
    lines: [],
    received: {},
    unknown: [],
    log: [],
});

export interface MergeReport {
    /** Hoá đơn mới có dòng sản phẩm */
    added: string[];
    /** Hoá đơn đã có file chi tiết từ trước nên bỏ qua */
    duplicates: string[];
    /** File phiếu vừa gắn số hoá đơn */
    summaries: number;
    invalid: { fileName: string; reason: string }[];
}

const emptyInvoice = (transferId: string): KiemHangInvoice => ({
    transferId, invoiceNo: '', transportVoucher: '', orderId: '', createdAt: '', user: '', userName: '',
    fromStoreId: '', fromStoreName: '', toStoreName: '', hasDetail: false, fileNames: [],
});

/** Gộp các file vừa đọc vào phiên. Hoá đơn đã có file chi tiết thì bỏ qua file chi tiết trùng. */
export const mergeFiles = (session: KiemHangSession, files: ParsedFile[], now = Date.now()): { session: KiemHangSession; report: MergeReport } => {
    const report: MergeReport = { added: [], duplicates: [], summaries: 0, invalid: [] };
    const invoices = session.invoices.map(invoice => ({ ...invoice, fileNames: [...invoice.fileNames] }));
    const lines = [...session.lines];
    const byId = new Map(invoices.map(invoice => [invoice.transferId, invoice]));
    const ensure = (transferId: string) => {
        let invoice = byId.get(transferId);
        if (!invoice) {
            invoice = emptyInvoice(transferId);
            byId.set(transferId, invoice);
            invoices.push(invoice);
        }
        return invoice;
    };

    for (const file of files) {
        if (file.kind === 'invalid') {
            report.invalid.push({ fileName: file.fileName, reason: file.reason });
            continue;
        }
        if (file.kind === 'summary') {
            for (const info of file.invoices) {
                const invoice = ensure(info.transferId);
                invoice.invoiceNo = info.invoiceNo || invoice.invoiceNo;
                invoice.transportVoucher = info.transportVoucher || invoice.transportVoucher;
                invoice.toStoreName = info.toStoreName || invoice.toStoreName;
                if (!invoice.fromStoreName) invoice.fromStoreName = info.fromStoreName;
                if (!invoice.createdAt) invoice.createdAt = info.createdAt;
                if (!invoice.fileNames.includes(file.fileName)) invoice.fileNames.push(file.fileName);
            }
            report.summaries += 1;
            continue;
        }
        for (const transferId of file.transferIds) {
            const invoice = ensure(transferId);
            const label = invoice.invoiceNo || transferId;
            if (invoice.hasDetail) {
                report.duplicates.push(label);
                continue;
            }
            const fileLines = file.lines.filter(line => line.transferId === transferId);
            const first = fileLines[0];
            invoice.hasDetail = true;
            invoice.orderId = first.orderId;
            invoice.createdAt = first.createdAt || invoice.createdAt;
            invoice.user = first.user;
            invoice.userName = first.userName;
            invoice.fromStoreId = first.fromStoreId;
            invoice.fromStoreName = first.fromStoreName || invoice.fromStoreName;
            if (!invoice.fileNames.includes(file.fileName)) invoice.fileNames.push(file.fileName);
            lines.push(...fileLines);
            report.added.push(label);
        }
    }
    // Báo bằng số hoá đơn khi file phiếu đến sau file chi tiết
    report.added = report.added.map(label => byId.get(label)?.invoiceNo || label);
    // Hoá đơn xếp theo số hoá đơn, dòng sản phẩm theo thứ tự hoá đơn (để cộng dồn mã trùng theo đúng thứ tự này)
    const sortKey = (invoice: KiemHangInvoice) => invoice.invoiceNo || invoice.transferId;
    invoices.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'vi', { numeric: true }));
    const order = new Map(invoices.map((invoice, index) => [invoice.transferId, index]));
    const sortedLines = lines
        .map((line, index) => ({ line, index }))
        .sort((a, b) => (order.get(a.line.transferId)! - order.get(b.line.transferId)!) || a.index - b.index)
        .map(item => item.line);
    return { session: { ...session, invoices, lines: sortedLines, updatedAt: now }, report };
};

export const invoiceLabel = (invoice: Pick<KiemHangInvoice, 'invoiceNo' | 'transferId'>): string =>
    invoice.invoiceNo ? `HĐ ${invoice.invoiceNo}` : invoice.transferId;

export interface ScanOutcome {
    session: KiemHangSession;
    kind: ScanResultKind;
    line?: KiemHangLine;
    /** Số đã nhận / số theo file của cả mã (mọi hoá đơn) sau lần quét này */
    codeReceived?: number;
    codeExpected?: number;
    /** Mã sản phẩm đang chờ IMEI (kind = need-imei, hoặc imei-unknown khi đang chờ) */
    pendingCode?: string;
}

const addUnknown = (list: UnknownEntry[], value: string, type: UnknownEntry['type'], at: number, forCode?: string): UnknownEntry[] => {
    const found = list.find(entry => entry.value === value && entry.type === type);
    if (found) return list.map(entry => (entry === found ? { ...entry, count: entry.count + 1, lastAt: at, forCode: forCode ?? entry.forCode } : entry));
    return [...list, { value, type, forCode, count: 1, lastAt: at }];
};

const codeTotals = (session: KiemHangSession, code: string) => {
    let received = 0;
    let expected = 0;
    for (const line of session.lines) {
        if (line.code !== code) continue;
        expected += line.expected;
        received += session.received[line.key] ?? 0;
    }
    return { received, expected };
};

/**
 * Xử lý một lần quét hoặc nhập tay.
 *  - Trùng IMEI trong file: nhận chiếc đó.
 *  - Trùng mã sản phẩm không có IMEI: cộng `qty` vào dòng còn thiếu đầu tiên (theo thứ tự hoá đơn), đủ hết thì cộng vào dòng
 *    cuối và tính là thừa.
 *  - Trùng mã của sản phẩm có IMEI: chờ quét IMEI (`pendingCode`).
 *  - Đang chờ IMEI mà nhập giá trị không khớp IMEI nào: báo IMEI lạ.
 *  - Còn lại: mã lạ.
 */
export const applyScan = (session: KiemHangSession, rawInput: string, options: { qty?: number; pendingCode?: string; now?: number } = {}): ScanOutcome => {
    const at = options.now ?? Date.now();
    const input = normalizeScan(rawInput);
    const qty = Math.max(1, Math.floor(options.qty ?? 1));
    const event = (kind: ScanResultKind, lineKey?: string, split?: Record<string, number>): ScanEvent => ({
        at, input, kind, lineKey, qty: split ? Object.values(split).reduce((sum, n) => sum + n, 0) : 0, ...(split && { split }),
    });
    const withTotals = (next: KiemHangSession, kind: ScanResultKind, line: KiemHangLine, extra: Partial<ScanOutcome> = {}): ScanOutcome => {
        const totals = codeTotals(next, line.code);
        return { session: next, kind, line, codeReceived: totals.received, codeExpected: totals.expected, ...extra };
    };

    const imeiLine = session.lines.find(line => line.imei && normalizeScan(line.imei) === input);
    if (imeiLine) {
        if ((session.received[imeiLine.key] ?? 0) >= 1) {
            return withTotals({ ...session, log: [...session.log, event('imei-dup', imeiLine.key)], updatedAt: at }, 'imei-dup', imeiLine);
        }
        const split = { [imeiLine.key]: 1 };
        return withTotals({
            ...session,
            received: { ...session.received, [imeiLine.key]: 1 },
            log: [...session.log, event('imei-ok', imeiLine.key, split)],
            updatedAt: at,
        }, 'imei-ok', imeiLine);
    }

    const codeLines = session.lines.filter(line => line.code === input);
    const countable = codeLines.filter(line => !line.imei);
    if (countable.length > 0) {
        // Cộng vào các dòng còn thiếu theo thứ tự hoá đơn; đủ hết thì phần còn lại vào dòng cuối, tính là thừa
        const received = { ...session.received };
        const split: Record<string, number> = {};
        let remaining = qty;
        for (const line of countable) {
            const room = line.expected - (received[line.key] ?? 0);
            if (remaining <= 0 || room <= 0) continue;
            const take = Math.min(room, remaining);
            split[line.key] = take;
            remaining -= take;
        }
        const last = countable[countable.length - 1];
        if (remaining > 0) split[last.key] = (split[last.key] ?? 0) + remaining;
        for (const [key, n] of Object.entries(split)) received[key] = (received[key] ?? 0) + n;
        const kind: ScanResultKind = remaining > 0 ? 'over' : 'ok';
        const shown = countable.find(line => split[line.key]) ?? last;
        return withTotals({ ...session, received, log: [...session.log, event(kind, shown.key, split)], updatedAt: at }, kind, shown);
    }
    if (codeLines.length > 0) {
        return withTotals({ ...session, log: [...session.log, event('need-imei', codeLines[0].key)], updatedAt: at }, 'need-imei', codeLines[0], { pendingCode: input });
    }

    if (options.pendingCode) {
        const pendingLine = session.lines.find(line => line.code === options.pendingCode);
        return {
            session: { ...session, unknown: addUnknown(session.unknown, input, 'imei', at, options.pendingCode), log: [...session.log, event('imei-unknown', pendingLine?.key)], updatedAt: at },
            kind: 'imei-unknown',
            line: pendingLine,
            pendingCode: options.pendingCode,
        };
    }
    return { session: { ...session, unknown: addUnknown(session.unknown, input, 'code', at), log: [...session.log, event('unknown')], updatedAt: at }, kind: 'unknown' };
};

/** Sửa tay số thực nhận của một dòng. Dòng có IMEI chỉ nhận 0 hoặc 1. */
export const setReceived = (session: KiemHangSession, lineKey: string, value: number, now = Date.now()): KiemHangSession => {
    const line = session.lines.find(item => item.key === lineKey);
    if (!line) return session;
    const next = Math.max(0, Math.min(line.imei ? 1 : 9999, Math.floor(value)));
    const before = session.received[lineKey] ?? 0;
    if (next === before) return session;
    const received = { ...session.received, [lineKey]: next };
    if (next === 0) delete received[lineKey];
    const delta = next - before;
    return {
        ...session,
        received,
        log: [...session.log, { at: now, input: line.code, kind: 'ok', lineKey, qty: delta, split: { [lineKey]: delta }, manual: true }],
        updatedAt: now,
    };
};

/** Huỷ lần quét hoặc lần sửa gần nhất có làm thay đổi số liệu (cộng số, nhận IMEI, ghi mã lạ). */
export const undoLast = (session: KiemHangSession, now = Date.now()): { session: KiemHangSession; undone?: ScanEvent } => {
    for (let i = session.log.length - 1; i >= 0; i--) {
        const event = session.log[i];
        const log = session.log.filter((_, index) => index !== i);
        if (event.split) {
            const received = { ...session.received };
            for (const [key, n] of Object.entries(event.split)) {
                const value = (received[key] ?? 0) - n;
                if (value > 0) received[key] = value;
                else delete received[key];
            }
            return { session: { ...session, received, log, updatedAt: now }, undone: event };
        }
        if (event.kind === 'unknown' || event.kind === 'imei-unknown') {
            const type = event.kind === 'unknown' ? 'code' : 'imei';
            const unknown = session.unknown
                .map(entry => (entry.value === event.input && entry.type === type ? { ...entry, count: entry.count - 1 } : entry))
                .filter(entry => entry.count > 0);
            return { session: { ...session, unknown, log, updatedAt: now }, undone: event };
        }
    }
    return { session };
};

export type LineState = 'pending' | 'partial' | 'ok' | 'over';

export const lineState = (expected: number, received: number): LineState =>
    received === 0 ? 'pending' : received < expected ? 'partial' : received === expected ? 'ok' : 'over';

export interface Totals {
    expected: number;
    /** Đã nhận, không tính phần thừa */
    received: number;
    missing: number;
    extra: number;
    lines: number;
    doneLines: number;
}

export const totalsOf = (lines: KiemHangLine[], received: Record<string, number>): Totals => {
    const totals: Totals = { expected: 0, received: 0, missing: 0, extra: 0, lines: lines.length, doneLines: 0 };
    for (const line of lines) {
        const got = received[line.key] ?? 0;
        totals.expected += line.expected;
        totals.received += Math.min(got, line.expected);
        totals.missing += Math.max(0, line.expected - got);
        totals.extra += Math.max(0, got - line.expected);
        if (got >= line.expected) totals.doneLines += 1;
    }
    return totals;
};

/** Tên phiên: chứng từ vận chuyển nếu các hoá đơn chung một chứng từ, nếu không thì số hoá đơn. */
export const sessionTitle = (session: Pick<KiemHangSession, 'invoices'>): string => {
    const vouchers = [...new Set(session.invoices.map(invoice => invoice.transportVoucher).filter(Boolean))];
    if (vouchers.length === 1) return `Chứng từ ${vouchers[0]}`;
    const labels = session.invoices.map(invoiceLabel);
    if (labels.length === 0) return 'Phiên kiểm mới';
    return labels.length <= 3 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} và ${labels.length - 2} hoá đơn khác`;
};

export const unknownTotal = (session: Pick<KiemHangSession, 'unknown'>): number =>
    session.unknown.reduce((sum, entry) => sum + entry.count, 0);

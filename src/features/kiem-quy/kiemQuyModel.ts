/** Mệnh giá tiền Việt Nam đang dùng ở quầy, lớn trước */
export const DENOMINATIONS = [500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

/** Một lần kiểm quỹ: số tờ từng mệnh giá, tiền khác (xu, tiền lẻ ngoài bảng), số tiền theo sổ để đối chiếu */
export interface CashCount {
    id: string;
    /** Tên lần kiểm hoặc người kiểm, ví dụ "62864 - Phùng Minh Lâm" */
    name: string;
    note: string;
    /** Số tờ theo mệnh giá (khoá là mệnh giá) */
    counts: Record<string, number>;
    /** Tiền khác không đếm theo tờ */
    other: number;
    /** Số tiền theo sổ hoặc hệ thống; null là không đối chiếu */
    expected: number | null;
    createdAt: number;
    updatedAt: number;
    /** Lúc lưu vào lịch sử (lần lưu gần nhất) */
    savedAt?: number;
}

export const newCount = (now = Date.now()): CashCount => ({
    id: `quy-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    note: '',
    counts: {},
    other: 0,
    expected: null,
    createdAt: now,
    updatedAt: now,
});

const whole = (value: unknown): number => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1e13) : 0;
};

/** Dữ liệu đọc từ máy hoặc file sao lưu: thiếu thì bù, sai hẳn thì bỏ */
export const asCount = (value: unknown): CashCount | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<CashCount>;
    if (typeof raw.id !== 'string') return null;
    const counts: Record<string, number> = {};
    if (raw.counts && typeof raw.counts === 'object') {
        for (const [key, sheets] of Object.entries(raw.counts)) if (whole(sheets)) counts[key] = whole(sheets);
    }
    return {
        id: raw.id,
        name: typeof raw.name === 'string' ? raw.name : '',
        note: typeof raw.note === 'string' ? raw.note : '',
        counts,
        other: whole(raw.other),
        expected: raw.expected === null || raw.expected === undefined || raw.expected === ('' as unknown) ? null : whole(raw.expected),
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Number(raw.updatedAt) || Date.now(),
        savedAt: raw.savedAt ? Number(raw.savedAt) : undefined,
    };
};

export const sheetsOf = (count: Pick<CashCount, 'counts'>, denomination: number): number => count.counts[String(denomination)] ?? 0;

/** Tổng tiền thực tế đếm được: số tờ nhân mệnh giá, cộng tiền khác */
export const totalOf = (count: Pick<CashCount, 'counts' | 'other'>): number =>
    DENOMINATIONS.reduce((sum, d) => sum + d * sheetsOf(count, d), 0) + count.other;

export const sheetTotal = (count: Pick<CashCount, 'counts'>): number => DENOMINATIONS.reduce((sum, d) => sum + sheetsOf(count, d), 0);

/** Chênh lệch thực tế trừ theo sổ: dương là thừa, âm là thiếu; null khi không nhập số theo sổ */
export const diffOf = (count: Pick<CashCount, 'counts' | 'other' | 'expected'>): number | null =>
    count.expected === null ? null : totalOf(count) - count.expected;

export const diffText = (diff: number | null): string =>
    diff === null ? '' : diff === 0 ? 'Khớp sổ' : diff > 0 ? `Thừa ${formatMoney(diff)}` : `Thiếu ${formatMoney(-diff)}`;

/** Lần kiểm chưa nhập gì */
export const isBlank = (count: CashCount): boolean =>
    !count.name.trim() && !count.note.trim() && count.other === 0 && count.expected === null && Object.values(count.counts).every(n => !n);

export const formatMoney = (n: number): string => Math.round(n).toLocaleString('vi-VN');

/** Đọc số tiền gõ tay: bỏ dấu chấm, phẩy, khoảng trắng, chữ đ */
export const parseMoney = (text: string): number => {
    const digits = text.replace(/[^\d]/g, '');
    return digits ? Math.min(Number(digits), 1e13) : 0;
};

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

/** Đọc ba chữ số; `full` là có nhóm đứng trước nên phải đọc đủ "không trăm", "linh" */
const readGroup = (n: number, full: boolean): string => {
    const hundreds = Math.floor(n / 100);
    const tens = Math.floor((n % 100) / 10);
    const units = n % 10;
    const words: string[] = [];
    if (hundreds > 0 || full) words.push(DIGITS[hundreds], 'trăm');
    if (tens === 0) {
        if (units > 0 && (hundreds > 0 || full)) words.push('linh');
    } else if (tens === 1) {
        words.push('mười');
    } else {
        words.push(DIGITS[tens], 'mươi');
    }
    if (units > 0) {
        if (units === 1 && tens > 1) words.push('mốt');
        else if (units === 5 && tens > 0) words.push('lăm');
        else words.push(DIGITS[units]);
    }
    return words.join(' ');
};

/** Số tiền bằng chữ, ví dụ 1.250.000 → "Một triệu hai trăm năm mươi nghìn đồng" */
export const amountInWords = (amount: number): string => {
    let n = Math.round(Math.abs(amount));
    if (n === 0) return 'Không đồng';
    const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
    const groups: number[] = [];
    while (n > 0) {
        groups.push(n % 1000);
        n = Math.floor(n / 1000);
    }
    const parts: string[] = [];
    for (let i = groups.length - 1; i >= 0; i -= 1) {
        if (groups[i] === 0) continue;
        parts.push(`${readGroup(groups[i], i < groups.length - 1)}${units[i] ? ` ${units[i]}` : ''}`);
    }
    const text = `${parts.join(' ')} đồng`;
    return text.charAt(0).toUpperCase() + text.slice(1);
};

const pad = (n: number) => String(n).padStart(2, '0');
export const dateTimeText = (ms: number): string => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Báo cáo dạng chữ để dán vào Zalo */
export const reportText = (count: CashCount, at = count.savedAt ?? count.updatedAt): string => {
    const total = totalOf(count);
    const diff = diffOf(count);
    const lines = [`KIỂM QUỸ: ${count.name.trim() || 'Chưa đặt tên'}`, `Lúc ${dateTimeText(at)}`, ''];
    for (const d of DENOMINATIONS) {
        const sheets = sheetsOf(count, d);
        if (sheets) lines.push(`${formatMoney(d)} x ${sheets} tờ = ${formatMoney(d * sheets)}`);
    }
    if (count.other) lines.push(`Tiền khác: ${formatMoney(count.other)}`);
    lines.push('', `Tổng thực tế: ${formatMoney(total)} đ (${sheetTotal(count)} tờ)`, `Bằng chữ: ${amountInWords(total)}`);
    if (count.expected !== null) lines.push(`Theo sổ: ${formatMoney(count.expected)} đ`, `Chênh lệch: ${diffText(diff)}`);
    if (count.note.trim()) lines.push(`Ghi chú: ${count.note.trim()}`);
    return lines.join('\n');
};

/** Lưu lần kiểm vào lịch sử: cùng mã thì thay (sửa lại lần đã lưu), mới thì đưa lên đầu */
export const upsertHistory = (history: CashCount[], count: CashCount, max = 500): CashCount[] =>
    [count, ...history.filter(item => item.id !== count.id)].slice(0, max);

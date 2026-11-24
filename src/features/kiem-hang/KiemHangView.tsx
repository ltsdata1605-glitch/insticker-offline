import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Button } from '../../components/shared/ui/Button';
import { TopBarActions } from '../../components/shared/ui/TopBarActions';
import { toast } from '../../components/shared/ui/toast';
import Scanner from '../sticker-event/Scanner';
import { beep } from './beep';
import type { KiemHangLine, KiemHangSession, ScanOutcome } from './kiemHangData';
import {
    applyScan, createSession, invoiceLabel, mergeFiles, sessionTitle, setReceived, totalsOf, undoLast, unknownTotal,
} from './kiemHangData';
import { exportSessionToExcel } from './kiemHangExport';
import { readExcelFiles } from './kiemHangFiles';
import { loadCurrent, loadHistory, MAX_HISTORY, saveCurrent, saveHistory } from './kiemHangStore';
import { KiemHangTable, UnknownTable } from './KiemHangTable';
import { CodeText } from './KiemHangCode';
import { KiemHangSidePanel } from './KiemHangSidePanel';
import { KiemHangHistoryDialog } from './KiemHangHistoryDialog';
import { KiemHangReportDialog } from './KiemHangReportDialog';

/** Lọc danh sách. "unknown" không lọc dòng hàng mà đổi bảng sang danh sách mã lạ. */
type StatusFilter = 'all' | 'checked' | 'notdone' | 'ok' | 'over' | 'imei' | 'unknown';

const FILTERS: { id: StatusFilter; label: string; test: (line: KiemHangLine, got: number) => boolean }[] = [
    { id: 'all', label: 'Tất cả', test: () => true },
    { id: 'checked', label: 'Đã kiểm', test: (_line, got) => got > 0 },
    { id: 'notdone', label: 'Chưa đủ', test: (line, got) => got < line.expected },
    { id: 'ok', label: 'Đủ', test: (line, got) => got === line.expected },
    { id: 'over', label: 'Thừa', test: (line, got) => got > line.expected },
    { id: 'imei', label: 'Có IMEI', test: line => Boolean(line.imei) },
    { id: 'unknown', label: 'Mã lạ', test: () => false },
];

/** Nút lọc cần chú ý mang màu của ô số liệu cùng tên: Chưa đủ cam, Thừa hồng, Mã lạ đỏ. */
const FILTER_TONE: Partial<Record<StatusFilter, { idle: string; active: string; selected: string }>> = {
    notdone: {
        idle: 'bg-orange-50 border-orange-200 text-orange-700 hover:border-orange-400',
        active: 'bg-orange-100 border-orange-400 text-orange-800 hover:bg-orange-200',
        selected: 'bg-orange-600 border-orange-600 text-white',
    },
    over: {
        idle: 'bg-rose-50 border-rose-200 text-rose-700 hover:border-rose-400',
        active: 'bg-rose-100 border-rose-400 text-rose-800 hover:bg-rose-200',
        selected: 'bg-rose-600 border-rose-600 text-white',
    },
    unknown: {
        idle: 'bg-red-50 border-red-200 text-red-700 hover:border-red-400',
        active: 'bg-red-100 border-red-400 text-red-800 hover:bg-red-200',
        selected: 'bg-red-600 border-red-600 text-white',
    },
};

const ACCEPT = '.xlsx,.xls,.xlsm,.csv';

interface Feedback {
    outcome: ScanOutcome;
    input: string;
    tick: number;
}

const IMEI_KINDS: ScanOutcome['kind'][] = ['imei-ok', 'imei-dup', 'imei-unknown'];

/**
 * Thẻ kết quả lần quét vừa rồi: xanh là nhận, vàng là cần chú ý, đỏ là sai phải quét lại, xanh dương là chờ IMEI.
 * Mã (hoặc IMEI) to hơn tên, 6 ký tự cuối đỏ và to nhất để dò nhanh với tem trên hộp.
 */
const ResultBanner: React.FC<{ feedback: Feedback | null; invoiceCount: number; invoiceOf: (transferId: string) => string }> = ({ feedback, invoiceCount, invoiceOf }) => {
    if (!feedback) {
        return (
            <div className="rounded-card border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-[14px] text-slate-500 flex items-center gap-2">
                <AppIcon name="scan" size="md" />
                Bắn mã sản phẩm hoặc IMEI bằng súng quét, hoặc gõ mã rồi bấm Enter.
            </div>
        );
    }
    const { outcome, input } = feedback;
    const line = outcome.line;
    const count = outcome.codeExpected !== undefined ? `${outcome.codeReceived}/${outcome.codeExpected}` : '';
    const where = line ? invoiceOf(line.transferId) : '';
    const isImei = IMEI_KINDS.includes(outcome.kind);
    const tone = {
        'ok': 'bg-emerald-50 border-emerald-300 text-emerald-900',
        'imei-ok': 'bg-emerald-50 border-emerald-300 text-emerald-900',
        'need-imei': 'bg-sky-50 border-sky-300 text-sky-900',
        'over': 'bg-amber-50 border-amber-300 text-amber-900',
        'imei-dup': 'bg-amber-50 border-amber-300 text-amber-900',
        'imei-unknown': 'bg-rose-50 border-rose-300 text-rose-900',
        'unknown': 'bg-rose-50 border-rose-300 text-rose-900',
    }[outcome.kind];
    const badgeTone = {
        'ok': 'bg-emerald-600', 'imei-ok': 'bg-emerald-600', 'need-imei': 'bg-sky-600', 'over': 'bg-amber-500',
        'imei-dup': 'bg-amber-500', 'imei-unknown': 'bg-rose-600', 'unknown': 'bg-rose-600',
    }[outcome.kind];
    const icon = outcome.kind === 'ok' || outcome.kind === 'imei-ok' ? 'success' : outcome.kind === 'need-imei' ? 'scan' : outcome.kind === 'unknown' || outcome.kind === 'imei-unknown' ? 'error' : 'warning';
    const badge = {
        'ok': 'Đã nhận',
        'imei-ok': 'IMEI khớp',
        'need-imei': 'Quét IMEI',
        'over': 'Thừa',
        'imei-dup': 'IMEI đã quét rồi',
        'imei-unknown': 'IMEI lạ',
        'unknown': 'Mã lạ',
    }[outcome.kind];
    // Dòng tên: sản phẩm của mã; mã lạ thì không có tên nên ghi lý do
    const title = outcome.kind === 'unknown' ? `Mã này không có trong ${invoiceCount} hoá đơn` : line?.name ?? '';
    const detail = {
        'ok': where,
        'imei-ok': [line?.code && `Mã ${line.code}`, where].filter(Boolean).join(' · '),
        'need-imei': 'Sản phẩm này có IMEI trong hoá đơn. Quét IMEI trên thân máy hoặc hộp để xác nhận. Bấm Esc để bỏ qua.',
        'over': 'Đã đủ số lượng theo file, đang nhận dư. Kiểm tra lại hàng hoặc bấm Hoàn tác.',
        'imei-dup': [line?.code && `Mã ${line.code}`, where].filter(Boolean).join(' · '),
        'imei-unknown': `Không khớp IMEI nào của ${line?.name ?? 'sản phẩm này'}. Quét lại IMEI.`,
        'unknown': 'Mã đã được ghi vào danh sách Mã lạ.',
    }[outcome.kind];
    // IMEI vừa quét, hoặc mã sản phẩm (mã lạ thì là mã vừa quét)
    const shown = isImei || outcome.kind === 'unknown' ? input : line?.code ?? input;
    return (
        <div
            key={feedback.tick}
            role={outcome.kind === 'unknown' || outcome.kind === 'imei-unknown' ? 'alert' : 'status'}
            data-testid="kiem-hang-ket-qua"
            data-kind={outcome.kind}
            className={`rounded-card border-2 px-4 py-2.5 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-150 ${tone}`}
        >
            <AppIcon name={icon} px={30} className="shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 min-w-0">
                    <span className={`shrink-0 self-center rounded-full px-2 py-0.5 text-[11px] font-black uppercase text-white ${badgeTone}`}>{badge}</span>
                    {isImei && <span className="shrink-0 text-[13px] font-bold opacity-70">IMEI</span>}
                    <CodeText
                        value={shown}
                        className="min-w-0 truncate text-[24px] font-bold leading-tight text-slate-900"
                        tailClassName="text-[34px] font-black text-rose-600"
                    />
                </p>
                {title && <p className="text-[15px] font-semibold leading-snug truncate">{title}</p>}
                {detail && <p className="text-[12px] opacity-80 truncate">{detail}</p>}
            </div>
            {count && outcome.kind !== 'unknown' && (
                // Số đã nhận / theo file cao gần bằng cả khung để nhìn từ xa vẫn thấy
                <div className="shrink-0 self-stretch flex flex-col items-end justify-center pl-3 border-l-2 border-current/15" data-testid="kiem-hang-dem">
                    <p className="text-[68px] font-black tabular-nums leading-[0.9] tracking-tight">{count}</p>
                    <p className="mt-1 text-[13px] font-bold uppercase opacity-80">{outcome.codeReceived === outcome.codeExpected ? 'Đủ' : (outcome.codeReceived ?? 0) > (outcome.codeExpected ?? 0) ? 'Thừa' : 'đã nhận / file'}</p>
                </div>
            )}
        </div>
    );
};

/** Màu của từng ô số: chữ luôn mang màu riêng; có số (khác 0) thì cả ô tô màu để dễ thấy. */
const KPI_TONE = {
    neutral: { label: 'text-slate-500', value: 'text-slate-900', alert: '' },
    good: { label: 'text-emerald-700', value: 'text-emerald-600', alert: '' },
    missing: { label: 'text-orange-700', value: 'text-orange-600', alert: 'bg-orange-50 border-orange-300' },
    extra: { label: 'text-rose-700', value: 'text-rose-600', alert: 'bg-rose-50 border-rose-300' },
    unknown: { label: 'text-red-700', value: 'text-red-600', alert: 'bg-red-50 border-red-400' },
} as const;

/** Ô số liệu, bấm vào thì lọc danh sách theo ô đó (như các nút lọc). */
const Kpi: React.FC<{ label: string; value: number; tone: keyof typeof KPI_TONE; selected: boolean; onClick: () => void; testId: string }> = ({ label, value, tone, selected, onClick, testId }) => {
    const style = KPI_TONE[tone];
    const alert = value > 0 && style.alert;
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            title={`Lọc danh sách: ${label}`}
            className={`text-left rounded-card border-2 px-3 py-1.5 transition-colors ${alert || 'bg-white border-slate-200'} ${selected ? '!border-sky-500 ring-2 ring-sky-200' : 'hover:border-sky-300'}`}
        >
            <span className={`flex items-center justify-between text-[12px] font-bold ${style.label}`}>
                {label}
                {selected && <AppIcon name="filter" size="xs" className="text-sky-600" />}
            </span>
            <span data-testid={testId} className={`block text-[24px] font-black tabular-nums leading-tight ${style.value}`}>{value.toLocaleString('vi-VN')}</span>
        </button>
    );
};

interface UnknownAlertState {
    value: string;
    kind: 'unknown' | 'imei-unknown';
    /** Sản phẩm đang chờ IMEI, khi là IMEI lạ */
    forName?: string;
}

/**
 * Báo mã lạ chặn màn: người kiểm phải tự nhấn Enter (hoặc bấm nút) mới quét tiếp, để không lỡ tay bắn tiếp mà bỏ quên sản
 * phẩm lạ. Súng quét cũng gõ Enter sau mỗi mã, nên Enter đi liền sau các ký tự vừa gõ (tức là vừa bắn thêm một mã) không
 * được tính: mã đó bị bỏ, màn báo phải xác nhận trước rồi quét lại.
 */
const UnknownAlert: React.FC<{
    alert: UnknownAlertState;
    invoiceCount: number;
    /** Ô quét đang có chữ (mã dán hoặc gõ vào) */
    hasTypedInput: () => boolean;
    /** Mã quét vào lúc chưa xác nhận đã bị bỏ: xoá chữ trong ô quét */
    onBlocked: () => void;
    onConfirm: () => void;
    onDiscard: () => void;
}> = ({ alert, invoiceCount, hasTypedInput, onBlocked, onConfirm, onDiscard }) => {
    const [blocked, setBlocked] = useState(0);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const handlers = useRef({ hasTypedInput, onBlocked, onConfirm });
    handlers.current = { hasTypedInput, onBlocked, onConfirm };

    useEffect(() => {
        confirmRef.current?.focus();
        let typed = '';
        const onKeyDown = (event: KeyboardEvent) => {
            // Phím tắt hệ thống (chép, thoát app...) vẫn dùng được; chỉ chặn hoàn tác để không đổi số khi màn báo đang mở
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() !== 'z') return;
            if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key !== 'Enter') {
                if (event.key.length === 1) typed += event.key;
                return;
            }
            if (event.repeat) return;
            if (typed || handlers.current.hasTypedInput()) {
                typed = '';
                handlers.current.onBlocked();
                setBlocked(count => count + 1);
                beep('error');
                return;
            }
            handlers.current.onConfirm();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, []);

    const imei = alert.kind === 'imei-unknown';
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-rose-950/60 p-6 backdrop-blur-sm">
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="kiem-hang-ma-la-tieu-de"
                aria-describedby="kiem-hang-ma-la-mo-ta"
                className="w-full max-w-xl overflow-hidden rounded-[20px] border-4 border-rose-500 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            >
                <div className="flex items-center gap-3 bg-rose-600 px-5 py-3 text-white">
                    <AppIcon name="alert" px={30} className="shrink-0 animate-pulse" />
                    <h2 id="kiem-hang-ma-la-tieu-de" className="text-[20px] font-black uppercase tracking-wide">
                        {imei ? 'IMEI lạ' : 'Mã lạ'}: không có trong hoá đơn
                    </h2>
                </div>
                <div className="space-y-3 px-5 py-4">
                    <p className="flex items-baseline gap-2 min-w-0">
                        {imei && <span className="shrink-0 text-[15px] font-bold text-slate-500">IMEI</span>}
                        <CodeText value={alert.value} className="min-w-0 truncate text-[30px] font-bold text-slate-900" tailClassName="text-[42px] font-black text-rose-600" />
                    </p>
                    <p id="kiem-hang-ma-la-mo-ta" className="text-[15px] leading-relaxed text-slate-700">
                        {imei
                            ? <>IMEI này không khớp chiếc nào của <b>{alert.forName ?? 'sản phẩm đang quét'}</b>.</>
                            : <>Mã này không có trong {invoiceCount} hoá đơn đang kiểm.</>}
                        {' '}Đã ghi vào danh sách <b>Mã lạ</b>. <b>Để riêng sản phẩm này ra</b> rồi nhấn <b>Enter</b> để quét tiếp.
                    </p>
                    {blocked > 0 && (
                        <p role="status" data-testid="ma-la-chan" className="rounded-control border-2 border-rose-300 bg-rose-50 px-3 py-2 text-[14px] font-semibold text-rose-800">
                            Vừa có mã quét vào nhưng chưa được tính. Nhấn Enter để xác nhận mã lạ trước, rồi quét lại sản phẩm đó.
                        </p>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                    <Button variant="secondary" onClick={onDiscard} title="Quét nhầm (ví dụ bắn nhầm mã vạch khác trên hộp): bỏ mã này khỏi danh sách Mã lạ">
                        Quét nhầm, bỏ mã này
                    </Button>
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={onConfirm}
                        className="inline-flex items-center gap-2 rounded-control bg-rose-600 px-4 h-11 text-[15px] font-bold text-white shadow hover:bg-rose-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-300"
                    >
                        Đã để riêng, quét tiếp
                        <kbd className="rounded border border-white/40 bg-white/15 px-1.5 text-[12px] font-bold">Enter</kbd>
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Màn trống: chọn hoặc kéo thả file Excel phiếu chuyển kho. */
const Landing: React.FC<{ onPick: () => void; onHistory: () => void; historyCount: number; dragging: boolean }> = ({ onPick, onHistory, historyCount, dragging }) => (
    <div className="h-full flex items-center justify-center p-6">
        <div className={`w-full max-w-xl rounded-[20px] border-2 border-dashed bg-white px-8 py-10 text-center transition-colors ${dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300'}`}>
            <div className="mx-auto w-16 h-16 rounded-[18px] bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-300/40">
                <AppIcon name="checklist" px={32} />
            </div>
            <h2 className="mt-4 text-[22px] font-black text-slate-900">Kiểm hàng nhận</h2>
            <p className="mt-2 text-[14px] text-slate-600 leading-relaxed">
                Kéo thả hoặc chọn các file Excel của phiếu chuyển kho. Chọn được nhiều file cùng lúc, cả file phiếu (có số hoá đơn)
                lẫn file chi tiết sản phẩm.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
                <Button size="lg" icon="upload" onClick={onPick}>Chọn file Excel</Button>
                {historyCount > 0 && <Button size="lg" variant="secondary" icon="history" onClick={onHistory}>Lịch sử ({historyCount})</Button>}
            </div>
            <p className="mt-4 text-[12px] text-slate-500">Sau đó bắn mã bằng súng quét, gõ tay, hoặc quét bằng camera. Kết quả tự lưu sau mỗi lần quét.</p>
        </div>
    </div>
);

export default function KiemHangView({ active }: { active: boolean }): React.JSX.Element {
    const [session, setSession] = useState<KiemHangSession | null>(null);
    const [history, setHistory] = useState<KiemHangSession[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [input, setInput] = useState('');
    const [qty, setQty] = useState(1);
    const [pendingCode, setPendingCode] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [scanFocused, setScanFocused] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [invoiceFilter, setInvoiceFilter] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [groupFilter, setGroupFilter] = useState('');
    /** Báo cáo đang xem: phiên đang kiểm (mở từ nút Báo cáo hoặc Kết thúc) hoặc một phiên trong lịch sử */
    const [reportOf, setReportOf] = useState<{ session: KiemHangSession; mode: 'view' | 'finish' } | null>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    /** Mã vừa quét: các dòng của mã này lên đầu danh sách, dòng vừa cộng tô sáng. Giữ nguyên khi lần sau là mã lạ. */
    const [focusLine, setFocusLine] = useState<{ key: string; code: string } | null>(null);
    const [unknownAlert, setUnknownAlert] = useState<UnknownAlertState | null>(null);
    // Chặn quét ngay khi vừa báo mã lạ, không chờ vẽ lại (súng quét bắn rất nhanh, camera cũng gọi liên tục)
    const alertOpenRef = useRef(false);
    const scanRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const tickRef = useRef(0);
    // Giữ bản mới nhất cho các lần quét liên tiếp nhanh hơn một lần vẽ lại
    const sessionRef = useRef<KiemHangSession | null>(null);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([loadCurrent(), loadHistory()]).then(([current, saved]) => {
            if (cancelled) return;
            sessionRef.current = current;
            setSession(current);
            setHistory(saved);
            setLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const commit = useCallback((next: KiemHangSession | null) => {
        sessionRef.current = next;
        setSession(next);
        void saveCurrent(next);
    }, []);

    const commitHistory = useCallback((next: KiemHangSession[]) => {
        const trimmed = next.slice(0, MAX_HISTORY);
        setHistory(trimmed);
        void saveHistory(trimmed);
    }, []);

    const focusScan = useCallback(() => {
        window.setTimeout(() => scanRef.current?.focus(), 0);
    }, []);


    const importFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
        const parsed = await readExcelFiles(files);
        // Phiên mới lấy tên người kiểm của lần kiểm gần nhất, sửa được ở cột phải
        const base = sessionRef.current ?? { ...createSession(), ...(history[0]?.checker ? { checker: history[0].checker } : {}) };
        const { session: next, report } = mergeFiles(base, parsed);
        report.invalid.forEach(item => toast.error(`${item.fileName}: ${item.reason}`));
        if (report.duplicates.length > 0) toast.warning(`Bỏ qua ${report.duplicates.length} hoá đơn đã nhập trước đó: ${report.duplicates.join(', ')}`);
        if (next.invoices.length === 0) return;
        commit(next);
        if (report.added.length > 0) {
            const lines = next.lines.filter(line => report.added.includes(next.invoices.find(invoice => invoice.transferId === line.transferId)?.invoiceNo || line.transferId));
            const units = lines.reduce((sum, line) => sum + line.expected, 0);
            toast.success(`Đã nhập ${report.added.length} hoá đơn: ${lines.length} dòng, ${units.toLocaleString('vi-VN')} sản phẩm`);
        } else if (report.summaries > 0) {
            toast.info('Đã ghép số hoá đơn từ file phiếu');
        }
        const missingDetail = next.invoices.filter(invoice => !invoice.hasDetail);
        if (missingDetail.length > 0) toast.warning(`Còn ${missingDetail.length} hoá đơn chưa có file chi tiết: ${missingDetail.map(invoiceLabel).join(', ')}`);
        focusScan();
    }, [commit, focusScan, history]);

    const submitScan = useCallback((raw: string) => {
        const value = raw.trim();
        if (!value) return false;
        if (alertOpenRef.current) {
            // Đang báo mã lạ: chưa xác nhận thì không nhận mã nào
            beep('error');
            return false;
        }
        const current = sessionRef.current;
        if (!current || current.lines.length === 0) {
            toast.warning('Chưa có danh sách hàng. Nhập file Excel phiếu chuyển kho trước.');
            return false;
        }
        const outcome = applyScan(current, value, { qty, pendingCode: pendingCode ?? undefined });
        commit(outcome.session);
        tickRef.current += 1;
        const shown = value.replace(/\s+/g, '').toUpperCase();
        setFeedback({ outcome, input: shown, tick: tickRef.current });
        if (outcome.line) setFocusLine({ key: outcome.line.key, code: outcome.line.code });
        if (outcome.kind === 'unknown' || outcome.kind === 'imei-unknown') {
            alertOpenRef.current = true;
            setUnknownAlert({ value: shown, kind: outcome.kind, forName: outcome.line?.name });
        }
        setPendingCode(['need-imei', 'imei-unknown', 'imei-dup'].includes(outcome.kind) ? (outcome.pendingCode ?? pendingCode) : null);
        if (outcome.kind === 'ok' || outcome.kind === 'over') setQty(1);
        beep(outcome.kind === 'ok' || outcome.kind === 'imei-ok' || outcome.kind === 'need-imei' ? 'ok'
            : outcome.kind === 'over' || outcome.kind === 'imei-dup' ? 'warn' : 'error');
        if (outcome.line && (statusFilter !== 'all' || invoiceFilter || groupFilter || search)) {
            // Dòng vừa quét có thể đang bị bộ lọc ẩn: bỏ lọc để thấy dòng đó
            const got = outcome.session.received[outcome.line.key] ?? 0;
            const filter = FILTERS.find(item => item.id === statusFilter)!;
            if (!filter.test(outcome.line, got) || (invoiceFilter && invoiceFilter !== outcome.line.transferId) || (groupFilter && groupFilter !== outcome.line.group)) {
                setStatusFilter('all');
                setInvoiceFilter(null);
                setGroupFilter('');
            }
            setSearch('');
        }
        return outcome.kind === 'ok' || outcome.kind === 'imei-ok' || outcome.kind === 'need-imei';
    }, [commit, qty, pendingCode, statusFilter, invoiceFilter, groupFilter, search]);

    const undo = useCallback(() => {
        const current = sessionRef.current;
        if (!current) return;
        const { session: next, undone } = undoLast(current);
        if (!undone) {
            toast.info('Không còn lần quét nào để hoàn tác');
            return;
        }
        commit(next);
        setFeedback(null);
        setPendingCode(null);
        toast.success(`Đã hoàn tác: ${undone.input}`);
        focusScan();
    }, [commit, focusScan]);

    const closeAlert = useCallback(() => {
        alertOpenRef.current = false;
        setUnknownAlert(null);
        setInput('');
        focusScan();
    }, [focusScan]);

    const setChecker = useCallback((name: string) => {
        const current = sessionRef.current;
        if (current) commit({ ...current, checker: name, updatedAt: Date.now() });
    }, [commit]);

    // Súng quét gõ như bàn phím: đang không gõ ở ô nào thì đưa con trỏ về ô quét để không mất mã. Ctrl/⌘+Z để hoàn tác.
    useEffect(() => {
        if (!active) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
            const target = event.target as HTMLElement | null;
            const editable = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && (!editable || target === scanRef.current) && !scanRef.current?.value) {
                event.preventDefault();
                undo();
                return;
            }
            if (editable || event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
            scanRef.current?.focus();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [active, undo]);

    const lines = session?.lines ?? [];
    const received = useMemo(() => session?.received ?? {}, [session]);
    const invoiceMap = useMemo(() => new Map((session?.invoices ?? []).map(invoice => [invoice.transferId, invoice])), [session]);
    const invoiceOf = useCallback((transferId: string) => {
        const invoice = invoiceMap.get(transferId);
        return invoice ? invoiceLabel(invoice) : transferId;
    }, [invoiceMap]);
    const totals = useMemo(() => totalsOf(lines, received), [lines, received]);
    const groups = useMemo(() => {
        const counts = new Map<string, number>();
        for (const line of lines) counts.set(line.group, (counts.get(line.group) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
    }, [lines]);
    const scopeLines = useMemo(
        () => lines.filter(line => (!invoiceFilter || line.transferId === invoiceFilter) && (!groupFilter || line.group === groupFilter)),
        [lines, invoiceFilter, groupFilter],
    );
    const searchKey = search.trim().toLowerCase();
    const shownLines = useMemo(() => {
        const filter = FILTERS.find(item => item.id === statusFilter)!;
        return scopeLines.filter(line => filter.test(line, received[line.key] ?? 0)
            && (!searchKey || line.code.toLowerCase().includes(searchKey) || line.name.toLowerCase().includes(searchKey) || line.imei.toLowerCase().includes(searchKey)));
    }, [scopeLines, statusFilter, received, searchKey]);

    // Các dòng của mã vừa quét lên đầu danh sách (dòng vừa cộng đứng đầu), các dòng khác giữ thứ tự trong file
    const orderedLines = useMemo(() => {
        if (!focusLine) return shownLines;
        const top = shownLines.filter(line => line.code === focusLine.code);
        if (top.length === 0) return shownLines;
        top.sort((a, b) => Number(b.key === focusLine.key) - Number(a.key === focusLine.key));
        return [...top, ...shownLines.filter(line => line.code !== focusLine.code)];
    }, [shownLines, focusLine]);
    const shownUnknown = useMemo(
        () => (session?.unknown ?? []).filter(entry => !searchKey || entry.value.toLowerCase().includes(searchKey)),
        [session, searchKey],
    );
    const nameOf = useCallback((code: string) => lines.find(line => line.code === code)?.name ?? '', [lines]);
    const removeUnknown = useCallback((value: string, type: 'code' | 'imei') => {
        const current = sessionRef.current;
        if (current) commit({ ...current, unknown: current.unknown.filter(entry => !(entry.value === value && entry.type === type)), updatedAt: Date.now() });
    }, [commit]);
    const toggleFilter = (id: StatusFilter) => setStatusFilter(current => (current === id && id !== 'all' ? 'all' : id));

    const exportCurrent = async (target: KiemHangSession | null = sessionRef.current) => {
        if (!target) return;
        try {
            await exportSessionToExcel(target);
        } catch (error) {
            console.error(error);
            toast.error('Không xuất được file Excel. Vui lòng thử lại.');
        }
    };

    const finish = () => {
        const current = sessionRef.current;
        setReportOf(null);
        if (!current) return;
        const done = { ...current, finishedAt: Date.now() };
        commitHistory([done, ...history.filter(item => item.id !== done.id)]);
        commit(null);
        setFeedback(null);
        setFocusLine(null);
        setPendingCode(null);
        setStatusFilter('all');
        setInvoiceFilter(null);
        setGroupFilter('');
        setSearch('');
        toast.success('Đã kết thúc và lưu vào Lịch sử');
    };

    const reopen = (target: KiemHangSession) => {
        const current = sessionRef.current;
        const rest = history.filter(item => item.id !== target.id);
        // Đang kiểm dở một phiên khác thì cất phiên đó vào lịch sử, không bỏ mất
        commitHistory(current && current.lines.length > 0 ? [{ ...current, finishedAt: current.finishedAt ?? Date.now() }, ...rest] : rest);
        commit({ ...target, finishedAt: undefined });
        setHistoryOpen(false);
        setFeedback(null);
        setFocusLine(null);
        setPendingCode(null);
        toast.success(`Đã mở lại ${sessionTitle(target)}`);
        focusScan();
    };

    const onDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragging(false);
        void importFiles(Array.from(event.dataTransfer.files));
    };

    const hasSession = Boolean(session && session.invoices.length > 0);
    // Mở màn, hoặc vừa nhập file xong (ô quét mới hiện ra), thì sẵn sàng quét ngay
    useEffect(() => {
        if (active && loaded && hasSession) focusScan();
    }, [active, loaded, hasSession, focusScan]);
    const unknownCount = session ? unknownTotal(session) : 0;
    const percent = totals.expected ? Math.round((totals.received / totals.expected) * 100) : 0;

    return (
        <div
            className="relative h-full bg-slate-100 dark:bg-slate-900"
            onDragOver={event => {
                if (event.dataTransfer.types.includes('Files')) {
                    event.preventDefault();
                    setDragging(true);
                }
            }}
            onDragLeave={event => {
                if (event.currentTarget === event.target) setDragging(false);
            }}
            onDrop={onDrop}
        >
            {/* Tên chức năng đã hiện ở tiêu đề bên trái; cụm bên phải chỉ còn các nút chung */}
            {active && <TopBarActions>{null}</TopBarActions>}
            <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT}
                aria-label="Chọn file Excel phiếu chuyển kho"
                className="hidden"
                onChange={event => {
                    const files = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    void importFiles(files);
                }}
            />

            {!loaded ? null : !hasSession ? (
                <Landing onPick={() => fileRef.current?.click()} onHistory={() => setHistoryOpen(true)} historyCount={history.length} dragging={dragging} />
            ) : (
                <div className="h-full p-4 lg:p-5 flex gap-4 min-h-0">
                    <section aria-label="Quét và đối chiếu" className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
                        <form
                            className={`shrink-0 flex items-center gap-2 rounded-card bg-white border-2 px-3 py-2 transition-colors ${pendingCode ? 'border-sky-500' : scanFocused ? 'border-emerald-500' : 'border-amber-400'}`}
                            onSubmit={event => {
                                event.preventDefault();
                                submitScan(input);
                                setInput('');
                            }}
                        >
                            <AppIcon name="scan" px={26} className={pendingCode ? 'text-sky-600' : scanFocused ? 'text-emerald-600' : 'text-amber-500'} />
                            <input
                                ref={scanRef}
                                value={input}
                                onChange={event => setInput(event.target.value)}
                                onFocus={() => setScanFocused(true)}
                                onBlur={() => setScanFocused(false)}
                                onKeyDown={event => {
                                    if (event.key === 'Escape') {
                                        setInput('');
                                        setPendingCode(null);
                                    }
                                }}
                                aria-label="Ô quét mã sản phẩm hoặc IMEI"
                                placeholder={pendingCode ? 'Quét IMEI…' : 'Bắn mã sản phẩm hoặc IMEI…'}
                                autoComplete="off"
                                spellCheck={false}
                                className="flex-1 min-w-0 h-11 bg-transparent text-[20px] font-bold tracking-wide text-slate-900 placeholder:text-slate-400 placeholder:font-medium focus:outline-none"
                            />
                            <span className={`hidden xl:inline text-[11px] font-bold ${scanFocused ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {scanFocused ? 'Sẵn sàng quét' : 'Bấm vào ô để quét'}
                            </span>
                            <label className="flex items-center gap-1 text-[12px] font-semibold text-slate-500" title="Số lượng cộng cho lần quét tới, tự về 1 sau mỗi lần">
                                SL
                                <input
                                    type="number"
                                    min={1}
                                    value={qty}
                                    aria-label="Số lượng mỗi lần quét"
                                    onChange={event => setQty(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
                                    onFocus={event => event.target.select()}
                                    className="w-14 h-9 rounded-control border border-slate-200 text-center text-[15px] font-bold text-slate-800 focus:outline-none focus:border-sky-400"
                                />
                            </label>
                            <Button type="submit" size="md" className="shrink-0">Nhập</Button>
                            {/* Cửa sổ hẹp thì chỉ còn biểu tượng để ô quét đủ rộng */}
                            <Button type="button" variant="secondary" size="md" icon="takePhoto" aria-label="Camera" title="Quét bằng camera" onClick={() => setCameraOpen(true)} className="shrink-0">
                                <span className="hidden xl:inline">Camera</span>
                            </Button>
                            <Button type="button" variant="secondary" size="md" icon="reset" aria-label="Hoàn tác" onClick={undo} className="shrink-0" title="Huỷ lần quét vừa rồi (Ctrl+Z)">
                                <span className="hidden xl:inline">Hoàn tác</span>
                            </Button>
                        </form>

                        <ResultBanner feedback={feedback} invoiceCount={session!.invoices.length} invoiceOf={invoiceOf} />

                        <div className="shrink-0 grid grid-cols-5 gap-2">
                            <Kpi label="Theo file" value={totals.expected} tone="neutral" selected={statusFilter === 'all'} onClick={() => toggleFilter('all')} testId="kpi-theo-file" />
                            <Kpi label="Đã kiểm" value={totals.received} tone="good" selected={statusFilter === 'checked'} onClick={() => toggleFilter('checked')} testId="kpi-da-kiem" />
                            <Kpi label="Còn thiếu" value={totals.missing} tone="missing" selected={statusFilter === 'notdone'} onClick={() => toggleFilter('notdone')} testId="kpi-con-thieu" />
                            <Kpi label="Thừa" value={totals.extra} tone="extra" selected={statusFilter === 'over'} onClick={() => toggleFilter('over')} testId="kpi-thua" />
                            <Kpi label="Mã lạ" value={unknownCount} tone="unknown" selected={statusFilter === 'unknown'} onClick={() => toggleFilter('unknown')} testId="kpi-ma-la" />
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                            <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label="Tiến độ kiểm" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                                <div className={`h-full rounded-full transition-all ${percent === 100 && !totals.extra ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${percent}%` }} />
                            </div>
                            <span className="text-[12px] font-bold text-slate-600 tabular-nums">{percent}% · {totals.doneLines}/{totals.lines} dòng đủ</span>
                        </div>

                        <div className="flex-1 min-h-0 rounded-card bg-white border border-slate-200 flex flex-col overflow-hidden">
                            <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100">
                                <div role="group" aria-label="Lọc theo kết quả" className="flex flex-wrap gap-1.5">
                                    {FILTERS.map(filter => {
                                        const count = filter.id === 'unknown' ? session!.unknown.length : scopeLines.filter(line => filter.test(line, received[line.key] ?? 0)).length;
                                        const selected = statusFilter === filter.id;
                                        if ((filter.id === 'imei' || filter.id === 'unknown') && count === 0 && !selected) return null;
                                        const tone = FILTER_TONE[filter.id];
                                        // Nút có màu riêng (Chưa đủ, Thừa, Mã lạ) luôn có nền màu, có số thì nền đậm hơn
                                        const look = selected
                                            ? tone?.selected ?? 'bg-sky-600 border-sky-600 text-white'
                                            : tone ? (count > 0 ? tone.active : tone.idle) : 'bg-white border-slate-200 text-slate-600 hover:border-sky-300';
                                        return (
                                            <button
                                                key={filter.id}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => setStatusFilter(filter.id)}
                                                className={`rounded-full px-2.5 py-1 text-[12px] border transition-colors ${tone ? 'font-bold' : 'font-semibold'} ${look}`}
                                            >
                                                {filter.label} {count}
                                            </button>
                                        );
                                    })}
                                </div>
                                {invoiceFilter && (
                                    <button type="button" onClick={() => setInvoiceFilter(null)} className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-[12px] font-semibold text-sky-700">
                                        {invoiceOf(invoiceFilter)}
                                        <AppIcon name="close" size="xs" />
                                    </button>
                                )}
                                <select
                                    value={groupFilter}
                                    onChange={event => setGroupFilter(event.target.value)}
                                    aria-label="Lọc theo nhóm hàng"
                                    className={`ml-auto h-8 max-w-[220px] rounded-control border px-2 text-[13px] focus:outline-none focus:border-sky-400 ${groupFilter ? 'border-sky-400 bg-sky-50 text-sky-800 font-semibold' : 'border-slate-200 bg-white text-slate-700'}`}
                                >
                                    <option value="">Tất cả nhóm hàng ({groups.length})</option>
                                    {groups.map(([name, count]) => (
                                        <option key={name} value={name}>{name || 'Chưa có nhóm'} ({count})</option>
                                    ))}
                                </select>
                                <input
                                    type="search"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder={statusFilter === 'unknown' ? 'Tìm mã lạ…' : 'Tìm mã, tên, IMEI…'}
                                    aria-label="Tìm trong danh sách"
                                    className="w-44 h-8 rounded-control border border-slate-200 px-2.5 text-[13px] focus:outline-none focus:border-sky-400"
                                />
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
                                {statusFilter === 'unknown' ? (
                                    <UnknownTable entries={shownUnknown} nameOf={nameOf} onRemove={removeUnknown} />
                                ) : (
                                <KiemHangTable
                                    lines={orderedLines}
                                    received={received}
                                    invoices={invoiceMap}
                                    highlightKey={focusLine?.key}
                                    highlightTick={feedback?.tick ?? 0}
                                    onSetReceived={(lineKey, value) => {
                                        const current = sessionRef.current;
                                        if (current) commit(setReceived(current, lineKey, value));
                                    }}
                                />
                                )}
                            </div>
                        </div>
                    </section>

                    <KiemHangSidePanel
                        session={session!}
                        invoiceFilter={invoiceFilter}
                        onInvoiceFilter={setInvoiceFilter}
                        onAddFiles={() => fileRef.current?.click()}
                        onExport={() => void exportCurrent()}
                        onFinish={() => setReportOf({ session: session!, mode: 'finish' })}
                        onReport={() => setReportOf({ session: session!, mode: 'view' })}
                        onHistory={() => setHistoryOpen(true)}
                        historyCount={history.length}
                        onRemoveUnknown={removeUnknown}
                        onCheckerChange={setChecker}
                        onCheckerDone={focusScan}
                    />
                </div>
            )}

            {dragging && hasSession && (
                <div className="pointer-events-none absolute inset-3 z-20 rounded-[20px] border-2 border-dashed border-sky-500 bg-sky-50/80 flex items-center justify-center text-[18px] font-bold text-sky-700">
                    Thả file để thêm hoá đơn vào phiên đang kiểm
                </div>
            )}

            {cameraOpen && (
                <Scanner
                    onScanSuccess={code => submitScan(code)}
                    onClose={() => {
                        setCameraOpen(false);
                        focusScan();
                    }}
                />
            )}

            {historyOpen && (
                <KiemHangHistoryDialog
                    history={history}
                    onClose={() => {
                        setHistoryOpen(false);
                        focusScan();
                    }}
                    onOpen={reopen}
                    onExport={target => void exportCurrent(target)}
                    onReport={target => setReportOf({ session: target, mode: 'view' })}
                    onDelete={target => commitHistory(history.filter(item => item.id !== target.id))}
                />
            )}

            {reportOf && (
                <KiemHangReportDialog
                    // Đang xem phiên hiện tại thì cập nhật theo lần quét mới nhất
                    session={reportOf.session.id === session?.id ? session : reportOf.session}
                    mode={reportOf.mode}
                    onClose={() => {
                        setReportOf(null);
                        focusScan();
                    }}
                    onExport={() => void exportCurrent(reportOf.session.id === session?.id ? session : reportOf.session)}
                    onFinish={finish}
                    onCheckerChange={reportOf.session.id === session?.id ? setChecker : undefined}
                />
            )}

            {unknownAlert && active && (
                <UnknownAlert
                    alert={unknownAlert}
                    invoiceCount={session?.invoices.length ?? 0}
                    hasTypedInput={() => Boolean(scanRef.current?.value.trim())}
                    onBlocked={() => setInput('')}
                    onConfirm={closeAlert}
                    onDiscard={() => {
                        undo();
                        closeAlert();
                    }}
                />
            )}
        </div>
    );
}


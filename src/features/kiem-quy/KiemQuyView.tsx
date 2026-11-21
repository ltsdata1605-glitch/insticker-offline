import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { ConfirmDialog } from '../../components/shared/ui/ConfirmDialog';
import { Modal } from '../../components/shared/ui/Modal';
import { TopBarActions } from '../../components/shared/ui/TopBarActions';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import { saoChep } from '../../components/shared/ui/saoChep';
import { exportElementAsImage } from '../../components/shared/export';
import type { CashCount } from './kiemQuyModel';
import {
    DENOMINATIONS, amountInWords, dateTimeText, diffOf, diffText, formatMoney, isBlank, newCount, parseMoney, reportText, sheetTotal, sheetsOf, totalOf, upsertHistory,
} from './kiemQuyModel';
import { loadCurrent, loadHistory, saveCurrent, saveHistory } from './kiemQuyStore';

const DIFF_TONE = (diff: number | null) => (diff === null ? '' : diff === 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : diff > 0 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-rose-50 text-rose-700 ring-rose-200');

/** Màu nhận diện mệnh giá (gần màu tờ tiền) để mắt dò nhanh */
const NOTE_TONE: Record<number, string> = {
    500_000: 'bg-sky-100 text-sky-800', 200_000: 'bg-orange-100 text-orange-800', 100_000: 'bg-emerald-100 text-emerald-800',
    50_000: 'bg-pink-100 text-pink-800', 20_000: 'bg-blue-100 text-blue-800', 10_000: 'bg-amber-100 text-amber-800',
    5_000: 'bg-indigo-100 text-indigo-800', 2_000: 'bg-stone-200 text-stone-800', 1_000: 'bg-lime-100 text-lime-800', 500: 'bg-slate-200 text-slate-700',
};

/** Ô nhập số tiền: hiện có dấu chấm ngăn nghìn, gõ số nào nhận số đó */
const MoneyInput: React.FC<{ value: number | null; onChange: (value: number | null) => void; label: string; placeholder?: string; className?: string; inputRef?: React.Ref<HTMLInputElement> }> = ({ value, onChange, label, placeholder, className, inputRef }) => (
    <input ref={inputRef} type="text" inputMode="numeric" aria-label={label} placeholder={placeholder ?? '0'} value={value === null || value === 0 ? '' : formatMoney(value)}
        onFocus={e => e.target.select()}
        onChange={e => onChange(e.target.value.trim() ? parseMoney(e.target.value) : null)}
        className={`h-10 rounded-control border border-slate-200 bg-white px-3 text-right text-[16px] font-bold tabular-nums text-slate-900 focus:outline-none focus:border-sky-400 ${className ?? ''}`} />
);

/** Phiếu kiểm quỹ dựng riêng để xuất ảnh: gọn, nền trắng */
const ReportCard = React.forwardRef<HTMLDivElement, { count: CashCount }>(({ count }, ref) => {
    const total = totalOf(count);
    const diff = diffOf(count);
    const rows = DENOMINATIONS.filter(d => sheetsOf(count, d) > 0);
    return (
        <div ref={ref} style={{ width: 640 }} className="bg-white p-6 text-slate-900">
            <p className="text-[12px] font-bold uppercase tracking-wide text-sky-700">Biên bản kiểm quỹ</p>
            <div className="mt-1 flex items-center gap-3 rounded-lg bg-sky-50 px-3 py-2 ring-1 ring-sky-200">
                <span className="text-[20px] font-black leading-tight">{count.name.trim() || 'Chưa đặt tên'}</span>
            </div>
            <p className="mt-2 text-[13px] text-slate-600">Lúc {dateTimeText(count.savedAt ?? count.updatedAt)}</p>
            <table className="mt-3 w-full border-collapse text-[14px]">
                <thead>
                    <tr className="border-b border-slate-300 text-left text-[12px] text-slate-500">
                        <th className="py-1.5 font-semibold">Mệnh giá</th><th className="py-1.5 text-right font-semibold">Số tờ</th><th className="py-1.5 text-right font-semibold">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(d => (
                        <tr key={d} className="border-b border-slate-100">
                            <td className="py-1.5 font-bold">{formatMoney(d)}</td>
                            <td className="py-1.5 text-right tabular-nums">{sheetsOf(count, d)}</td>
                            <td className="py-1.5 text-right font-semibold tabular-nums">{formatMoney(d * sheetsOf(count, d))}</td>
                        </tr>
                    ))}
                    {count.other > 0 && (
                        <tr className="border-b border-slate-100"><td className="py-1.5 font-bold">Tiền khác</td><td /><td className="py-1.5 text-right font-semibold tabular-nums">{formatMoney(count.other)}</td></tr>
                    )}
                    <tr>
                        <td className="pt-2 text-[15px] font-black">Tổng thực tế</td>
                        <td className="pt-2 text-right font-bold tabular-nums">{sheetTotal(count)} tờ</td>
                        <td className="pt-2 text-right text-[20px] font-black tabular-nums">{formatMoney(total)} đ</td>
                    </tr>
                </tbody>
            </table>
            <p className="mt-1 text-[13px] italic text-slate-600">Bằng chữ: {amountInWords(total)}</p>
            {count.expected !== null && (
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[14px]">
                    <span>Theo sổ: <strong className="tabular-nums">{formatMoney(count.expected)} đ</strong></span>
                    <span className={`rounded-full px-3 py-1 font-black ring-1 ${DIFF_TONE(diff)}`}>{diffText(diff)}</span>
                </div>
            )}
            {count.note.trim() && <p className="mt-3 text-[13px]"><strong>Ghi chú:</strong> {count.note.trim()}</p>}
        </div>
    );
});
ReportCard.displayName = 'ReportCard';

const exportImage = (element: HTMLElement | null, count: CashCount) => {
    if (!element) return;
    const at = new Date(count.savedAt ?? count.updatedAt);
    const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}_${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`;
    const name = (count.name.trim() || 'kiem_quy').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    void exportElementAsImage(element, `Kiem_quy_${name}_${stamp}.png`, { preset: 'raw', footer: false });
};

/** Xem một lần kiểm đã lưu */
const HistoryDialog: React.FC<{ count: CashCount; onClose: () => void; onEdit: () => void; onDelete: () => void }> = ({ count, onClose, onEdit, onDelete }) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const [deleteAsk, setDeleteAsk] = useState(false);
    return (
        <Modal isOpen={true} onClose={onClose} title="Lần kiểm quỹ đã lưu" maxWidth="lg" zIndex="z-[200]">
            <div className="space-y-3">
                <div className="max-h-[56vh] overflow-y-auto rounded-card border border-slate-200 scrollbar-thin">
                    <ReportCard ref={reportRef} count={count} />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button icon="copy" onClick={() => void saoChep(reportText(count), { thanhCong: 'Đã sao chép, dán vào Zalo để gửi' })}>Sao chép để gửi</Button>
                    <Button variant="secondary" icon="exportImage" onClick={() => exportImage(reportRef.current, count)}>Xuất ảnh</Button>
                    <Button variant="secondary" icon="edit" onClick={onEdit}>Mở lại để sửa</Button>
                    <Button variant="ghost" icon="delete" className="ml-auto text-rose-600" onClick={() => setDeleteAsk(true)}>Xoá</Button>
                </div>
            </div>
            <ConfirmDialog isOpen={deleteAsk} onClose={() => setDeleteAsk(false)} onConfirm={() => { setDeleteAsk(false); onDelete(); }}
                title="Xoá lần kiểm quỹ này?" variant="danger" zIndex="z-[210]" confirmText="Xoá" cancelText="Không xoá"
                message={`${count.name.trim() || 'Lần kiểm'} lúc ${dateTimeText(count.savedAt ?? count.updatedAt)} sẽ bị xoá khỏi lịch sử.`} />
        </Modal>
    );
};

/** Kiểm quỹ: đếm số tờ theo mệnh giá, đối chiếu số theo sổ, đặt tên và lưu lịch sử. Lần đang đếm tự giữ khi tắt app. */
export default function KiemQuyView({ active }: { active: boolean }): React.JSX.Element {
    const [loaded, setLoaded] = useState(false);
    const [current, setCurrent] = useState<CashCount>(() => newCount());
    const [history, setHistory] = useState<CashCount[]>([]);
    const [viewing, setViewing] = useState<CashCount | null>(null);
    const [ask, setAsk] = useState<{ title: string; message: string; confirm: string; run: () => void } | null>(null);
    const [nameError, setNameError] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const sheetRefs = useRef<(HTMLInputElement | null)[]>([]);
    const otherRef = useRef<HTMLInputElement>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        void Promise.all([loadCurrent(), loadHistory()]).then(([saved, list]) => {
            if (saved) setCurrent(saved);
            setHistory(list);
            setLoaded(true);
        });
    }, []);

    /** Mỗi lần sửa đều ghi ngay, để tắt app giữa chừng không mất số đã đếm */
    const update = (change: Partial<CashCount>) => {
        setCurrent(previous => {
            const next = { ...previous, ...change, updatedAt: Date.now() };
            void saveCurrent(next);
            return next;
        });
    };
    const setSheets = (denomination: number, sheets: number) => {
        const counts = { ...current.counts };
        if (sheets > 0) counts[String(denomination)] = Math.min(sheets, 1_000_000);
        else delete counts[String(denomination)];
        update({ counts });
    };
    const replaceCurrent = (next: CashCount) => {
        setCurrent(next);
        void saveCurrent(next);
    };

    const total = totalOf(current);
    const diff = diffOf(current);
    const savedVersion = history.find(item => item.id === current.id);
    const unsaved = !savedVersion || current.updatedAt > (savedVersion.savedAt ?? 0);
    const confirmIfUnsaved = (title: string, confirm: string, run: () => void) => {
        if (isBlank(current) || !unsaved) run();
        else setAsk({ title, confirm, message: 'Lần đang nhập chưa lưu vào lịch sử sẽ bị bỏ.', run });
    };

    const save = () => {
        if (!current.name.trim()) {
            setNameError(true);
            nameRef.current?.focus();
            toast.error('Nhập tên lần kiểm trước khi lưu');
            return;
        }
        if (total === 0 && current.expected === null) {
            toast.error('Chưa nhập số tờ nào');
            return;
        }
        const at = Date.now();
        const saved: CashCount = { ...current, name: current.name.trim(), savedAt: at, updatedAt: at };
        const next = upsertHistory(history, saved);
        setHistory(next);
        void saveHistory(next);
        replaceCurrent(newCount());
        toast.success(savedVersion ? `Đã cập nhật "${saved.name}"` : `Đã lưu "${saved.name}" vào lịch sử`);
    };

    const tone = DIFF_TONE(diff);

    return (
        <div className="relative h-full bg-slate-100">
            {active && <TopBarActions>{null}</TopBarActions>}
            {loaded && (
                <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_380px] gap-4 p-4 lg:p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <section className="flex min-h-0 flex-col gap-3">
                        <div className="flex flex-wrap items-end gap-3 rounded-card border border-slate-200 bg-white px-4 py-3">
                            <label className="min-w-[240px] flex-1 space-y-1">
                                <span className="block text-[12px] font-bold text-slate-600">Tên lần kiểm</span>
                                <input ref={nameRef} value={current.name} aria-label="Tên lần kiểm" placeholder="Ví dụ: Ca sáng - Ngọc"
                                    onChange={e => { setNameError(false); update({ name: e.target.value }); }}
                                    className={`h-10 w-full rounded-control border bg-white px-3 text-[15px] font-bold text-slate-900 focus:outline-none focus:border-sky-400 ${nameError ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`} />
                            </label>
                            <span data-testid="tinh-trang-kiem-quy" className={`mb-2 rounded-full px-3 py-1 text-[12px] font-bold ring-1 ${unsaved ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                                {!unsaved ? `Đã lưu ${dateTimeText(savedVersion!.savedAt!)}` : savedVersion ? 'Đang sửa lần đã lưu, chưa lưu lại' : isBlank(current) ? 'Lần kiểm mới' : 'Chưa lưu · tắt app vẫn giữ'}
                            </span>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto rounded-card border border-slate-200 bg-white scrollbar-thin">
                            <table className="w-full border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-50">
                                    <tr className="text-left text-[12px] font-bold text-slate-500">
                                        <th className="px-4 py-2">Mệnh giá</th>
                                        <th className="px-2 py-2 text-center">Số tờ</th>
                                        <th className="px-4 py-2 text-right">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {DENOMINATIONS.map((d, index) => {
                                        const sheets = sheetsOf(current, d);
                                        return (
                                            <tr key={d} data-testid="dong-menh-gia" className="border-t border-slate-100">
                                                <td className="px-4 py-1">
                                                    <span className={`inline-block min-w-[108px] rounded-[8px] px-3 py-1 text-center text-[17px] font-black tabular-nums ${NOTE_TONE[d]}`}>{formatMoney(d)}</span>
                                                </td>
                                                <td className="px-2 py-1">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <Button size="icon" variant="secondary" icon="minus" aria-label={`Bớt một tờ ${formatMoney(d)}`} disabled={sheets === 0} onClick={() => setSheets(d, sheets - 1)} />
                                                        <input ref={element => { sheetRefs.current[index] = element; }} type="text" inputMode="numeric" aria-label={`Số tờ ${formatMoney(d)}`} placeholder="0"
                                                            value={sheets ? String(sheets) : ''} onFocus={e => e.target.select()}
                                                            onChange={e => setSheets(d, parseMoney(e.target.value))}
                                                            onKeyDown={e => {
                                                                if (e.key !== 'Enter') return;
                                                                e.preventDefault();
                                                                (sheetRefs.current[index + 1] ?? otherRef.current)?.focus();
                                                            }}
                                                            className="h-9 w-24 rounded-control border border-slate-200 bg-white px-2 text-center text-[18px] font-bold tabular-nums text-slate-900 focus:outline-none focus:border-sky-400" />
                                                        <Button size="icon" variant="secondary" icon="add" aria-label={`Thêm một tờ ${formatMoney(d)}`} onClick={() => setSheets(d, sheets + 1)} />
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-1 text-right text-[17px] font-bold tabular-nums ${sheets ? 'text-slate-900' : 'text-slate-300'}`}>{formatMoney(d * sheets)}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="border-t border-slate-100">
                                        <td className="px-4 py-2 text-[14px] font-bold text-slate-700" colSpan={2}>
                                            Tiền khác <span className="font-medium text-slate-500">(xu, tiền lẻ ngoài bảng)</span>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <MoneyInput inputRef={otherRef} label="Tiền khác" value={current.other} onChange={value => update({ other: value ?? 0 })} className="w-40" />
                                        </td>
                                    </tr>
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-slate-50">
                                    <tr className="border-t-2 border-slate-200">
                                        <td className="px-4 py-2.5 text-[15px] font-black text-slate-900">Tổng</td>
                                        <td className="px-2 py-2.5 text-center text-[15px] font-bold text-slate-700 tabular-nums">{sheetTotal(current)} tờ</td>
                                        <td className="px-4 py-2.5 text-right text-[20px] font-black text-slate-900 tabular-nums">{formatMoney(total)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </section>

                    <aside className="flex min-h-0 flex-col gap-3">
                        <section className="space-y-3 rounded-card border border-slate-200 bg-white p-4">
                            <div>
                                <p className="text-[12px] font-bold text-slate-600">Tổng tiền thực tế</p>
                                <p data-testid="tong-thuc-te" className="text-[34px] font-black leading-tight text-slate-900 tabular-nums">{formatMoney(total)} <span className="text-[20px]">đ</span></p>
                                <p data-testid="bang-chu" className="text-[13px] italic text-slate-600">{amountInWords(total)}</p>
                            </div>
                            <label className="block space-y-1">
                                <span className="block text-[12px] font-bold text-slate-600">Số tiền theo sổ / hệ thống <span className="font-medium text-slate-500">(để đối chiếu, không bắt buộc)</span></span>
                                <MoneyInput label="Số tiền theo sổ" placeholder="Chưa nhập" value={current.expected} onChange={value => update({ expected: value })} className="w-full" />
                            </label>
                            {diff !== null && (
                                <p data-testid="chenh-lech" className={`rounded-control px-3 py-2 text-center text-[18px] font-black ring-1 ${tone}`}>{diffText(diff)}</p>
                            )}
                            <textarea value={current.note} rows={2} aria-label="Ghi chú kiểm quỹ" placeholder="Ghi chú (ví dụ lý do thừa, thiếu)" onChange={e => update({ note: e.target.value })}
                                className="w-full rounded-control border border-slate-200 bg-white px-3 py-2 text-[14px] focus:outline-none focus:border-sky-400" />
                            <Button size="lg" icon="save" className="w-full" onClick={save}>{savedVersion ? 'Lưu lại thay đổi' : 'Lưu vào lịch sử'}</Button>
                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="secondary" icon="copy" disabled={total === 0} onClick={() => void saoChep(reportText({ ...current, updatedAt: Date.now() }), { thanhCong: 'Đã sao chép, dán vào Zalo để gửi' })}>Sao chép để gửi</Button>
                                <Button variant="secondary" icon="exportImage" disabled={total === 0} onClick={() => exportImage(reportRef.current, current)}>Xuất ảnh</Button>
                            </div>
                            <Button variant="ghost" icon="add" className="w-full" disabled={isBlank(current)}
                                onClick={() => confirmIfUnsaved('Làm lần kiểm mới?', 'Làm lần mới', () => { replaceCurrent(newCount()); setNameError(false); })}>Làm lần kiểm mới</Button>
                        </section>

                        <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-card border border-slate-200 bg-white p-3">
                            <p className="flex items-center gap-1.5 text-[13px] font-bold text-slate-700"><AppIcon name="history" size="sm" /> Lịch sử kiểm quỹ ({history.length})</p>
                            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                                {history.length === 0 && <li className="py-6 text-center text-[13px] text-slate-500">Chưa có lần kiểm nào được lưu.</li>}
                                {history.map(item => {
                                    const itemDiff = diffOf(item);
                                    return (
                                        <li key={item.id}>
                                            <button type="button" data-testid="lich-su-kiem-quy" onClick={() => setViewing(item)}
                                                className={`w-full rounded-control border px-3 py-2 text-left hover:border-sky-300 ${item.id === current.id ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200 bg-white'}`}>
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="min-w-0 truncate text-[14px] font-bold text-slate-900">{item.name}</span>
                                                    <span className="shrink-0 text-[14px] font-black tabular-nums text-slate-900">{formatMoney(totalOf(item))}</span>
                                                </span>
                                                <span className="flex items-center justify-between gap-2 text-[12px] text-slate-500">
                                                    <span>{dateTimeText(item.savedAt ?? item.updatedAt)}</span>
                                                    {itemDiff !== null && <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${DIFF_TONE(itemDiff)}`}>{diffText(itemDiff)}</span>}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    </aside>
                </div>
            )}

            <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0">
                <ReportCard ref={reportRef} count={current} />
            </div>

            {viewing && (
                <HistoryDialog count={viewing} onClose={() => setViewing(null)}
                    onEdit={() => confirmIfUnsaved('Mở lại lần đã lưu để sửa?', 'Mở lại', () => {
                        replaceCurrent({ ...viewing });
                        setViewing(null);
                    })}
                    onDelete={() => {
                        const next = history.filter(item => item.id !== viewing.id);
                        setHistory(next);
                        void saveHistory(next);
                        setViewing(null);
                        toast.success('Đã xoá lần kiểm quỹ');
                    }} />
            )}
            <ConfirmDialog isOpen={ask !== null} onClose={() => setAsk(null)} onConfirm={() => { ask?.run(); setAsk(null); }}
                title={ask?.title ?? ''} variant="warning" zIndex="z-[220]" confirmText={ask?.confirm ?? 'Đồng ý'} cancelText="Không" message={ask?.message ?? ''} />
        </div>
    );
}

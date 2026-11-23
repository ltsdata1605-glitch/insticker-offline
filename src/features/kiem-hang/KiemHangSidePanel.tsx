import React from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Button } from '../../components/shared/ui/Button';
import type { KiemHangSession } from './kiemHangData';
import { invoiceLabel, sessionTitle, totalsOf } from './kiemHangData';
import { fromStoreText, senderText } from './kiemHangReport';
import { timeText } from './kiemHangData';

interface KiemHangSidePanelProps {
    session: KiemHangSession;
    invoiceFilter: string | null;
    onInvoiceFilter: (transferId: string | null) => void;
    onAddFiles: () => void;
    onExport: () => void;
    onFinish: () => void;
    onReport: () => void;
    onHistory: () => void;
    historyCount: number;
    onRemoveUnknown: (value: string, type: 'code' | 'imei') => void;
    onCheckerChange: (name: string) => void;
    /** Nhấn Enter trong ô tên: quay về ô quét */
    onCheckerDone: () => void;
}

/** Cột phải: thông tin phiên, các hoá đơn kèm tiến độ (bấm để lọc), mã lạ và các nút xuất file, kết thúc, lịch sử. */
export const KiemHangSidePanel: React.FC<KiemHangSidePanelProps> = ({
    session, invoiceFilter, onInvoiceFilter, onAddFiles, onExport, onFinish, onReport, onHistory, historyCount, onRemoveUnknown, onCheckerChange, onCheckerDone,
}) => {
    const checker = session.checker ?? '';
    const lineCount = (transferId: string) => session.lines.filter(line => line.transferId === transferId);
    return (
        <aside aria-label="Thông tin phiên kiểm" className="w-[300px] xl:w-[340px] shrink-0 flex flex-col gap-3 min-h-0">
            <section className="rounded-card bg-white border border-slate-200 p-3 space-y-2.5 shrink-0">
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Đang kiểm</p>
                        <p className="text-[15px] font-bold text-slate-900 leading-snug break-words">{sessionTitle(session)}</p>
                        <p className="text-[11px] text-slate-500">Bắt đầu {timeText(session.createdAt)}</p>
                    </div>
                    <Button size="sm" icon="report" onClick={onReport} className="shrink-0">Báo cáo</Button>
                </div>
                {/* Chưa nhập tên thì viền vàng để nhắc: tên này có trong báo cáo gửi người chuyển */}
                <label className={`flex items-center gap-2 rounded-control border-2 px-2 h-9 transition-colors focus-within:border-sky-400 ${checker.trim() ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
                    <AppIcon name="userCheck" size="sm" className={checker.trim() ? 'text-slate-500' : 'text-amber-600'} />
                    <span className="shrink-0 text-[12px] font-semibold text-slate-500">Người kiểm</span>
                    <input
                        value={checker}
                        onChange={event => onCheckerChange(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                onCheckerChange(checker.trim());
                                onCheckerDone();
                            }
                        }}
                        onBlur={() => {
                            if (checker !== checker.trim()) onCheckerChange(checker.trim());
                        }}
                        aria-label="Người kiểm hàng"
                        placeholder="Nhập tên người kiểm"
                        autoComplete="off"
                        spellCheck={false}
                        className="flex-1 min-w-0 bg-transparent text-[14px] font-bold text-slate-900 placeholder:font-normal placeholder:text-amber-700/70 focus:outline-none"
                    />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" icon="upload" onClick={onAddFiles}>Thêm file</Button>
                    <Button variant="secondary" size="sm" icon="spreadsheet" onClick={onExport}>Xuất Excel</Button>
                    <Button variant="secondary" size="sm" icon="history" onClick={onHistory}>Lịch sử{historyCount > 0 ? ` (${historyCount})` : ''}</Button>
                    <Button size="sm" icon="check" onClick={onFinish} className="!bg-emerald-600 hover:!bg-emerald-700 !text-white border-transparent">Kết thúc</Button>
                </div>
            </section>

            <section className="rounded-card bg-white border border-slate-200 flex flex-col min-h-0 flex-1">
                <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
                    <p className="text-xs font-bold text-slate-700">Hoá đơn ({session.invoices.length})</p>
                    {invoiceFilter && (
                        <button type="button" onClick={() => onInvoiceFilter(null)} className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">Xem tất cả</button>
                    )}
                </div>
                <ul className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-1.5">
                    {session.invoices.map(invoice => {
                        const lines = lineCount(invoice.transferId);
                        const totals = totalsOf(lines, session.received);
                        const percent = totals.expected ? Math.round((totals.received / totals.expected) * 100) : 0;
                        const selected = invoiceFilter === invoice.transferId;
                        const done = invoice.hasDetail && totals.missing === 0 && totals.extra === 0;
                        return (
                            <li key={invoice.transferId}>
                                <button
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => onInvoiceFilter(selected ? null : invoice.transferId)}
                                    className={`w-full text-left rounded-control border px-2.5 py-2 transition-colors ${selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'}`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-[13px] text-slate-800">{invoiceLabel(invoice)}</span>
                                        {!invoice.hasDetail ? (
                                            <span className="text-[11px] font-bold text-amber-700">Chưa có file chi tiết</span>
                                        ) : (
                                            <span className={`text-[12px] font-bold tabular-nums ${done ? 'text-emerald-700' : totals.extra ? 'text-rose-600' : 'text-slate-600'}`}>
                                                {totals.received}/{totals.expected}{totals.extra ? ` +${totals.extra}` : ''}
                                            </span>
                                        )}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-600 break-words space-y-px">
                                        {invoice.orderId && <span className="block"><span className="text-slate-400">MYC</span> {invoice.orderId}</span>}
                                        {invoice.invoiceNo && <span className="block"><span className="text-slate-400">Phiếu</span> {invoice.transferId}</span>}
                                        {invoice.createdAt && <span className="block"><span className="text-slate-400">Ngày tạo</span> {invoice.createdAt}</span>}
                                        {invoice.fromStoreName && <span className="block"><span className="text-slate-400">Kho chuyển</span> {fromStoreText(invoice)}</span>}
                                        {invoice.user && <span className="block"><span className="text-slate-400">Người chuyển</span> {senderText(invoice)}</span>}
                                    </span>
                                    {invoice.hasDetail && (
                                        <span className="mt-1.5 block h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                                            <span className={`block h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${percent}%` }} />
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {session.unknown.length > 0 && (
                <section aria-label="Mã lạ" className="rounded-card bg-white border border-rose-200 p-3 shrink-0 max-h-48 flex flex-col">
                    <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5 shrink-0">
                        <AppIcon name="warning" size="sm" />
                        Mã lạ đã quét ({session.unknown.reduce((sum, entry) => sum + entry.count, 0)})
                    </p>
                    <ul className="mt-1.5 overflow-y-auto scrollbar-thin space-y-1 text-[12px]">
                        {session.unknown.map(entry => (
                            <li key={`${entry.type}:${entry.value}`} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate font-mono text-slate-700" title={entry.value}>
                                    {entry.type === 'imei' ? 'IMEI ' : ''}{entry.value}
                                </span>
                                <span className="flex items-center gap-1 shrink-0 text-slate-500">
                                    {entry.count > 1 && <span className="tabular-nums">×{entry.count}</span>}
                                    <button type="button" aria-label={`Xoá ${entry.value} khỏi mã lạ`} onClick={() => onRemoveUnknown(entry.value, entry.type)}
                                        className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-rose-50 hover:text-rose-600">
                                        <AppIcon name="close" size="xs" />
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </aside>
    );
};

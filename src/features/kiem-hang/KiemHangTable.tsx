import React, { useEffect, useRef } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import type { KiemHangInvoice, KiemHangLine, LineState, UnknownEntry } from './kiemHangData';
import { lineState, timeText } from './kiemHangData';
import { CodeText } from './KiemHangCode';

const STATE_STYLE: Record<LineState, { label: (diff: number) => string; className: string }> = {
    pending: { label: () => 'Chưa kiểm', className: 'bg-slate-100 text-slate-600' },
    partial: { label: diff => `Thiếu ${-diff}`, className: 'bg-amber-100 text-amber-800' },
    ok: { label: () => 'Đủ', className: 'bg-emerald-100 text-emerald-800' },
    over: { label: diff => `Thừa ${diff}`, className: 'bg-rose-100 text-rose-700' },
};

/** Ô sửa tay số thực nhận: − số + */
const ReceivedStepper: React.FC<{ value: number; label: string; onChange: (value: number) => void }> = ({ value, label, onChange }) => (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-control border border-slate-200 bg-white overflow-hidden">
        <button type="button" aria-label="Giảm 1" onClick={() => onChange(value - 1)} disabled={value <= 0}
            className="w-6 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            <AppIcon name="minus" size="xs" />
        </button>
        <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={label}
            value={value}
            onChange={e => onChange(Number(e.target.value) || 0)}
            onFocus={e => e.target.select()}
            className="w-10 h-7 text-center text-[13px] font-bold tabular-nums text-slate-800 border-x border-slate-200 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" aria-label="Tăng 1" onClick={() => onChange(value + 1)}
            className="w-6 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100">
            <AppIcon name="add" size="xs" />
        </button>
    </div>
);

interface KiemHangTableProps {
    lines: KiemHangLine[];
    received: Record<string, number>;
    invoices: Map<string, KiemHangInvoice>;
    /** Dòng vừa quét: tô sáng và cuộn tới. Các dòng của mã vừa quét đã được đưa lên đầu danh sách. */
    highlightKey?: string;
    highlightTick: number;
    onSetReceived: (lineKey: string, value: number) => void;
}

export const KiemHangTable: React.FC<KiemHangTableProps> = ({ lines, received, invoices, highlightKey, highlightTick, onSetReceived }) => {
    const bodyRef = useRef<HTMLTableSectionElement>(null);
    useEffect(() => {
        if (!highlightKey) return;
        const row = bodyRef.current?.querySelector<HTMLElement>(`[data-line-key="${CSS.escape(highlightKey)}"]`);
        row?.scrollIntoView({ block: 'nearest' });
    }, [highlightKey, highlightTick]);

    if (lines.length === 0) {
        return <p className="py-10 text-center text-sm text-slate-500">Không có sản phẩm nào khớp bộ lọc.</p>;
    }

    return (
        <table className="w-full text-[13px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                    <th className="w-10 px-2 py-2 text-left border-b border-slate-200">#</th>
                    <th className="w-[164px] px-2 py-2 text-left border-b border-slate-200">Mã sản phẩm</th>
                    <th className="px-2 py-2 text-left border-b border-slate-200">Tên sản phẩm · hoá đơn</th>
                    <th className="w-[140px] px-2 py-2 text-center border-b border-slate-200 whitespace-nowrap">Thực nhận / file</th>
                    <th className="w-[92px] px-2 py-2 text-right border-b border-slate-200">Kết quả</th>
                </tr>
            </thead>
            <tbody ref={bodyRef}>
                {lines.map((line, index) => {
                    const got = received[line.key] ?? 0;
                    const state = lineState(line.expected, got);
                    const style = STATE_STYLE[state];
                    const invoice = invoices.get(line.transferId);
                    const highlighted = line.key === highlightKey;
                    return (
                        <tr
                            key={line.key}
                            data-line-key={line.key}
                            data-state={state}
                            className={`scroll-mt-9 transition-colors ${highlighted ? 'bg-sky-50' : index % 2 ? 'bg-slate-50/50' : 'bg-white'}`}
                        >
                            <td className={`px-2 py-1.5 border-b border-slate-100 text-slate-400 tabular-nums ${highlighted ? 'border-l-4 border-l-sky-500' : ''}`}>{index + 1}</td>
                            <td className="px-2 py-1.5 border-b border-slate-100">
                                <CodeText value={line.code} className="text-[15px] font-semibold text-slate-700" tailClassName="text-[18px] font-black text-rose-600" />
                            </td>
                            <td className="px-2 py-1.5 border-b border-slate-100 min-w-0">
                                <span className="block font-semibold text-slate-800 leading-snug">{line.name}</span>
                                <span className="block text-[11px] text-slate-500">
                                    {line.group}
                                    <span className="ml-2 font-semibold text-slate-600" title={line.transferId}>
                                        {invoice?.invoiceNo ? `HĐ ${invoice.invoiceNo}` : line.transferId}
                                    </span>
                                </span>
                                {line.imei && (
                                    <span className="mt-1 inline-flex items-baseline gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-800">
                                        <span className="text-[11px] font-bold">IMEI</span>
                                        <CodeText value={line.imei} className="text-[15px] font-bold" tailClassName="text-[17px] font-black text-violet-950" />
                                    </span>
                                )}
                            </td>
                            <td className="px-2 py-1.5 border-b border-slate-100 text-center">
                                {line.imei ? (
                                    <span className="inline-flex items-center gap-1 tabular-nums font-bold text-slate-800">
                                        {got} / {line.expected}
                                        {got > 0 && (
                                            <button type="button" aria-label={`Bỏ nhận IMEI ${line.imei}`} title="Bỏ nhận chiếc này"
                                                onClick={() => onSetReceived(line.key, 0)}
                                                className="ml-1 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                                <AppIcon name="close" size="xs" />
                                            </button>
                                        )}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                        <ReceivedStepper value={got} label={`Thực nhận của ${line.code}`} onChange={value => onSetReceived(line.key, value)} />
                                        <span className="text-slate-500 tabular-nums">/ {line.expected}</span>
                                    </span>
                                )}
                            </td>
                            <td className="px-2 py-1.5 border-b border-slate-100 text-right">
                                <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${style.className}`}>{style.label(got - line.expected)}</span>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

interface UnknownTableProps {
    entries: UnknownEntry[];
    /** Tên sản phẩm theo mã, để ghi IMEI lạ đang quét cho sản phẩm nào */
    nameOf: (code: string) => string;
    onRemove: (value: string, type: UnknownEntry['type']) => void;
}

/** Danh sách mã lạ, hiện khi bấm ô Mã lạ: mã nào, quét mấy lần, lúc nào, để tìm lại sản phẩm lạ trong kiện. */
export const UnknownTable: React.FC<UnknownTableProps> = ({ entries, nameOf, onRemove }) => {
    if (entries.length === 0) {
        return <p className="py-10 text-center text-sm text-slate-500">Chưa quét mã lạ nào.</p>;
    }
    return (
        <table aria-label="Mã lạ đã quét" className="w-full text-[13px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                    <th className="w-10 px-2 py-2 text-left border-b border-slate-200">#</th>
                    <th className="px-2 py-2 text-left border-b border-slate-200">Mã đã quét</th>
                    <th className="px-2 py-2 text-left border-b border-slate-200">Loại</th>
                    <th className="w-[80px] px-2 py-2 text-center border-b border-slate-200">Số lần</th>
                    <th className="w-[150px] px-2 py-2 text-left border-b border-slate-200">Quét lần cuối</th>
                    <th className="w-10 px-2 py-2 border-b border-slate-200"><span className="sr-only">Xoá</span></th>
                </tr>
            </thead>
            <tbody>
                {entries.map((entry, index) => (
                    <tr key={`${entry.type}:${entry.value}`} className={index % 2 ? 'bg-rose-50/40' : 'bg-white'}>
                        <td className="px-2 py-1.5 border-b border-slate-100 text-slate-400 tabular-nums">{index + 1}</td>
                        <td className="px-2 py-1.5 border-b border-slate-100">
                            <CodeText value={entry.value} className="text-[15px] font-semibold text-slate-700" tailClassName="text-[18px] font-black text-rose-600" />
                        </td>
                        <td className="px-2 py-1.5 border-b border-slate-100 text-slate-700">
                            {entry.type === 'imei'
                                ? <>IMEI lạ{entry.forCode ? <span className="text-slate-500"> khi quét {nameOf(entry.forCode) || entry.forCode}</span> : null}</>
                                : 'Mã không có trong hoá đơn'}
                        </td>
                        <td className="px-2 py-1.5 border-b border-slate-100 text-center font-bold tabular-nums text-rose-700">{entry.count}</td>
                        <td className="px-2 py-1.5 border-b border-slate-100 text-slate-500 tabular-nums">{timeText(entry.lastAt)}</td>
                        <td className="px-2 py-1.5 border-b border-slate-100 text-right">
                            <button type="button" aria-label={`Xoá ${entry.value} khỏi mã lạ`} title="Quét nhầm thì xoá khỏi danh sách"
                                onClick={() => onRemove(entry.value, entry.type)}
                                className="w-6 h-6 rounded-full inline-flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <AppIcon name="close" size="xs" />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

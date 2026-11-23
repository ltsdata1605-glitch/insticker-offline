import React, { useMemo, useState } from 'react';
import { Modal } from '../../components/shared/ui/Modal';
import { Button } from '../../components/shared/ui/Button';
import { Checkbox } from '../../components/shared/ui/Checkbox';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { saoChep } from '../../components/shared/ui/saoChep';
import type { KiemHangSession } from './kiemHangData';
import { timeText } from './kiemHangData';
import type { InvoiceReport } from './kiemHangReport';
import { buildReport, fromStoreText, mycText, reportSummary, reportText, senderText } from './kiemHangReport';

interface KiemHangReportDialogProps {
    session: KiemHangSession;
    /** finish: mở từ nút Kết thúc, có nút kết thúc và lưu */
    mode: 'view' | 'finish';
    onClose: () => void;
    onExport: () => void;
    onFinish?: () => void;
    /** Có thì sửa được tên người kiểm ngay trong báo cáo (phiên đang kiểm); phiên trong lịch sử chỉ xem */
    onCheckerChange?: (name: string) => void;
}

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) =>
    value ? (
        <div className="min-w-0">
            <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
            <dd className="text-[13px] font-semibold text-slate-800 break-words">{value}</dd>
        </div>
    ) : null;

/** Một MYC: số nhận, thiếu, các nhóm thiếu và danh sách cụ thể. MYC chưa đủ thì mở sẵn danh sách. */
const InvoiceBlock: React.FC<{ item: InvoiceReport }> = ({ item }) => {
    const [open, setOpen] = useState(!item.complete);
    const { invoice, totals } = item;
    return (
        <li className={`rounded-card border ${item.complete ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'}`}>
            <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
                className="w-full text-left px-3 py-2.5 flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${item.complete ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                    {item.complete ? 'ĐỦ' : 'CHƯA ĐỦ'}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-slate-900 break-words">MYC {mycText(invoice)}</span>
                    <span className="block text-[12px] text-slate-600 break-words">
                        {[invoice.invoiceNo && `HĐ ${invoice.invoiceNo}`, `Phiếu ${invoice.transferId}`, invoice.createdAt, senderText(invoice) && `Người chuyển ${senderText(invoice)}`].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-black tabular-nums text-slate-900">{totals.received}/{totals.expected}</span>
                    <span className={`block text-[11px] font-bold ${item.complete ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {item.complete ? 'Đủ hàng' : [totals.missing && `Thiếu ${totals.missing} SP · ${item.missingGroups} nhóm`, totals.extra && `Thừa ${totals.extra}`].filter(Boolean).join(' · ')}
                    </span>
                </span>
                <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size="sm" className="mt-1 shrink-0 text-slate-400" />
            </button>
            {open && item.groups.length > 0 && (
                <div className="px-3 pb-3 space-y-2">
                    {item.groups.map(group => (
                        <div key={group.name} className="rounded-control bg-white border border-slate-200">
                            <p className="px-2.5 py-1.5 border-b border-slate-100 text-[12px] font-bold text-slate-700">
                                {group.name}
                                <span className="ml-2 font-semibold text-amber-700">{[group.missing && `thiếu ${group.missing}`, group.extra && `thừa ${group.extra}`].filter(Boolean).join(', ')}</span>
                            </p>
                            <ul className="divide-y divide-slate-100">
                                {group.items.map(({ line, received, diff }) => (
                                    <li key={line.key} className="px-2.5 py-1.5 flex items-start gap-2 text-[12px]">
                                        <span className="w-[108px] shrink-0 font-mono text-slate-600">{line.code}</span>
                                        <span className="min-w-0 flex-1 text-slate-800">
                                            {line.name}
                                            {line.imei && <span className="ml-1.5 font-mono text-violet-700">IMEI {line.imei}</span>}
                                        </span>
                                        <span className="shrink-0 tabular-nums text-slate-500">{received}/{line.expected}</span>
                                        <span className={`w-16 shrink-0 text-right font-bold ${diff < 0 ? 'text-amber-700' : 'text-rose-600'}`}>
                                            {diff < 0 ? `Thiếu ${-diff}` : `Thừa ${diff}`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </li>
    );
};

/** Báo cáo kiểm hàng để gửi người chuyển: sao chép thành tin nhắn, hoặc xuất Excel. */
export const KiemHangReportDialog: React.FC<KiemHangReportDialogProps> = ({ session, mode, onClose, onExport, onFinish, onCheckerChange }) => {
    const report = useMemo(() => buildReport(session), [session]);
    const [compact, setCompact] = useState(true);
    const allGood = report.completeCount === report.invoices.length && report.unknown.length === 0;
    const pending = session.invoices.filter(invoice => !invoice.hasDetail);
    const firstInvoice = session.invoices.find(invoice => invoice.hasDetail);

    const footer = (
        <div className="flex flex-wrap items-center gap-2 w-full">
            <Checkbox
                checked={compact}
                onChange={() => setCompact(value => !value)}
                label="Gộp MYC đủ hàng vào một dòng"
                wrapperClassName="flex items-center gap-2 text-[13px] text-slate-700 mr-auto"
            />
            <Button variant="secondary" icon="spreadsheet" onClick={onExport}>Xuất Excel</Button>
            <Button
                variant={mode === 'finish' ? 'secondary' : 'primary'}
                icon="copy"
                onClick={() => void saoChep(reportText(report, { compactComplete: compact }), { thanhCong: 'Đã sao chép báo cáo, dán vào Zalo hoặc tin nhắn để gửi' })}
            >
                Sao chép để gửi
            </Button>
            {mode === 'finish' && onFinish && (
                <Button icon="check" onClick={onFinish} className="!bg-emerald-600 hover:!bg-emerald-700 !text-white border-transparent">Kết thúc và lưu</Button>
            )}
        </div>
    );

    return (
        <Modal isOpen={true} onClose={onClose} title="Báo cáo kiểm hàng" subTitle={report.title} maxWidth="xl" footer={footer} zIndex="z-[200]">
            <div className="space-y-3">
                <div className={`rounded-card border-2 px-4 py-3 flex items-center gap-3 ${allGood ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                    <AppIcon name={allGood ? 'success' : 'warning'} size="lg" className="shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[16px] font-black">{allGood ? 'Đã kiểm đủ hàng' : 'Chưa đủ hàng'}</p>
                        <p data-testid="bao-cao-tom-tat" className="text-[13px]">
                            {reportSummary(report)} Đã nhận {report.totals.received.toLocaleString('vi-VN')}/{report.totals.expected.toLocaleString('vi-VN')} sản phẩm.
                        </p>
                    </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-card border border-slate-200 bg-white px-4 py-3">
                    <InfoRow label="Kho chuyển" value={report.fromStores.join(', ') || (firstInvoice ? fromStoreText(firstInvoice) : '')} />
                    <InfoRow label="Kho nhận" value={report.toStores.join(', ')} />
                    <InfoRow label="Người chuyển" value={report.senders.join(', ')} />
                    {onCheckerChange ? (
                        <div className="min-w-0">
                            <label htmlFor="bao-cao-nguoi-kiem" className="block text-[11px] font-semibold text-slate-500">Người kiểm</label>
                            <input
                                id="bao-cao-nguoi-kiem"
                                value={session.checker ?? ''}
                                onChange={event => onCheckerChange(event.target.value)}
                                placeholder="Nhập tên người kiểm"
                                autoComplete="off"
                                spellCheck={false}
                                className={`mt-0.5 w-full h-8 rounded-control border-2 px-2 text-[13px] font-semibold text-slate-800 focus:outline-none focus:border-sky-400 ${report.checker ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}
                            />
                        </div>
                    ) : (
                        <InfoRow label="Người kiểm" value={report.checker} />
                    )}
                    <InfoRow label="Chứng từ vận chuyển" value={report.vouchers.join(', ')} />
                    <InfoRow label="Bắt đầu kiểm" value={timeText(session.createdAt)} />
                    <InfoRow label="Lập báo cáo" value={timeText(report.at)} />
                </dl>

                {pending.length > 0 && (
                    <p className="rounded-control bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
                        Còn {pending.length} hoá đơn chưa có file chi tiết nên chưa có trong báo cáo: {pending.map(invoice => invoice.invoiceNo || invoice.transferId).join(', ')}.
                    </p>
                )}

                <ul aria-label="Kết quả theo MYC" className="space-y-2">
                    {report.invoices.map(item => <InvoiceBlock key={item.invoice.transferId} item={item} />)}
                </ul>

                {report.unknown.length > 0 && (
                    <div className="rounded-card border border-rose-200 bg-rose-50/40 px-3 py-2.5">
                        <p className="text-[13px] font-bold text-rose-700">Mã đã quét nhưng không có trong phiếu</p>
                        <p className="mt-1 text-[12px] font-mono text-slate-700 break-words">
                            {report.unknown.map(entry => `${entry.type === 'imei' ? 'IMEI ' : ''}${entry.value}${entry.count > 1 ? ` (${entry.count} lần)` : ''}`).join(', ')}
                        </p>
                    </div>
                )}
            </div>
        </Modal>
    );
};

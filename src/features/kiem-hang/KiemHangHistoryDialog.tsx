import React from 'react';
import { Modal } from '../../components/shared/ui/Modal';
import { Button } from '../../components/shared/ui/Button';
import { EmptyState } from '../../components/shared/ui/EmptyState';
import type { KiemHangSession } from './kiemHangData';
import { sessionTitle, totalsOf, unknownTotal } from './kiemHangData';
import { timeText } from './kiemHangData';

interface KiemHangHistoryDialogProps {
    history: KiemHangSession[];
    onClose: () => void;
    onOpen: (session: KiemHangSession) => void;
    onExport: (session: KiemHangSession) => void;
    onReport: (session: KiemHangSession) => void;
    onDelete: (session: KiemHangSession) => void;
}

/** Các lần kiểm đã kết thúc: xem kết quả, xuất lại Excel, mở lại để kiểm tiếp, hoặc xoá. */
export const KiemHangHistoryDialog: React.FC<KiemHangHistoryDialogProps> = ({ history, onClose, onOpen, onExport, onReport, onDelete }) => (
    <Modal isOpen={true} onClose={onClose} title="Lịch sử kiểm hàng" maxWidth="xl" zIndex="z-[200]">
        {history.length === 0 ? (
            <EmptyState icon="history" title="Chưa có lần kiểm nào" description="Bấm Kết thúc khi kiểm xong, phiên kiểm sẽ được lưu ở đây." compact />
        ) : (
            <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
                {history.map(session => {
                    const totals = totalsOf(session.lines, session.received);
                    const unknown = unknownTotal(session);
                    const ok = totals.missing === 0 && totals.extra === 0 && unknown === 0;
                    return (
                        <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-[14px] text-slate-800 truncate">{sessionTitle(session)}</p>
                                <p className="text-[12px] text-slate-500">
                                    {timeText(session.finishedAt ?? session.updatedAt)} · {session.invoices.length} hoá đơn · {totals.received}/{totals.expected} sản phẩm{session.checker ? ` · Người kiểm ${session.checker}` : ''}
                                </p>
                                <p className={`text-[12px] font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {ok ? 'Đủ hàng' : [totals.missing && `Thiếu ${totals.missing}`, totals.extra && `Thừa ${totals.extra}`, unknown && `${unknown} mã lạ`].filter(Boolean).join(', ')}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <Button variant="secondary" size="sm" icon="report" onClick={() => onReport(session)}>Báo cáo</Button>
                                <Button variant="secondary" size="sm" icon="spreadsheet" onClick={() => onExport(session)}>Xuất Excel</Button>
                                <Button variant="secondary" size="sm" onClick={() => onOpen(session)}>Mở lại</Button>
                                <Button variant="ghost" size="sm" icon="delete" aria-label={`Xoá ${sessionTitle(session)}`} onClick={() => onDelete(session)} className="text-rose-600" />
                            </div>
                        </li>
                    );
                })}
            </ul>
        )}
    </Modal>
);

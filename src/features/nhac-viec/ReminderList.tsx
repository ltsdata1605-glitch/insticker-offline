import React, { useMemo, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { ConfirmDialog } from '../../components/shared/ui/ConfirmDialog';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import type { Reminder, ReminderState, ReminderView } from './nhacViecModel';
import { PRIORITY_TEXT, dateTimeText, relativeText, reminderView, repeatText } from './nhacViecModel';
import { PRESETS } from './sounds';
import { useNhacViec } from './NhacViecProvider';

const STATE_STYLE: Record<ReminderState, { label: string; className: string }> = {
    overdue: { label: 'Quá hạn', className: 'bg-rose-100 text-rose-700' },
    today: { label: 'Hôm nay', className: 'bg-amber-100 text-amber-800' },
    upcoming: { label: 'Sắp tới', className: 'bg-sky-100 text-sky-800' },
    done: { label: 'Đã xong', className: 'bg-emerald-100 text-emerald-800' },
    stopped: { label: 'Đã dừng', className: 'bg-slate-100 text-slate-600' },
};

const PRIORITY_BAR = { normal: 'bg-sky-400', important: 'bg-amber-400', urgent: 'bg-rose-500' } as const;

export const soundLabel = (reminder: Reminder): string => {
    const sound = reminder.sound;
    if (sound.kind === 'preset') return PRESETS.find(preset => preset.id === sound.preset)?.label ?? 'Chuông';
    if (sound.kind === 'tts') return 'Đọc chữ';
    return sound.name;
};

/** Một nhắc việc trong danh sách: mức độ, hạn, còn bao lâu, lặp lại, âm thanh, nút Xong, Nhân bản, Sửa và Xoá. */
export const ReminderRow: React.FC<{ view: ReminderView; now: number; onEdit: (reminder: Reminder) => void; onCopy: (reminder: Reminder) => void; highlight?: boolean }> = ({ view, now, onEdit, onCopy, highlight }) => {
    const { completeReminder, saveReminder, deleteReminder, sheet, bridge } = useNhacViec();
    const [deleteAsk, setDeleteAsk] = useState(false);
    const fromSheet = view.reminder.source?.kind === 'sheet';
    // Chỉ đọc file (link chia sẻ): sửa trong Google Sheet. Đồng bộ hai chiều: sửa ngay trong app.
    const editInSheet = fromSheet && !bridge;
    const fileUrl = sheet?.mode === 'bridge' ? sheet.sheetUrl : sheet?.url;
    const { reminder, state, occ, next } = view;
    const style = STATE_STYLE[state];
    return (
        <li data-testid="nhac-viec-dong" className={`relative flex items-start gap-3 rounded-card border bg-white px-4 py-3 pl-5 ${highlight ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200'}`}>
            <span className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-card ${PRIORITY_BAR[reminder.priority]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-slate-900 break-words">{reminder.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${style.className}`}>{style.label}</span>
                    {fromSheet && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Google Sheet · {reminder.source!.taskId || 'đang gửi'}</span>}
                    {reminder.priority !== 'normal' && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${reminder.priority === 'urgent' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}`}>
                            {PRIORITY_TEXT[reminder.priority]}
                        </span>
                    )}
                </div>
                {reminder.content && <p className="mt-0.5 text-[13px] text-slate-600 line-clamp-2 break-words">{reminder.content}</p>}
                {(reminder.assignee || reminder.assigner) && (
                    <p className="mt-0.5 text-[12px] font-semibold text-slate-700">
                        {[reminder.assignee && `Giao cho: ${reminder.assignee}`, reminder.assigner && `Người giao: ${reminder.assigner}`].filter(Boolean).join(' · ')}
                    </p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
                    {occ !== null && (
                        <span className={state === 'overdue' ? 'font-bold text-rose-600' : 'font-semibold text-slate-700'}>
                            Hạn {dateTimeText(occ)}{state !== 'done' ? ` · ${relativeText(occ, now)}` : ''}
                        </span>
                    )}
                    {reminder.repeat !== 'none' && <span className="inline-flex items-center gap-1"><AppIcon name="refresh" size="xs" />{repeatText(reminder)}{next && state !== 'done' ? ` · lần sau ${dateTimeText(next)}` : ''}</span>}
                    <span className="inline-flex items-center gap-1"><AppIcon name="notification" size="xs" />{soundLabel(reminder)}</span>
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {occ !== null && state !== 'done' && state !== 'stopped' && (
                    <Button size="sm" icon="check" onClick={() => completeReminder(reminder.id, occ)} className="!bg-emerald-600 hover:!bg-emerald-700 !text-white border-transparent">
                        Xong
                    </Button>
                )}
                {state === 'stopped' && (
                    <Button size="sm" variant="secondary" onClick={() => saveReminder({ ...reminder, stopped: false, armedAt: Date.now(), updatedAt: Date.now() })}>Bật lại</Button>
                )}
                <Button size="sm" variant="secondary" icon="copy" aria-label={`Nhân bản ${reminder.title}`} title="Nhân bản: tạo việc mới giống việc này" onClick={() => onCopy(reminder)} />
                {editInSheet ? (
                    // Việc giao từ Google Sheet (chỉ đọc): sửa trong file, app tự cập nhật ở lần đồng bộ sau
                    <Button size="sm" variant="secondary" icon="externalLink" aria-label={`Mở Google Sheet của ${reminder.title}`} title="Sửa việc này trong Google Sheet"
                        onClick={() => fileUrl && void window.stickerDesktop.reminders.openSheet(fileUrl)} />
                ) : (
                    <>
                        <Button size="sm" variant="secondary" icon="edit" aria-label={`Sửa ${reminder.title}`} onClick={() => onEdit(reminder)} />
                        {/* Việc từ Google Sheet chỉ đọc thì không có nút xoá: xoá trong app thì lần đồng bộ sau việc lại về */}
                        <Button size="sm" variant="secondary" icon="delete" aria-label={`Xoá ${reminder.title}`} title="Xoá nhắc việc này"
                            className="text-slate-500 hover:!text-rose-600 hover:!border-rose-300" onClick={() => setDeleteAsk(true)} />
                    </>
                )}
            </div>
            <ConfirmDialog
                isOpen={deleteAsk}
                onClose={() => setDeleteAsk(false)}
                onConfirm={() => {
                    deleteReminder(reminder.id);
                    setDeleteAsk(false);
                    toast.success('Đã xoá nhắc việc');
                }}
                title="Xoá nhắc việc?"
                variant="danger"
                zIndex="z-[200]"
                confirmText="Xoá"
                cancelText="Không xoá"
                message={`Việc "${reminder.title}"${reminder.repeat !== 'none' ? ' cùng mọi lần lặp lại sau' : ''} sẽ bị xoá, không lấy lại được.${fromSheet ? ' Trong Google Sheet, việc này được ghi Huỷ.' : ''}`}
            />
        </li>
    );
};

type Filter = 'active' | 'overdue' | 'today' | 'upcoming' | 'done';
const FILTERS: { id: Filter; label: string; test: (state: ReminderState) => boolean }[] = [
    { id: 'active', label: 'Chưa xong', test: state => state === 'overdue' || state === 'today' || state === 'upcoming' },
    { id: 'overdue', label: 'Quá hạn', test: state => state === 'overdue' },
    { id: 'today', label: 'Hôm nay', test: state => state === 'today' },
    { id: 'upcoming', label: 'Sắp tới', test: state => state === 'upcoming' },
    { id: 'done', label: 'Đã xong', test: state => state === 'done' || state === 'stopped' },
];

const ORDER: Record<ReminderState, number> = { overdue: 0, today: 1, upcoming: 2, done: 3, stopped: 4 };

export const sortedViews = (reminders: Reminder[], now: number): ReminderView[] =>
    reminders.map(reminder => reminderView(reminder, now))
        .sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.state === 'done' ? (b.occ ?? 0) - (a.occ ?? 0) : (a.occ ?? 0) - (b.occ ?? 0)));

/** Tab Nhắc việc: lọc theo trạng thái, tìm, tạo mới. */
export const ReminderList: React.FC<{ onCreate: () => void; onEdit: (reminder: Reminder) => void; onCopy: (reminder: Reminder) => void; highlightId?: string }> = ({ onCreate, onEdit, onCopy, highlightId }) => {
    const { reminders, now } = useNhacViec();
    const [filter, setFilter] = useState<Filter>('active');
    const [search, setSearch] = useState('');
    const views = useMemo(() => sortedViews(reminders, now), [reminders, now]);
    const key = search.trim().toLowerCase();
    const shown = views.filter(view => FILTERS.find(item => item.id === filter)!.test(view.state)
        && (!key || [view.reminder.title, view.reminder.content, view.reminder.assignee ?? '', view.reminder.assigner ?? ''].some(text => text.toLowerCase().includes(key))));

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Lọc nhắc việc" className="flex flex-wrap gap-1.5">
                    {FILTERS.map(item => {
                        const count = views.filter(view => item.test(view.state)).length;
                        const selected = filter === item.id;
                        return (
                            <button key={item.id} type="button" aria-pressed={selected} onClick={() => setFilter(item.id)}
                                className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${selected ? 'border-sky-600 bg-sky-600 text-white' : item.id === 'overdue' && count ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'}`}>
                                {item.label} {count}
                            </button>
                        );
                    })}
                </div>
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tiêu đề, nội dung, người xử lý…" aria-label="Tìm nhắc việc"
                    className="ml-auto h-9 w-56 rounded-control border border-slate-200 px-3 text-[13px] focus:outline-none focus:border-sky-400" />
                <Button icon="add" onClick={onCreate}>Tạo nhắc việc</Button>
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                {shown.length === 0 ? (
                    <li className="rounded-card border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-[14px] text-slate-500">
                        {reminders.length === 0 ? 'Chưa có nhắc việc nào. Bấm Tạo nhắc việc để bắt đầu.' : 'Không có nhắc việc nào khớp bộ lọc.'}
                    </li>
                ) : shown.map(view => <ReminderRow key={view.reminder.id} view={view} now={now} onEdit={onEdit} onCopy={onCopy} highlight={view.reminder.id === highlightId} />)}
            </ul>
        </div>
    );
};

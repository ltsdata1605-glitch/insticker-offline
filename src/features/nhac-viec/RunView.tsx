import React, { useRef, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { Input } from '../../components/shared/ui/Input';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { ConfirmDialog } from '../../components/shared/ui/ConfirmDialog';
import { toast } from '../../components/shared/ui/toast';
import { saoChep } from '../../components/shared/ui/saoChep';
import { exportElementAsImage } from '../../components/shared/export';
import type { ChecklistRun, ChecklistRunItem, ItemStatus } from './nhacViecModel';
import { STATUS_TEXT, relativeText, runOnTime, runProgress, runReportText, timeOfDay } from './nhacViecModel';
import { CameraCapture, compressImage } from './photos';
import { clockNow, useNhacViec } from './NhacViecProvider';
import { TemplateForm } from './TemplateForm';

const STATUS_STYLE: Record<ItemStatus, { icon: string; button: string; text: string }> = {
    done: { icon: '✓', button: 'border-emerald-600 bg-emerald-600 text-white', text: 'text-emerald-700' },
    issue: { icon: '!', button: 'border-amber-500 bg-amber-500 text-white', text: 'text-amber-700' },
    na: { icon: '–', button: 'border-slate-500 bg-slate-500 text-white', text: 'text-slate-500' },
    todo: { icon: '', button: '', text: 'text-slate-500' },
};

const ACTIONS: { status: ItemStatus; label: string }[] = [
    { status: 'done', label: 'Hoàn tất' },
    { status: 'issue', label: 'Có vấn đề' },
    { status: 'na', label: 'Không áp dụng' },
];

const RunItem: React.FC<{
    item: ChecklistRunItem;
    index: number;
    finished: boolean;
    performer: string;
    onChange: (item: ChecklistRunItem) => void;
}> = ({ item, index, finished, performer, onChange }) => {
    const { addMedia, getMedia } = useNhacViec();
    const [noteOpen, setNoteOpen] = useState(Boolean(item.note) || item.needNote);
    const [camera, setCamera] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const setStatus = (status: ItemStatus) => {
        const next = item.status === status ? 'todo' : status;
        onChange({ ...item, status: next, doneAt: next === 'todo' ? undefined : clockNow(), by: next === 'todo' ? undefined : performer || undefined });
        if ((next === 'issue' || next === 'na') && !noteOpen) setNoteOpen(true);
    };
    const addPhoto = async (dataUrl: string) => {
        const id = await addMedia({ dataUrl, name: `${item.title}.jpg`, kind: 'image' });
        onChange({ ...item, photos: [...item.photos, id] });
    };
    const style = STATUS_STYLE[item.status];
    const needNoteNow = (item.status === 'issue' || item.status === 'na' || item.needNote) && !item.note.trim() && item.status !== 'todo';
    const needPhotoNow = item.needPhoto && item.photos.length === 0 && (item.status === 'done' || item.status === 'issue');

    return (
        <li data-testid="viec-checklist" data-status={item.status} className={`rounded-card border bg-white p-3 ${item.status === 'issue' ? 'border-amber-300' : item.status === 'done' ? 'border-emerald-200' : 'border-slate-200'}`}>
            <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[14px] font-black ${item.status === 'todo' ? 'border-slate-300 text-slate-400' : style.button}`}>
                    {item.status === 'todo' ? index + 1 : style.icon}
                </span>
                <div className="min-w-0 flex-1">
                    <p className={`text-[15px] font-bold break-words ${item.status === 'na' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                        {item.title}
                        {item.required && item.status === 'todo' && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">Bắt buộc</span>}
                    </p>
                    {item.guide && <p className="text-[12px] text-slate-500 break-words">{item.guide}</p>}
                    <p className={`text-[12px] font-semibold ${style.text}`}>
                        {item.status === 'todo' ? '' : `${STATUS_TEXT[item.status]}${item.doneAt ? ` · ${timeOfDay(item.doneAt)}` : ''}${item.by ? ` · ${item.by}` : ''}`}
                        {item.needPhoto && <span className="ml-2 text-slate-500">Cần ảnh</span>}
                        {item.needNote && <span className="ml-2 text-slate-500">Cần ghi chú</span>}
                    </p>
                </div>
                {!finished && (
                    <div role="group" aria-label={`Trạng thái việc ${index + 1}`} className="flex shrink-0 gap-1">
                        {ACTIONS.map(action => (
                            <button key={action.status} type="button" aria-pressed={item.status === action.status} onClick={() => setStatus(action.status)}
                                className={`rounded-control border px-2.5 py-1.5 text-[12px] font-bold transition-colors ${item.status === action.status ? STATUS_STYLE[action.status].button : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'}`}>
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-2 pl-10 space-y-2">
                {(noteOpen || item.note) && (
                    <textarea value={item.note} disabled={finished} rows={2} aria-label={`Ghi chú việc ${index + 1}`}
                        onChange={e => onChange({ ...item, note: e.target.value })}
                        placeholder={item.status === 'issue' ? 'Vấn đề gì, đã xử lý thế nào?' : item.status === 'na' ? 'Vì sao không áp dụng?' : 'Ghi chú'}
                        className={`w-full rounded-control border px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-sky-400 ${needNoteNow ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`} />
                )}
                {item.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {item.photos.map(id => {
                            const media = getMedia(id);
                            return (
                                <div key={id} className="relative">
                                    {media ? <img src={media.dataUrl} alt={`Ảnh việc ${index + 1}`} className="h-16 w-16 rounded-control object-cover border border-slate-200" />
                                        : <div className="h-16 w-16 rounded-control bg-slate-100" />}
                                    {!finished && (
                                        <button type="button" aria-label="Xoá ảnh" onClick={() => onChange({ ...item, photos: item.photos.filter(p => p !== id) })}
                                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white">
                                            <AppIcon name="close" size="xs" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                {!finished && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {!noteOpen && !item.note && <Button size="xs" variant="ghost" icon="edit" onClick={() => setNoteOpen(true)}>Ghi chú</Button>}
                        <Button size="xs" variant={needPhotoNow ? 'warning' : 'ghost'} icon="takePhoto" onClick={() => setCamera(true)}>Chụp ảnh</Button>
                        <Button size="xs" variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>Chọn ảnh</Button>
                        {needPhotoNow && <span className="text-[11px] font-semibold text-amber-700">Việc này cần ảnh</span>}
                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label={`Chọn ảnh việc ${index + 1}`}
                            onChange={async e => {
                                const files = Array.from(e.target.files ?? []);
                                e.target.value = '';
                                for (const file of files) await addPhoto(await compressImage(file));
                            }} />
                    </div>
                )}
            </div>
            {camera && <CameraCapture onClose={() => setCamera(false)} onCapture={dataUrl => { setCamera(false); void addPhoto(dataUrl); }} />}
        </li>
    );
};

/** Bản báo cáo dựng riêng để xuất ảnh: gọn, nền trắng, có ảnh từng việc. */
const ReportCard = React.forwardRef<HTMLDivElement, { run: ChecklistRun }>(({ run }, ref) => {
    const { getMedia } = useNhacViec();
    const progress = runProgress(run);
    const onTime = runOnTime(run);
    return (
        <div ref={ref} style={{ width: 720 }} className="bg-white p-6 text-slate-900">
            <p className="text-[12px] font-bold uppercase tracking-wide text-sky-700">Báo cáo checklist</p>
            <h2 className="text-[24px] font-black">{run.name}</h2>
            <div data-testid="bao-cao-nguoi-lam" className="mt-2 flex items-center gap-3 rounded-lg bg-sky-50 px-3 py-2 ring-1 ring-sky-200">
                <span className="text-[12px] font-bold uppercase tracking-wide text-sky-700">Người làm</span>
                <span className="text-[20px] font-black leading-tight text-slate-900">{run.performer.trim() || 'Chưa ghi tên'}</span>
            </div>
            <p className="mt-2 text-[13px] text-slate-600">
                Ngày {run.date.split('-').reverse().join('/')} · Bắt đầu {timeOfDay(run.startedAt)}
                {run.finishedAt ? ` · Hoàn tất ${timeOfDay(run.finishedAt)}` : ' · Chưa hoàn tất'}{run.deadline ? ` · Hạn ${timeOfDay(run.deadline)}` : ''}
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[['Hoàn tất', progress.done, 'text-emerald-700'], ['Có vấn đề', progress.issue, 'text-amber-600'], ['Không áp dụng', progress.na, 'text-slate-500'], ['Chưa làm', progress.todo, 'text-rose-600']].map(([label, value, color]) => (
                    <div key={label as string} className="rounded-lg border border-slate-200 py-2">
                        <p className={`text-[22px] font-black ${color as string}`}>{value as number}</p>
                        <p className="text-[11px] font-semibold text-slate-500">{label as string}</p>
                    </div>
                ))}
            </div>
            {onTime !== null && (
                <p className={`mt-2 text-[13px] font-bold ${onTime ? 'text-emerald-700' : 'text-rose-600'}`}>{onTime ? 'Hoàn tất đúng hạn' : 'Hoàn tất trễ hạn'}</p>
            )}
            <ol className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {run.items.map((item, index) => (
                    <li key={item.id} className="px-3 py-2">
                        <p className="text-[14px] font-bold">
                            <span className={STATUS_STYLE[item.status].text}>[{item.status === 'done' ? '✓' : item.status === 'issue' ? '!' : item.status === 'na' ? '–' : ' '}]</span> {index + 1}. {item.title}
                            <span className={`ml-2 text-[12px] font-semibold ${STATUS_STYLE[item.status].text}`}>{STATUS_TEXT[item.status]}{item.doneAt ? ` · ${timeOfDay(item.doneAt)}` : ''}</span>
                        </p>
                        {item.note.trim() && <p className="text-[13px] text-slate-700">Ghi chú: {item.note.trim()}</p>}
                        {item.photos.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                {item.photos.map(id => {
                                    const media = getMedia(id);
                                    return media ? <img key={id} src={media.dataUrl} alt="" className="h-24 w-24 rounded object-cover" /> : null;
                                })}
                            </div>
                        )}
                    </li>
                ))}
            </ol>
            {run.note.trim() && <p className="mt-3 text-[13px]"><strong>Ghi chú chung:</strong> {run.note.trim()}</p>}
        </div>
    );
});
ReportCard.displayName = 'ReportCard';

const exportRunExcel = async (run: ChecklistRun) => {
    const XLSX = await import('xlsx');
    const progress = runProgress(run);
    const rows: (string | number)[][] = [
        ['Báo cáo checklist', run.name],
        ['Ngày', run.date.split('-').reverse().join('/')],
        ['Người làm', run.performer],
        ['Bắt đầu', timeOfDay(run.startedAt)],
        ['Hoàn tất', run.finishedAt ? timeOfDay(run.finishedAt) : 'Chưa hoàn tất'],
        ['Hạn', run.deadline ? timeOfDay(run.deadline) : ''],
        ['Kết quả', `${progress.done}/${progress.total} hoàn tất, ${progress.issue} có vấn đề, ${progress.na} không áp dụng, ${progress.todo} chưa làm`],
        ['Ghi chú chung', run.note],
        [],
        ['STT', 'Việc', 'Bắt buộc', 'Trạng thái', 'Giờ', 'Người làm', 'Ghi chú', 'Số ảnh'],
        ...run.items.map((item, index) => [index + 1, item.title, item.required ? 'Có' : '', STATUS_TEXT[item.status], item.doneAt ? timeOfDay(item.doneAt) : '', item.by ?? '', item.note, item.photos.length]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [6, 44, 9, 14, 8, 16, 50, 7].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo');
    XLSX.writeFile(wb, `Checklist_${run.name.replace(/[\\/:*?"<>|\s]+/g, '_')}_${run.date}.xlsx`);
};

/** Làm một lượt checklist và báo cáo. */
export const RunView: React.FC<{ run: ChecklistRun; onBack: () => void; onOpenRun: (run: ChecklistRun) => void }> = ({ run, onBack, onOpenRun }) => {
    const { saveRun, deleteRun, setPerformer, now, templates, startNewRun, sheet } = useNhacViec();
    const template = templates.find(item => item.id === run.templateId) ?? null;
    const hasTemplate = template !== null;
    const [editingTemplate, setEditingTemplate] = useState(false);
    const [finishAsk, setFinishAsk] = useState(false);
    const [deleteAsk, setDeleteAsk] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);
    const progress = runProgress(run);
    const finished = Boolean(run.finishedAt);
    const update = (change: Partial<ChecklistRun>) => saveRun({ ...run, ...change });

    const finish = () => {
        update({ finishedAt: clockNow() });
        setFinishAsk(false);
        toast.success('Đã hoàn tất checklist');
    };

    return (
        <div className="flex h-full min-h-0 gap-4">
            <section className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3 rounded-card border border-slate-200 bg-white px-4 py-3">
                    <Button variant="ghost" size="sm" icon="back" onClick={onBack}>Quay lại</Button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[18px] font-black text-slate-900 break-words">{run.name}</p>
                        <p className="text-[12px] text-slate-500">
                            Ngày {run.date.split('-').reverse().join('/')} · bắt đầu {timeOfDay(run.startedAt)}
                            {run.deadline ? ` · hạn ${timeOfDay(run.deadline)} (${finished ? (runOnTime(run) ? 'đúng hạn' : 'trễ hạn') : relativeText(run.deadline, now)})` : ''}
                        </p>
                    </div>
                    {template && (template.source?.kind === 'sheet' ? (
                        <Button variant="secondary" size="sm" icon="externalLink" title="Checklist này lấy từ Google Sheet: sửa trong file"
                            onClick={() => { const url = sheet?.mode === 'bridge' ? sheet.sheetUrl : sheet?.url; if (url) void window.stickerDesktop.reminders.openSheet(url); }}>Sửa trong Google Sheet</Button>
                    ) : (
                        <Button variant="secondary" size="sm" icon="edit" title={finished ? 'Sửa mẫu cho các lượt sau, lượt đã hoàn tất giữ nguyên' : 'Sửa mẫu: tên, việc, lịch. Lượt đang làm nhận ngay thay đổi, giữ kết quả đã đánh'}
                            onClick={() => setEditingTemplate(true)}>Sửa mẫu</Button>
                    ))}
                    <label className="flex items-center gap-2 whitespace-nowrap text-[12px] font-bold text-slate-600">
                        Người làm
                        <Input value={run.performer} disabled={finished} aria-label="Người làm"
                            onChange={e => { update({ performer: e.target.value }); setPerformer(e.target.value); }} className="w-52" placeholder="Tên hoặc mã NV" />
                    </label>
                </div>
                <div className="flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Tiến độ checklist" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                        <div className={`h-full rounded-full ${progress.todo === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${progress.percent}%` }} />
                    </div>
                    <span data-testid="tien-do-checklist" className="text-[13px] font-bold text-slate-700 tabular-nums">{progress.handled}/{progress.total} việc · {progress.percent}%</span>
                </div>
                <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    {run.items.map((item, index) => (
                        <RunItem key={item.id} item={item} index={index} finished={finished} performer={run.performer}
                            onChange={next => update({ items: run.items.map(i => (i.id === next.id ? next : i)) })} />
                    ))}
                </ol>
            </section>

            <aside className="flex w-[300px] xl:w-[330px] shrink-0 flex-col gap-3">
                <section className="rounded-card border border-slate-200 bg-white p-3 space-y-2">
                    <p className="text-[12px] font-bold text-slate-600">Kết quả</p>
                    <div className="grid grid-cols-2 gap-2 text-center">
                        {[['Hoàn tất', progress.done, 'text-emerald-700'], ['Có vấn đề', progress.issue, 'text-amber-600'], ['Không áp dụng', progress.na, 'text-slate-500'], ['Chưa làm', progress.todo, 'text-rose-600']].map(([label, value, color]) => (
                            <div key={label as string} className="rounded-control bg-slate-50 py-1.5">
                                <p className={`text-[20px] font-black ${color as string}`}>{value as number}</p>
                                <p className="text-[11px] font-semibold text-slate-500">{label as string}</p>
                            </div>
                        ))}
                    </div>
                    <textarea value={run.note} disabled={finished} rows={3} aria-label="Ghi chú chung" onChange={e => update({ note: e.target.value })}
                        placeholder="Ghi chú chung cho cả lượt" className="w-full rounded-control border border-slate-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-sky-400" />
                </section>
                <section className="rounded-card border border-slate-200 bg-white p-3 space-y-2">
                    <p className="text-[12px] font-bold text-slate-600">Báo cáo</p>
                    <Button className="w-full" icon="copy" onClick={() => void saoChep(runReportText(run, now), { thanhCong: 'Đã sao chép báo cáo, dán vào Zalo để gửi' })}>Sao chép để gửi</Button>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" icon="exportImage" onClick={() => {
                            if (reportRef.current) void exportElementAsImage(reportRef.current, `Checklist_${run.name.replace(/\s+/g, '_')}_${run.date}.png`, { preset: 'raw', footer: false });
                        }}>Xuất ảnh</Button>
                        <Button variant="secondary" icon="spreadsheet" onClick={() => void exportRunExcel(run)}>Xuất Excel</Button>
                    </div>
                </section>
                {finished ? (
                    <section className="rounded-card border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                        <p className="text-[14px] font-bold text-emerald-800">Đã hoàn tất lúc {timeOfDay(run.finishedAt!)}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => update({ finishedAt: undefined })}>Mở lại để sửa</Button>
                            {hasTemplate && (
                                <Button variant="secondary" size="sm" icon="add" title="Làm thêm một lượt mới từ đầu, lượt này vẫn giữ nguyên"
                                    onClick={() => { const next = startNewRun(run.templateId); if (next) onOpenRun(next); }}>Làm lượt mới</Button>
                            )}
                        </div>
                    </section>
                ) : (
                    <Button size="lg" icon="check" className="w-full !bg-emerald-600 hover:!bg-emerald-700 !text-white border-transparent"
                        onClick={() => (progress.requiredTodo > 0 || progress.missingEvidence.length > 0 ? setFinishAsk(true) : finish())}>
                        Hoàn tất checklist
                    </Button>
                )}
                <Button variant="ghost" size="sm" icon="delete" className="text-rose-600" onClick={() => setDeleteAsk(true)}>Xoá lượt này</Button>
            </aside>

            {editingTemplate && template && <TemplateForm template={template} onClose={() => setEditingTemplate(false)} />}

            <div aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0">
                <ReportCard ref={reportRef} run={run} />
            </div>

            <ConfirmDialog
                isOpen={finishAsk}
                onClose={() => setFinishAsk(false)}
                onConfirm={finish}
                title="Hoàn tất khi còn thiếu?"
                variant="warning"
                zIndex="z-[200]"
                confirmText="Vẫn hoàn tất"
                cancelText="Làm tiếp"
                message={(
                    <span className="block space-y-1">
                        {progress.requiredTodo > 0 && <span className="block">Còn {progress.requiredTodo} việc bắt buộc chưa làm.</span>}
                        {progress.missingEvidence.length > 0 && <span className="block">{progress.missingEvidence.length} việc còn thiếu ảnh hoặc ghi chú.</span>}
                        <span className="block font-semibold">Ghi lý do vào Ghi chú chung trước khi hoàn tất để báo cáo rõ ràng.</span>
                    </span>
                )}
            />
            <ConfirmDialog
                isOpen={deleteAsk}
                onClose={() => setDeleteAsk(false)}
                onConfirm={() => { deleteRun(run.id); setDeleteAsk(false); onBack(); toast.success('Đã xoá lượt checklist'); }}
                title="Xoá lượt checklist?"
                variant="danger"
                zIndex="z-[200]"
                confirmText="Xoá"
                cancelText="Không xoá"
                message="Lượt này cùng ghi chú và ảnh sẽ bị xoá, không lấy lại được."
            />
        </div>
    );
};

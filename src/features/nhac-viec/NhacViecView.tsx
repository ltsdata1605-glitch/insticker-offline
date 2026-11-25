import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { ConfirmDialog } from '../../components/shared/ui/ConfirmDialog';
import { Input } from '../../components/shared/ui/Input';
import { Modal } from '../../components/shared/ui/Modal';
import { Switch } from '../../components/shared/ui/Switch';
import { Tabs } from '../../components/shared/ui/Tabs';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { TopBarActions } from '../../components/shared/ui/TopBarActions';
import { toast } from '../../components/shared/ui/toast';
import { ghiClipboard } from '../../components/shared/ui/saoChep';
import type { BackgroundChange, BackgroundSettings } from '../../../electron/contract';
import type { ChecklistRun, ChecklistTemplate, Reminder } from './nhacViecModel';
import {
    DAY, atTime, dateKey, dateTimeText as dateTimeTextOf, isManagerDept, personStats, relativeText, runOfDay, runOnTime, runProgress, sameName, scheduledOn, splitRuns, startOfDay,
    statsBetween, timeOfDay, weekdayName,
} from './nhacViecModel';
import { clockNow, useNhacViec } from './NhacViecProvider';
import { TEMPLATE_COPY_URL } from './sheetTasks';
import { BRIDGE_V2 } from './sheetBridge';
import { OccDialog } from './ReminderDialogs';
import { checkTabPassword } from '../sticker-event/tabAccess';
import bridgeScript from '../../../scripts/google-sheet/cau-noi-nhac-viec.gs?raw';
import { ReminderForm } from './ReminderForm';
import { ReminderList, ReminderRow, sortedViews } from './ReminderList';
import { TemplateForm } from './TemplateForm';
import { RunView } from './RunView';
import { PRESETS, VOICE_HELP, playPreset, playSpeech, setPreferredVoiceName, vietnameseVoice, vietnameseVoices } from './sounds';

type Tab = 'today' | 'reminders' | 'checklists' | 'stats';

const scheduleText = (template: ChecklistTemplate): string => {
    const { schedule } = template;
    if (!schedule.enabled) return 'Làm khi cần';
    const days = schedule.days.length === 7 ? 'Mỗi ngày' : [1, 2, 3, 4, 5, 6, 0].filter(day => schedule.days.includes(day)).map(weekdayName).join(', ');
    return `${days} · ${schedule.start}–${schedule.due}`;
};

const STATUS_TONE = {
    done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    doing: 'bg-sky-50 text-sky-700 ring-sky-200',
    late: 'bg-rose-50 text-rose-700 ring-rose-200',
    due: 'bg-amber-50 text-amber-800 ring-amber-200',
    idle: 'bg-slate-50 text-slate-600 ring-slate-200',
} as const;

/** Tình trạng hôm nay của mẫu checklist: đã xong, đang làm, đến giờ, quá hạn; không có lịch hôm nay và chưa làm thì không ghi */
const todayStatus = (template: ChecklistTemplate, run: ChecklistRun | null, now: number): { text: string; tone: keyof typeof STATUS_TONE } | null => {
    if (run?.finishedAt) {
        const progress = runProgress(run);
        return { text: `Đã xong hôm nay ${timeOfDay(run.finishedAt)} · ${progress.handled}/${progress.total}${runOnTime(run) === false ? ' · trễ hạn' : ''}`, tone: 'done' };
    }
    const scheduled = scheduledOn(template, now);
    const due = scheduled && template.schedule.due ? atTime(now, template.schedule.due) : null;
    if (run) {
        const progress = runProgress(run);
        const late = run.deadline !== undefined ? now > run.deadline : due !== null && now > due;
        return { text: `${late ? 'Quá hạn' : 'Đang làm'} · ${progress.handled}/${progress.total}`, tone: late ? 'late' : 'doing' };
    }
    if (!scheduled || due === null) return null;
    if (now > due) return { text: `Quá hạn ${template.schedule.due}, chưa làm`, tone: 'late' };
    if (now >= atTime(now, template.schedule.start)) return { text: `Đến giờ làm · hạn ${template.schedule.due}`, tone: 'due' };
    return { text: `Hôm nay ${template.schedule.start}–${template.schedule.due}`, tone: 'idle' };
};

const dayText = (date: string): string => date.split('-').reverse().join('/');

/** Một lượt: bấm để mở; có `onDelete` thì thêm nút thùng rác để xoá (hỏi lại trước khi xoá) */
const RunRow: React.FC<{ run: ChecklistRun; now: number; onOpen: () => void; onDelete?: () => void }> = ({ run, now, onOpen, onDelete }) => {
    const progress = runProgress(run);
    const onTime = runOnTime(run);
    const late = !run.finishedAt && run.deadline !== undefined && now > run.deadline;
    /** Bắt đầu ở ngày trước mà chưa bấm Hoàn tất */
    const leftOver = !run.finishedAt && run.date < dateKey(now);
    return (
        <li data-testid="luot-checklist" className="group relative">
            <button type="button" onClick={onOpen} className="w-full rounded-control border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-300">
                <span className={`flex items-center justify-between gap-2 ${onDelete ? 'pr-8' : ''}`}>
                    <span className="min-w-0 truncate text-[14px] font-bold text-slate-800">{run.name}</span>
                    <span className={`shrink-0 text-[12px] font-bold ${run.finishedAt ? (onTime ? 'text-emerald-700' : 'text-rose-600') : leftOver ? 'text-amber-700' : late ? 'text-rose-600' : 'text-sky-700'}`}>
                        {run.finishedAt ? (onTime ? 'Đúng hạn' : 'Trễ hạn') : leftOver ? 'Chưa xong' : late ? 'Quá hạn' : 'Đang làm'}
                    </span>
                </span>
                <span className="block text-[12px] text-slate-500">
                    {dayText(run.date)} · {progress.handled}/{progress.total} việc{progress.issue ? ` · ${progress.issue} có vấn đề` : ''}{run.performer ? ` · ${run.performer}` : ''}
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${progress.todo === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${progress.percent}%` }} />
                </span>
            </button>
            {onDelete && (
                <button type="button" onClick={onDelete} aria-label={`Xoá lượt ${run.name} ngày ${dayText(run.date)}`} title="Xoá lượt này"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-control text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400">
                    <AppIcon name="delete" size="sm" />
                </button>
            )}
        </li>
    );
};

/** Tab Checklist: các mẫu (bắt đầu lượt, sửa), lượt đang làm, lượt gần đây. */
const ChecklistPanel: React.FC<{ onOpenRun: (run: ChecklistRun) => void; onEditTemplate: (template: ChecklistTemplate | null) => void; onCopyTemplate: (template: ChecklistTemplate) => void }> = ({ onOpenRun, onEditTemplate, onCopyTemplate }) => {
    const { visibleTemplates: templates, runs, now, openRunFor, sheet, deleteRun, bridgeV2 } = useNhacViec();
    const today = dateKey(now);
    const { active, stale, finished } = splitRuns(runs, today);
    const recent = finished.slice(0, 30);
    /** Lượt đang hỏi xoá, hoặc 'stale' là xoá hết lượt ngày trước chưa xong */
    const [deleteAsk, setDeleteAsk] = useState<ChecklistRun | 'stale' | null>(null);
    const row = (run: ChecklistRun) => <RunRow key={run.id} run={run} now={now} onOpen={() => onOpenRun(run)} onDelete={() => setDeleteAsk(run)} />;
    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="flex min-h-0 flex-col gap-3">
                <div className="flex items-center justify-between">
                    <p className="text-[14px] font-bold text-slate-700">Mẫu checklist ({templates.length})</p>
                    <Button icon="add" onClick={() => onEditTemplate(null)}>Tạo mẫu checklist</Button>
                </div>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    {templates.length === 0 && (
                        <li className="rounded-card border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-[14px] text-slate-500">
                            Tạo mẫu một lần (ví dụ Mở ca gồm 10 việc), mỗi ngày bấm Bắt đầu để làm và báo cáo.
                        </li>
                    )}
                    {templates.map(template => {
                        const run = runOfDay(runs, template.id, today);
                        const status = todayStatus(template, run, now);
                        const open = () => {
                            const target = run ?? openRunFor(template.id);
                            if (target) onOpenRun(target);
                        };
                        return (
                            <li key={template.id} data-testid="mau-checklist" data-trang-thai={run?.finishedAt ? 'da-xong' : run ? 'dang-lam' : 'chua-lam'} onClick={open}
                                title={run?.finishedAt ? 'Bấm để xem lượt đã làm hôm nay' : run ? 'Bấm để làm tiếp' : 'Bấm để bắt đầu'}
                                className={`flex cursor-pointer items-center gap-3 rounded-card border bg-white px-4 py-3 transition-colors hover:border-sky-300 hover:bg-sky-50/40 ${run?.finishedAt ? 'border-emerald-200' : 'border-slate-200'}`}>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-bold text-slate-900 break-words">
                                        {template.name}
                                        {template.department && <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">{template.department}</span>}
                                        {template.source?.kind === 'sheet' && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Google Sheet</span>}
                                    </p>
                                    <p className="text-[12px] text-slate-500">
                                        {template.items.length} việc · {scheduleText(template)}{template.assignee ? ` · Người làm: ${template.assignee}` : ''}{template.description ? ` · ${template.description}` : ''}
                                    </p>
                                </div>
                                {status && (
                                    <span data-testid="trang-thai-hom-nay" className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ring-1 ${STATUS_TONE[status.tone]}`}>
                                        {status.tone === 'done' && <AppIcon name="check" size="sm" />}
                                        {status.text}
                                    </span>
                                )}
                                <Button size="sm" icon={run?.finishedAt ? 'show' : 'play'} variant={run?.finishedAt ? 'secondary' : 'primary'}
                                    onClick={event => { event.stopPropagation(); open(); }}>{run?.finishedAt ? 'Xem' : run ? 'Làm tiếp' : 'Bắt đầu'}</Button>
                                <Button size="sm" variant="secondary" icon="copy" aria-label={`Nhân bản ${template.name}`} title="Nhân bản: tạo mẫu mới giống mẫu này"
                                    onClick={event => { event.stopPropagation(); onCopyTemplate(template); }} />
                                {/* Checklist từ file: đồng bộ hai chiều (script mới) thì sửa ngay trong app, chỉ đọc thì sửa trong file */}
                                {template.source?.kind === 'sheet' && !bridgeV2 ? (
                                    <Button size="sm" variant="secondary" icon="externalLink" aria-label={`Mở Google Sheet của ${template.name}`} title="Sửa checklist này trong Google Sheet"
                                        onClick={event => { event.stopPropagation(); const url = sheet?.mode === 'bridge' ? sheet.sheetUrl : sheet?.url; if (url) void window.stickerDesktop.reminders.openSheet(url); }} />
                                ) : (
                                    <Button size="sm" variant="secondary" icon="edit" aria-label={`Sửa ${template.name}`} onClick={event => { event.stopPropagation(); onEditTemplate(template); }} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>
            <section className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
                <p className="text-[14px] font-bold text-slate-700">Đang làm hôm nay ({active.length})</p>
                <ul aria-label="Đang làm hôm nay" className="space-y-2">
                    {active.length === 0 ? <li className="text-[13px] text-slate-500">Không có lượt nào đang làm.</li> : active.map(row)}
                </ul>
                {stale.length > 0 && (
                    <details className="group/cu rounded-card border border-amber-200 bg-amber-50/60 px-3 py-2">
                        <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-bold text-amber-900">
                            <AppIcon name="chevronRight" size="sm" className="transition-transform group-open/cu:rotate-90" />
                            Ngày trước chưa hoàn tất ({stale.length})
                        </summary>
                        <p className="mt-1 text-[12px] text-amber-900/80">Lượt bắt đầu ở ngày trước mà chưa bấm Hoàn tất. Mở ra để làm nốt, hoặc xoá đi.</p>
                        <ul aria-label="Ngày trước chưa hoàn tất" className="mt-2 space-y-2">{stale.map(row)}</ul>
                        <Button variant="ghost" size="sm" icon="delete" className="mt-2 text-rose-600" onClick={() => setDeleteAsk('stale')}>Xoá hết {stale.length} lượt này</Button>
                    </details>
                )}
                <p className="text-[14px] font-bold text-slate-700">Đã hoàn tất gần đây</p>
                <ul aria-label="Đã hoàn tất gần đây" className="space-y-2">
                    {recent.length === 0 ? <li className="text-[13px] text-slate-500">Chưa có lượt nào hoàn tất.</li> : recent.map(row)}
                </ul>
            </section>
            <ConfirmDialog
                isOpen={deleteAsk !== null}
                onClose={() => setDeleteAsk(null)}
                onConfirm={() => {
                    const targets = deleteAsk === 'stale' ? stale : deleteAsk ? [deleteAsk] : [];
                    for (const run of targets) deleteRun(run.id);
                    setDeleteAsk(null);
                    toast.success(targets.length > 1 ? `Đã xoá ${targets.length} lượt checklist` : 'Đã xoá lượt checklist');
                }}
                title={deleteAsk === 'stale' ? `Xoá ${stale.length} lượt ngày trước chưa hoàn tất?` : 'Xoá lượt checklist?'}
                variant="danger"
                zIndex="z-[200]"
                confirmText="Xoá"
                cancelText="Không xoá"
                message={deleteAsk === 'stale'
                    ? 'Các lượt này cùng ghi chú và ảnh sẽ bị xoá, không lấy lại được.'
                    : deleteAsk ? `Lượt ${deleteAsk.name} ngày ${dayText(deleteAsk.date)} cùng ghi chú và ảnh sẽ bị xoá, không lấy lại được.${deleteAsk.finishedAt ? ' Thống kê không còn tính lượt này.' : ''}` : ''}
            />
        </div>
    );
};

/** Tab Hôm nay: nhắc việc quá hạn và trong ngày, checklist theo lịch hôm nay. */
const TodayPanel: React.FC<{ onEdit: (reminder: Reminder) => void; onCopy: (reminder: Reminder) => void; onCreate: () => void; onOpenRun: (run: ChecklistRun) => void }> = ({ onEdit, onCopy, onCreate, onOpenRun }) => {
    const { visibleReminders: reminders, visibleTemplates: templates, runs, now, openRunFor } = useNhacViec();
    const views = useMemo(() => sortedViews(reminders, now).filter(view => view.state === 'overdue' || view.state === 'today'), [reminders, now]);
    const today = dateKey(now);
    const scheduled = templates.filter(template => scheduledOn(template, now));
    const doneToday = sortedViews(reminders, now).filter(view => view.state === 'done' && view.occ !== null && view.occ >= startOfDay(now) && view.occ < startOfDay(now) + DAY).length;
    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="flex min-h-0 flex-col gap-3">
                <div className="flex items-center justify-between">
                    <p className="text-[14px] font-bold text-slate-700">Việc cần làm hôm nay ({views.length}){doneToday ? ` · đã xong ${doneToday}` : ''}</p>
                    <Button icon="add" onClick={onCreate}>Tạo nhắc việc</Button>
                </div>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    {views.length === 0 ? (
                        <li className="rounded-card border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center text-[14px] text-slate-500">Hôm nay không còn việc nào. </li>
                    ) : views.map(view => <ReminderRow key={view.reminder.id} view={view} now={now} onEdit={onEdit} onCopy={onCopy} />)}
                </ul>
            </section>
            <section className="flex min-h-0 flex-col gap-3">
                <p className="text-[14px] font-bold text-slate-700">Checklist hôm nay ({scheduled.length})</p>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    {scheduled.length === 0 && <li className="text-[13px] text-slate-500">Không có checklist nào theo lịch hôm nay. Tạo mẫu có lịch ở tab Checklist.</li>}
                    {scheduled.map(template => {
                        const run = runOfDay(runs, template.id, today);
                        const progress = run ? runProgress(run) : null;
                        const due = atTime(now, template.schedule.due);
                        const late = !run?.finishedAt && now > due;
                        return (
                            <li key={template.id} className={`rounded-card border bg-white px-3 py-2.5 ${late ? 'border-rose-300' : run?.finishedAt ? 'border-emerald-200' : 'border-slate-200'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="min-w-0 truncate text-[14px] font-bold text-slate-900">{template.name}</p>
                                    <span className={`shrink-0 text-[12px] font-bold ${run?.finishedAt ? 'text-emerald-700' : late ? 'text-rose-600' : 'text-slate-500'}`}>
                                        {run?.finishedAt ? `Xong ${timeOfDay(run.finishedAt)}` : late ? `Quá hạn ${template.schedule.due}` : `Hạn ${template.schedule.due} · ${relativeText(due, now)}`}
                                    </span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                        <span className={`block h-full rounded-full ${progress?.todo === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${progress?.percent ?? 0}%` }} />
                                    </span>
                                    <span className="text-[12px] font-semibold text-slate-600 tabular-nums">{progress ? `${progress.handled}/${progress.total}` : `0/${template.items.length}`}</span>
                                    <Button size="xs" variant={run ? 'secondary' : 'primary'} onClick={() => {
                                        const target = run ?? openRunFor(template.id);
                                        if (target) onOpenRun(target);
                                    }}>{run ? (run.finishedAt ? 'Xem' : 'Làm tiếp') : 'Bắt đầu'}</Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
};

/** Tab Thống kê: tỉ lệ hoàn tất đúng hạn, việc hay có vấn đề, nhắc việc đã xong và bị lỡ. */
const StatsPanel: React.FC<{ onOpenRun: (run: ChecklistRun) => void }> = ({ onOpenRun }) => {
    const { visibleReminders: reminders, runs, now, bridgeV2 } = useNhacViec();
    const [days, setDays] = useState(7);
    const from = startOfDay(now) - (days - 1) * DAY;
    // Tính đến đúng lúc này: `now` trên màn chỉ cập nhật 30 giây một lần, lượt vừa bắt đầu vẫn phải được đếm
    const stats = statsBetween(reminders, runs, from, Math.max(now, clockNow()));
    const people = personStats(reminders, from, Math.max(now, clockNow()));
    const inRange = runs.filter(run => run.startedAt >= from);
    const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
    const Card: React.FC<{ label: string; value: string | number; tone?: string }> = ({ label, value, tone = 'text-slate-900' }) => (
        <div className="rounded-card border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-semibold text-slate-500">{label}</p>
            <p className={`text-[22px] font-black ${tone}`}>{value}</p>
        </div>
    );
    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div role="group" aria-label="Khoảng thời gian" className="flex gap-1.5">
                {[7, 30].map(value => (
                    <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}
                        className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${days === value ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                        {value} ngày qua
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
                <Card label="Lượt checklist" value={stats.runs} />
                <Card label="Hoàn tất" value={`${stats.finished} (${rate(stats.finished, stats.runs)})`} tone="text-emerald-700" />
                <Card label="Đúng hạn" value={rate(stats.onTime, stats.finished)} tone="text-emerald-700" />
                <Card label="Trễ hạn" value={stats.late} tone={stats.late ? 'text-rose-600' : 'text-slate-900'} />
                <Card label="Nhắc việc đã xong" value={stats.remindersDone} tone="text-emerald-700" />
                <Card label="Nhắc việc bị lỡ" value={stats.remindersMissed} tone={stats.remindersMissed ? 'text-rose-600' : 'text-slate-900'} />
            </div>
            <section aria-label="Theo người" className="rounded-card border border-slate-200 bg-white p-3">
                <p className="text-[13px] font-bold text-slate-700">Theo người · {days} ngày qua</p>
                {people.length === 0 ? <p className="mt-1 text-[13px] text-slate-500">Chưa có lần hạn nào trong khoảng này.</p> : (
                    <div className="mt-2 max-h-56 overflow-y-auto scrollbar-thin">
                        <table className="w-full text-[13px] tabular-nums">
                            <thead className="sticky top-0 bg-white text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="py-1 pr-2 text-left">Người</th>
                                    <th className="px-2 text-right">Lần hạn</th>
                                    {bridgeV2 && <th className="px-2 text-right">Đã nhận</th>}
                                    <th className="px-2 text-right">Đúng hạn</th>
                                    <th className="px-2 text-right">Trễ</th>
                                    <th className="px-2 text-right">Chưa xong</th>
                                    {bridgeV2 && <th className="pl-2 text-right">Cần hỗ trợ</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {people.map(person => (
                                    <tr key={person.name} data-testid="thong-ke-nguoi">
                                        <td className="py-1.5 pr-2 font-semibold text-slate-800">{person.name}</td>
                                        <td className="px-2 text-right">{person.total}</td>
                                        {bridgeV2 && <td className="px-2 text-right">{person.acked}</td>}
                                        <td className="px-2 text-right font-bold text-emerald-700">{person.onTime}</td>
                                        <td className={`px-2 text-right font-bold ${person.late ? 'text-amber-700' : 'text-slate-400'}`}>{person.late}</td>
                                        <td className={`px-2 text-right font-bold ${person.open ? 'text-rose-600' : 'text-slate-400'}`}>{person.open}</td>
                                        {bridgeV2 && <td className={`pl-2 text-right font-bold ${person.help ? 'text-amber-700' : 'text-slate-400'}`}>{person.help}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <section className="rounded-card border border-slate-200 bg-white p-3">
                    <p className="text-[13px] font-bold text-slate-700">Việc hay có vấn đề</p>
                    <ol className="mt-2 space-y-1 text-[13px]">
                        {stats.topIssues.length === 0 ? <li className="text-slate-500">Không có việc nào báo vấn đề.</li>
                            : stats.topIssues.map(issue => <li key={issue.title} className="flex justify-between gap-2"><span className="min-w-0 truncate">{issue.title}</span><strong className="text-amber-700">{issue.count} lần</strong></li>)}
                    </ol>
                </section>
                <section className="flex min-h-0 flex-col rounded-card border border-slate-200 bg-white p-3">
                    <p className="text-[13px] font-bold text-slate-700">Các lượt checklist ({inRange.length})</p>
                    <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                        {inRange.map(run => <RunRow key={run.id} run={run} now={now} onOpen={() => onOpenRun(run)} />)}
                    </ul>
                </section>
            </div>
        </div>
    );
};

const SheetStep: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
    <li className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[12px] font-black text-white">{n}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[14px] font-bold text-slate-800">{title}</p>
            {children}
        </div>
    </li>
);

/**
 * Script cầu nối trong file là bản cũ: hướng dẫn quản lý dán script mới (sao chép sẵn từ app) để dùng Đã nhận, Cần hỗ trợ, ảnh khi
 * xong, checklist từ app và trang Tổng quan.
 */
const ScriptUpdate: React.FC<{ sheetUrl?: string }> = ({ sheetUrl }) => {
    const copy = async () => {
        if (await ghiClipboard(bridgeScript)) toast.success('Đã sao chép script mới, dán vào Apps Script của file');
        else toast.error('Không sao chép được, thử lại');
    };
    return (
        <div data-testid="cap-nhat-script" className="space-y-2 rounded-control border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-950">
            <p className="text-[13px]">
                <strong>Script trong file Google Sheet là bản cũ.</strong> Cập nhật để dùng Đã nhận, Cần hỗ trợ, ảnh khi xong, checklist tạo trong app lên file và trang
                Tổng quan. Quản lý làm một lần, khoảng 3 phút:
            </p>
            <ol className="list-decimal space-y-0.5 pl-5">
                <li>Bấm <strong>Sao chép script mới</strong> bên dưới.</li>
                <li>Mở file Google Sheet → menu <strong>Tiện ích mở rộng → Apps Script</strong>, xoá hết nội dung Mã.gs, dán vào, bấm <strong>Lưu</strong>.</li>
                <li>Tải lại trang file, menu <strong>Nhắc việc → Cập nhật file cho app mới</strong>, cho phép quyền (để lưu ảnh nhân viên gửi vào Drive).</li>
                <li>Trong Apps Script: <strong>Triển khai → Quản lý bản triển khai</strong> → bút chì → Phiên bản: <strong>Phiên bản mới</strong> → <strong>Triển khai</strong>. Link kết nối giữ nguyên.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="copy" onClick={() => void copy()}>Sao chép script mới</Button>
                {sheetUrl && <Button size="sm" variant="secondary" icon="externalLink" onClick={() => void window.stickerDesktop.reminders.openSheet(sheetUrl)}>Mở Google Sheet</Button>}
            </div>
        </div>
    );
};

/**
 * Bộ phận của máy: máy Kho chỉ nhắc việc Kho và việc chung; máy Quản lý thấy việc mọi bộ phận, được báo việc quá hạn và nhân viên cần
 * hỗ trợ. Đổi bộ phận cần mật khẩu quản lý để nhân viên không tự đổi.
 */
const DepartmentSection: React.FC = () => {
    const { role, departments, setDepartment } = useNhacViec();
    const [pending, setPending] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const current = role.department;
    const choose = (value: string) => {
        if (sameName(value, current) || (!value && !current)) return;
        setPending(value);
        setPassword('');
        setError('');
    };
    const confirm = async (event: React.FormEvent) => {
        event.preventDefault();
        if (pending === null) return;
        if (!(await checkTabPassword(password))) {
            setError('Mật khẩu không đúng.');
            return;
        }
        setDepartment(pending);
        toast.success(pending ? `Máy này thuộc bộ phận ${pending}` : 'Máy này nhận mọi việc');
        setPending(null);
    };
    return (
        <section aria-label="Bộ phận của máy này" className="space-y-2 rounded-card border border-slate-200 bg-white px-4 py-3">
            <div>
                <p className="text-[15px] font-bold text-slate-900">Bộ phận của máy này</p>
                <p className="text-[12px] text-slate-500">
                    Máy Kho chỉ nhắc việc của Kho và việc chung, không làm phiền bởi việc của bộ phận khác. Máy Quản lý thấy việc mọi bộ phận và được báo khi việc
                    quá hạn 15 phút chưa xong hay nhân viên bấm Cần hỗ trợ. Đổi bộ phận cần mật khẩu quản lý.
                </p>
            </div>
            <div role="group" aria-label="Bộ phận của máy" className="flex flex-wrap gap-1.5">
                {['', ...departments].map(name => {
                    const on = name ? sameName(name, current) : !current;
                    return (
                        <button key={name || '-'} type="button" aria-pressed={on} onClick={() => choose(name)}
                            className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${on ? 'border-violet-600 bg-violet-600 text-white' : pending === name ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300'}`}>
                            {name || 'Mọi việc'}
                        </button>
                    );
                })}
            </div>
            {pending !== null && (
                <form onSubmit={event => void confirm(event)} className="flex flex-wrap items-center gap-2 rounded-control bg-violet-50 px-3 py-2">
                    <span className="text-[13px] text-violet-900">Đổi sang <strong>{pending || 'Mọi việc'}</strong>:</span>
                    <Input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="Mật khẩu quản lý" aria-label="Mật khẩu quản lý" autoFocus className="w-44" />
                    <Button type="submit" size="sm">Đổi bộ phận</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>Huỷ</Button>
                    {error && <p role="alert" className="w-full text-[12px] font-semibold text-rose-600">{error}</p>}
                </form>
            )}
            {isManagerDept(current) && <p className="text-[12px] font-semibold text-violet-800">Máy quản lý: lọc việc theo bộ phận ở tab Nhắc việc.</p>}
        </section>
    );
};

/**
 * Đồng bộ với Google Sheet: tạo file từ mẫu, bật đồng bộ hai chiều trong file, dán Link kết nối. Đã kết nối thì xem tình trạng,
 * đặt tên của mình, đồng bộ ngay, ngắt kết nối. Việc tạo trên máy tự lên file. Link chia sẻ file thường vẫn dùng được (chỉ đọc).
 */
const SheetSection: React.FC = () => {
    const { sheet, bridge, syncing, pendingCount, performer, setPerformer, connectSheet, disconnectSheet, syncSheet } = useNhacViec();
    const [link, setLink] = useState('');
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [name, setName] = useState(performer);
    const open = (url?: string) => url && void window.stickerDesktop.reminders.openSheet(url);
    const connect = async (url = link) => {
        setBusy(true);
        const outcome = await connectSheet(url);
        setBusy(false);
        setResult(outcome);
        if (outcome.ok) setLink('');
    };
    /** Đỡ phải gõ: lấy Link kết nối (hoặc link Google Sheet) vừa sao chép và kết nối luôn */
    const pasteAndConnect = async () => {
        const copied = await window.stickerDesktop.reminders.readSheetLinkFromClipboard();
        if (!copied) {
            setResult({ ok: false, message: 'Chưa có Link kết nối trong bộ nhớ tạm. Trong file: menu Nhắc việc → Bật đồng bộ hai chiều → Sao chép Link kết nối.' });
            return;
        }
        setLink(copied);
        await connect(copied);
    };
    const pasteButton = (label: string) => <Button icon="paste" isLoading={busy} onClick={() => void pasteAndConnect()}>{label}</Button>;
    const status = sheet && (
        <p data-testid="tinh-trang-sheet" className={`rounded-control px-3 py-2 text-[13px] font-semibold ${sheet.lastOk === false ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {sheet.lastSyncAt === undefined ? 'Chưa đọc lần nào'
                : sheet.lastOk === false ? `${dateTimeTextOf(sheet.lastSyncAt)}: ${sheet.lastMessage}`
                    : `${bridge ? 'Đồng bộ' : 'Đọc'} lúc ${dateTimeTextOf(sheet.lastSyncAt)}: ${sheet.taskCount ?? 0} công việc đang giao, ${sheet.checklistCount ?? 0} checklist`}
            {pendingCount > 0 && <span className="block text-amber-800">Còn {pendingCount} thay đổi chưa gửi lên Google Sheet, app tự gửi khi có mạng.</span>}
        </p>
    );
    return (
        <section aria-label="Đồng bộ với Google Sheet" className="rounded-card border border-slate-200 bg-white px-4 py-3 space-y-3">
            <div>
                <p className="text-[15px] font-bold text-slate-900">Đồng bộ với Google Sheet</p>
                <p className="text-[12px] text-slate-500">
                    Việc và checklist trên máy và trên Google Sheet là một: quản lý giao việc trong file hoặc ngay trong app, các máy nhận trong khoảng 1 phút;
                    việc tạo, sửa, xoá trong app tự ghi lên file; bấm Đã xong ở máy nào thì file ghi người xong và giờ xong.
                </p>
            </div>
            {sheet ? (
                <div className="space-y-2">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${bridge ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{bridge ? 'Đồng bộ hai chiều' : 'Chỉ nhận việc'}</span>
                        <span className="font-semibold break-all">{bridge ? sheet.title || 'File nhắc việc' : sheet.url}</span>
                    </p>
                    {status}
                    {bridge && sheet.lastOk !== false && (sheet.scriptVersion ?? 1) < BRIDGE_V2 && <ScriptUpdate sheetUrl={sheet.sheetUrl} />}
                    {bridge && (
                        <div className="space-y-1">
                            <div className="flex gap-2">
                                <Input value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() !== performer && setPerformer(name.trim())}
                                    placeholder="Ví dụ: Ngọc - Quầy 1" aria-label="Tên của bạn" />
                                <Button variant="secondary" disabled={name.trim() === performer} onClick={() => setPerformer(name.trim())}>Lưu tên</Button>
                            </div>
                            <p className="text-[11px] text-slate-500">Tên của bạn ghi vào cột Người xong khi bấm Đã xong, và cột Người giao khi bạn tạo việc.</p>
                        </div>
                    )}
                    {sheet.skipped && sheet.skipped.length > 0 && (
                        <ul className="rounded-control border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800 space-y-0.5">
                            <li className="font-bold">App bỏ qua {sheet.skipped.length} dòng ghi chưa đúng:</li>
                            {sheet.skipped.slice(0, 8).map(item => <li key={`${item.sheet}-${item.row}`}>{item.sheet ? `Trang ${item.sheet}, d` : 'D'}òng {item.row}: {item.reason}</li>)}
                        </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" icon="refresh" isLoading={syncing} onClick={() => void syncSheet()}>Đồng bộ ngay</Button>
                        <Button size="sm" variant="secondary" icon="externalLink" onClick={() => open(bridge ? sheet.sheetUrl : sheet.url)}>Mở Google Sheet</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => {
                            if (pendingCount > 0 && !window.confirm(`Còn ${pendingCount} thay đổi chưa gửi lên Google Sheet sẽ bị bỏ. Vẫn ngắt kết nối?`)) return;
                            disconnectSheet();
                        }}>Ngắt kết nối</Button>
                    </div>
                    {!bridge && (
                        <div className="space-y-1.5 rounded-control border border-sky-200 bg-sky-50/70 px-3 py-2">
                            <p className="text-[12px] text-sky-900">
                                <strong>Bật đồng bộ hai chiều</strong> để bấm Đã xong ở máy thì file ghi lại, việc tạo trên máy lên file: trong file, menu <strong>Nhắc việc → Bật đồng bộ hai chiều</strong>,
                                làm theo hướng dẫn, bấm <strong>Sao chép Link kết nối</strong> rồi bấm nút dưới.
                            </p>
                            {pasteButton('Dán Link kết nối')}
                        </div>
                    )}
                </div>
            ) : (
                <ol className="space-y-3">
                    <SheetStep n={1} title="Tạo file nhắc việc">
                        <p className="text-[12px] text-slate-600">Trình duyệt mở trang của Google, đăng nhập rồi bấm <strong>Tạo bản sao</strong>. File mới nằm trong Google Drive của bạn, có sẵn trang Nhắc việc, Checklist, Danh mục người và Hướng dẫn.</p>
                        <Button size="sm" icon="add" onClick={() => open(TEMPLATE_COPY_URL)}>Tạo file nhắc việc</Button>
                    </SheetStep>
                    <SheetStep n={2} title="Bật đồng bộ hai chiều trong file">
                        <p className="text-[12px] text-slate-600">
                            Trong file, menu <strong>Nhắc việc → Bật đồng bộ hai chiều</strong>, làm theo khung hướng dẫn bên phải (một lần, khoảng 2 phút): có bước <strong>Triển khai</strong> trong Apps Script, xong dán <strong>URL ứng dụng web</strong> vào khung. Rồi bấm <strong>Sao chép Link kết nối</strong>.
                            Chưa thấy menu Nhắc việc thì tải lại trang file. Máy khác chỉ cần Link kết nối quản lý gửi qua Zalo.
                        </p>
                    </SheetStep>
                    <SheetStep n={3} title="Dán Link kết nối">
                        {pasteButton('Dán link đã sao chép')}
                        <div className="flex gap-2">
                            <Input value={link} onChange={e => { setLink(e.target.value); setResult(null); }} placeholder="hoặc dán tay: https://script.google.com/macros/s/…/exec?k=…" aria-label="Link kết nối" />
                            <Button variant="secondary" disabled={!link.trim() || busy} onClick={() => void connect()}>Kết nối</Button>
                        </div>
                        <p className="text-[11px] text-slate-500">Link chia sẻ file thường (docs.google.com) vẫn dùng được nhưng chỉ nhận việc, không ghi ngược lên file.</p>
                    </SheetStep>
                </ol>
            )}
            {result && <p role={result.ok ? 'status' : 'alert'} className={`text-[13px] font-semibold ${result.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{result.message}</p>}
            {sheet && (
                <p className="text-[11px] text-slate-500">
                    {bridge
                        ? 'Ai có Link kết nối đều đọc và ghi được file qua app: chỉ gửi cho người trong cửa hàng. Xoá việc trong app thì file ghi Huỷ, không mất dòng.'
                        : 'Link chia sẻ: ai có link đều xem được nội dung file, đừng ghi thông tin nhạy cảm. Ghi Huỷ ở cột Trạng thái để rút việc.'}
                </p>
            )}
        </section>
    );
};

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
/** Hệ điều hành có mở app lúc bật máy thật không, và cách sửa */
const LOGIN_STATUS: Record<NonNullable<BackgroundSettings['loginStatus']> | 'none', { ok: boolean; text: string; fix?: string } | null> = {
    none: null,
    ok: { ok: true, text: 'Đã đăng ký với máy: lần bật máy tới app tự chạy.' },
    'needs-approval': { ok: false, text: 'macOS đang chờ bạn cho phép: Cài đặt hệ thống → Cài đặt chung → Mục đăng nhập, bật Tools.', fix: 'Mở Mục đăng nhập' },
    blocked: { ok: false, text: 'Windows đang tắt app này lúc khởi động: Cài đặt → Ứng dụng → Khởi động, bật Tools.', fix: 'Mở Ứng dụng khởi động' },
    failed: { ok: false, text: IS_MAC ? 'Chưa đăng ký được với máy. Tắt rồi bật lại công tắc này, hoặc thêm Tools trong Mục đăng nhập.' : 'Chưa đăng ký được với máy. Tắt rồi bật lại công tắc này.', fix: IS_MAC ? 'Mở Mục đăng nhập' : undefined },
};

/** Cài đặt: chạy nền để nhắc khi đóng cửa sổ, khởi động cùng máy, kiểm tra giọng đọc và loa. */
const SettingsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [settings, setSettings] = useState<BackgroundSettings | null>(null);
    const [voice, setVoice] = useState<string | null | undefined>(undefined);
    const [voices, setVoices] = useState<string[]>([]);
    useEffect(() => {
        void window.stickerDesktop.reminders.getBackground().then(setSettings);
        void vietnameseVoices().then(list => setVoices(list.map(item => item.name)));
        void vietnameseVoice().then(found => setVoice(found ? found.name : null));
    }, []);
    const change = async (next: BackgroundChange) => setSettings(await window.stickerDesktop.reminders.setBackground(next));
    const login = settings ? LOGIN_STATUS[settings.loginStatus ?? 'none'] : null;
    return (
        <Modal isOpen={true} onClose={onClose} title="Cài đặt nhắc việc" maxWidth="lg" zIndex="z-[200]">
            <div className="space-y-4">
                <DepartmentSection />
                <SheetSection />
                <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white">
                    <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <span id="cd-chay-nen" className="text-[14px] text-slate-800">
                            Chạy nền khi đóng cửa sổ
                            <span className="block text-[12px] text-slate-500">Đóng cửa sổ thì app vẫn nhắc việc, biểu tượng nằm ở khay hệ thống. Tắt thì app chỉ nhắc khi đang mở.</span>
                        </span>
                        <Switch checked={settings?.runInBackground ?? true} onChange={value => void change({ runInBackground: value })} aria-labelledby="cd-chay-nen" />
                    </li>
                    <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <span id="cd-khoi-dong" className="text-[14px] text-slate-800">
                            Khởi động cùng máy
                            <span className="block text-[12px] text-slate-500">{settings?.loginItemAvailable === false ? 'Chỉ dùng được ở bản đã cài.' : 'Bật máy là app tự chạy nền để nhắc việc. Bản cài mới bật sẵn.'}</span>
                            {settings?.openAtLogin && login && (
                                <span data-testid="tinh-trang-khoi-dong" className={`mt-1 block text-[12px] font-semibold ${login.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {login.text}
                                    {login.fix && (
                                        <button type="button" onClick={() => void window.stickerDesktop.reminders.openLoginSettings()} className="ml-2 font-bold text-sky-700 underline underline-offset-2">{login.fix}</button>
                                    )}
                                </span>
                            )}
                        </span>
                        <Switch checked={settings?.openAtLogin ?? true} disabled={settings?.loginItemAvailable === false} onChange={value => void change({ openAtLogin: value })} aria-labelledby="cd-khoi-dong" />
                    </li>
                    <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <span id="cd-thuc" className="text-[14px] text-slate-800">
                            Giữ máy thức để nhắc đúng giờ
                            <span className="block text-[12px] text-slate-500">Máy không tự ngủ khi app đang chạy, màn hình vẫn tắt được. Gập máy xách tay thì máy vẫn ngủ: mở lại app báo các nhắc bị lỡ.</span>
                        </span>
                        <Switch checked={settings?.keepAwake ?? true} onChange={value => void change({ keepAwake: value })} aria-labelledby="cd-thuc" />
                    </li>
                    <li className="flex items-center justify-between gap-3 px-4 py-3">
                        <span id="cd-am-luong" className="text-[14px] text-slate-800">
                            Mở to hết âm lượng khi nhắc
                            <span className="block text-[12px] text-slate-500">Lúc nhắc kêu, loa của máy được bật tiếng và mở to hết. Bấm nút trên bảng nhắc hoặc Tắt tiếng thì trả lại mức cũ.</span>
                        </span>
                        <Switch checked={settings?.maxVolume ?? true} onChange={value => void change({ maxVolume: value })} aria-labelledby="cd-am-luong" />
                    </li>
                </ul>
                <div className="rounded-card border border-slate-200 bg-white px-4 py-3 space-y-2">
                    <p className="text-[14px] font-semibold text-slate-800">Giọng đọc tiếng Việt</p>
                    {voice === undefined ? <p className="text-[13px] text-slate-600">Đang kiểm tra giọng đọc của máy…</p>
                        : voice === null ? <p role="alert" className="text-[13px] text-amber-700">{VOICE_HELP}</p>
                            : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <select value={voice} aria-label="Giọng đọc" onChange={e => { setPreferredVoiceName(e.target.value); setVoice(e.target.value); }}
                                        className="h-9 rounded-control border border-slate-200 bg-white px-2 text-[13px] focus:outline-none focus:border-sky-400">
                                        {voices.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                    <Button size="sm" variant="secondary" icon="play" onClick={() => playSpeech('Xin chào. Đây là giọng đọc nhắc việc của Tools.', false)}>Nghe thử giọng</Button>
                                </div>
                            )}
                    <p className="text-[12px] text-slate-500">App không tự tăng âm lượng của máy được. Hãy để loa ở mức nghe rõ và bấm thử chuông:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map(preset => <Button key={preset.id} size="xs" variant="secondary" icon="play" onClick={() => playPreset(preset.id, false)}>{preset.label}</Button>)}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

/** Chức năng Nhắc việc: Hôm nay, Nhắc việc, Checklist, Thống kê. */
export default function NhacViecView({ active }: { active: boolean }): React.JSX.Element {
    const { loaded, runs, reminders, role, openRequest, clearOpenRequest } = useNhacViec();
    /** Mở từ cửa sổ nhắc: Đã xong cần kèm ghi chú, ảnh; Cần hỗ trợ */
    const [occDialog, setOccDialog] = useState<{ mode: 'done' | 'help'; id: string; occ: number } | null>(null);
    const [tab, setTab] = useState<Tab>('today');
    const [editing, setEditing] = useState<Reminder | null | 'new'>(null);
    const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null | 'new'>(null);
    const [copying, setCopying] = useState<Reminder | null>(null);
    const [copyingTemplate, setCopyingTemplate] = useState<ChecklistTemplate | null>(null);
    const [runId, setRunId] = useState<string | null>(null);
    const [highlightId, setHighlightId] = useState<string | undefined>();
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Mở từ cửa sổ nhắc: đến đúng lượt checklist hoặc nhắc việc
    useEffect(() => {
        if (!openRequest || !loaded) return;
        if (openRequest.kind === 'run') {
            setRunId(openRequest.id);
        } else if (openRequest.kind === 'done' || openRequest.kind === 'help') {
            setRunId(null);
            setOccDialog({ mode: openRequest.kind, id: openRequest.id, occ: openRequest.occ });
        } else if (openRequest.kind === 'reminder') {
            setRunId(null);
            setTab('reminders');
            setHighlightId(openRequest.id);
        } else {
            setRunId(null);
            setTab('today');
        }
        clearOpenRequest();
    }, [openRequest, loaded, clearOpenRequest]);

    const run = runId ? runs.find(item => item.id === runId) ?? null : null;
    const openRun = (target: ChecklistRun) => setRunId(target.id);

    return (
        <div className="relative h-full bg-slate-100 dark:bg-slate-900">
            {/* Tên chức năng đã hiện ở tiêu đề bên trái; cụm bên phải chỉ còn các nút chung */}
            {active && <TopBarActions>{null}</TopBarActions>}
            {loaded && (
                <div className="flex h-full min-h-0 flex-col gap-4 p-4 lg:p-5">
                    {run ? (
                        <RunView run={run} onBack={() => setRunId(null)} onOpenRun={openRun} />
                    ) : (
                        <>
                            <div className="flex shrink-0 items-center gap-3">
                                <Tabs
                                    variant="segment"
                                    size="md"
                                    activeId={tab}
                                    onChange={id => setTab(id as Tab)}
                                    items={[
                                        { id: 'today', label: 'Hôm nay' },
                                        { id: 'reminders', label: 'Nhắc việc' },
                                        { id: 'checklists', label: 'Checklist' },
                                        { id: 'stats', label: 'Thống kê' },
                                    ]}
                                />
                                {role.department && (
                                    <span data-testid="bo-phan-may" title="Bộ phận của máy này (đổi trong Cài đặt)"
                                        className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-[13px] font-bold text-violet-800 ring-1 ring-violet-200">
                                        <AppIcon name="department" size="sm" />Máy: {role.department}
                                    </span>
                                )}
                                <Button variant="secondary" icon="settings" className={role.department ? '' : 'ml-auto'} onClick={() => setSettingsOpen(true)}>Cài đặt</Button>
                            </div>
                            <div className="min-h-0 flex-1">
                                {tab === 'today' && <TodayPanel onEdit={setEditing} onCopy={setCopying} onCreate={() => setEditing('new')} onOpenRun={openRun} />}
                                {tab === 'reminders' && <ReminderList onCreate={() => setEditing('new')} onEdit={setEditing} onCopy={setCopying} highlightId={highlightId} />}
                                {tab === 'checklists' && <ChecklistPanel onOpenRun={openRun} onEditTemplate={template => setEditingTemplate(template ?? 'new')} onCopyTemplate={setCopyingTemplate} />}
                                {tab === 'stats' && <StatsPanel onOpenRun={openRun} />}
                            </div>
                        </>
                    )}
                </div>
            )}
            {editing && <ReminderForm reminder={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
            {editingTemplate && <TemplateForm template={editingTemplate === 'new' ? null : editingTemplate} onClose={() => setEditingTemplate(null)} />}
            {copying && <ReminderForm reminder={null} copyFrom={copying} onClose={() => setCopying(null)} />}
            {copyingTemplate && <TemplateForm template={null} copyFrom={copyingTemplate} onClose={() => setCopyingTemplate(null)} />}
            {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
            {occDialog && (() => {
                const target = reminders.find(item => item.id === occDialog.id);
                return target ? <OccDialog mode={occDialog.mode} reminder={target} occ={occDialog.occ} onClose={() => setOccDialog(null)} /> : null;
            })()}
        </div>
    );
}


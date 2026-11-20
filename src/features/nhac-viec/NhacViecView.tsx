import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { Input } from '../../components/shared/ui/Input';
import { Modal } from '../../components/shared/ui/Modal';
import { Switch } from '../../components/shared/ui/Switch';
import { Tabs } from '../../components/shared/ui/Tabs';
import { TopBarActions } from '../../components/shared/ui/TopBarActions';
import type { BackgroundSettings } from '../../../electron/contract';
import type { ChecklistRun, ChecklistTemplate, Reminder } from './nhacViecModel';
import { DAY, atTime, dateKey, dateTimeText as dateTimeTextOf, relativeText, runOnTime, runProgress, scheduledOn, startOfDay, statsBetween, timeOfDay, weekdayName } from './nhacViecModel';
import { clockNow, useNhacViec } from './NhacViecProvider';
import { TEMPLATE_COPY_URL } from './sheetTasks';
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

const RunRow: React.FC<{ run: ChecklistRun; now: number; onOpen: () => void }> = ({ run, now, onOpen }) => {
    const progress = runProgress(run);
    const onTime = runOnTime(run);
    const late = !run.finishedAt && run.deadline !== undefined && now > run.deadline;
    return (
        <li>
            <button type="button" onClick={onOpen} className="w-full rounded-control border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-300">
                <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-bold text-slate-800">{run.name}</span>
                    <span className={`shrink-0 text-[12px] font-bold ${run.finishedAt ? (onTime ? 'text-emerald-700' : 'text-rose-600') : late ? 'text-rose-600' : 'text-sky-700'}`}>
                        {run.finishedAt ? (onTime ? 'Đúng hạn' : 'Trễ hạn') : late ? 'Quá hạn' : 'Đang làm'}
                    </span>
                </span>
                <span className="block text-[12px] text-slate-500">
                    {run.date.split('-').reverse().join('/')} · {progress.handled}/{progress.total} việc{progress.issue ? ` · ${progress.issue} có vấn đề` : ''}{run.performer ? ` · ${run.performer}` : ''}
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${progress.todo === 0 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${progress.percent}%` }} />
                </span>
            </button>
        </li>
    );
};

/** Tab Checklist: các mẫu (bắt đầu lượt, sửa), lượt đang làm, lượt gần đây. */
const ChecklistPanel: React.FC<{ onOpenRun: (run: ChecklistRun) => void; onEditTemplate: (template: ChecklistTemplate | null) => void }> = ({ onOpenRun, onEditTemplate }) => {
    const { templates, runs, now, openRunFor, sheet } = useNhacViec();
    const active = runs.filter(run => !run.finishedAt);
    const recent = runs.filter(run => run.finishedAt).slice(0, 30);
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
                    {templates.map(template => (
                        <li key={template.id} data-testid="mau-checklist" className="flex items-center gap-3 rounded-card border border-slate-200 bg-white px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-bold text-slate-900 break-words">
                                    {template.name}
                                    {template.source?.kind === 'sheet' && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Google Sheet</span>}
                                </p>
                                <p className="text-[12px] text-slate-500">
                                    {template.items.length} việc · {scheduleText(template)}{template.assignee ? ` · Người làm: ${template.assignee}` : ''}{template.description ? ` · ${template.description}` : ''}
                                </p>
                            </div>
                            <Button size="sm" icon="play" onClick={() => {
                                const run = openRunFor(template.id);
                                if (run) onOpenRun(run);
                            }}>Bắt đầu</Button>
                            {template.source?.kind === 'sheet' ? (
                                <Button size="sm" variant="secondary" icon="externalLink" aria-label={`Mở Google Sheet của ${template.name}`} title="Sửa checklist này trong Google Sheet"
                                    onClick={() => sheet && void window.stickerDesktop.reminders.openSheet(sheet.url)} />
                            ) : (
                                <Button size="sm" variant="secondary" icon="edit" aria-label={`Sửa ${template.name}`} onClick={() => onEditTemplate(template)} />
                            )}
                        </li>
                    ))}
                </ul>
            </section>
            <section className="flex min-h-0 flex-col gap-3">
                <p className="text-[14px] font-bold text-slate-700">Đang làm ({active.length})</p>
                <ul className="space-y-2">{active.map(run => <RunRow key={run.id} run={run} now={now} onOpen={() => onOpenRun(run)} />)}</ul>
                <p className="text-[14px] font-bold text-slate-700">Đã hoàn tất gần đây</p>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    {recent.length === 0 ? <li className="text-[13px] text-slate-500">Chưa có lượt nào hoàn tất.</li>
                        : recent.map(run => <RunRow key={run.id} run={run} now={now} onOpen={() => onOpenRun(run)} />)}
                </ul>
            </section>
        </div>
    );
};

/** Tab Hôm nay: nhắc việc quá hạn và trong ngày, checklist theo lịch hôm nay. */
const TodayPanel: React.FC<{ onEdit: (reminder: Reminder) => void; onCreate: () => void; onOpenRun: (run: ChecklistRun) => void }> = ({ onEdit, onCreate, onOpenRun }) => {
    const { reminders, templates, runs, now, openRunFor } = useNhacViec();
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
                    ) : views.map(view => <ReminderRow key={view.reminder.id} view={view} now={now} onEdit={onEdit} />)}
                </ul>
            </section>
            <section className="flex min-h-0 flex-col gap-3">
                <p className="text-[14px] font-bold text-slate-700">Checklist hôm nay ({scheduled.length})</p>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                    {scheduled.length === 0 && <li className="text-[13px] text-slate-500">Không có checklist nào theo lịch hôm nay. Tạo mẫu có lịch ở tab Checklist.</li>}
                    {scheduled.map(template => {
                        const run = runs.find(item => item.templateId === template.id && item.date === today);
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
    const { reminders, runs, now } = useNhacViec();
    const [days, setDays] = useState(7);
    const from = startOfDay(now) - (days - 1) * DAY;
    // Tính đến đúng lúc này: `now` trên màn chỉ cập nhật 30 giây một lần, lượt vừa bắt đầu vẫn phải được đếm
    const stats = statsBetween(reminders, runs, from, Math.max(now, clockNow()));
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

/** Nhận việc từ Google Sheet: tạo file từ mẫu, chia sẻ, dán link; đã kết nối thì xem tình trạng, đồng bộ ngay, ngắt kết nối. */
const SheetSection: React.FC = () => {
    const { sheet, syncing, connectSheet, disconnectSheet, syncSheet } = useNhacViec();
    const [link, setLink] = useState('');
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const open = (url: string) => void window.stickerDesktop.reminders.openSheet(url);
    const connect = async (url = link) => {
        setBusy(true);
        const outcome = await connectSheet(url);
        setBusy(false);
        setResult(outcome);
        if (outcome.ok) setLink('');
    };
    /** Đỡ phải gõ: lấy link Google Sheet vừa sao chép và kết nối luôn */
    const pasteAndConnect = async () => {
        const copied = await window.stickerDesktop.reminders.readSheetLinkFromClipboard();
        if (!copied) {
            setResult({ ok: false, message: 'Chưa có link Google Sheet trong bộ nhớ tạm. Trong file, bấm Chia sẻ rồi Sao chép đường liên kết.' });
            return;
        }
        setLink(copied);
        await connect(copied);
    };
    const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
        <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[12px] font-black text-white">{n}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[14px] font-bold text-slate-800">{title}</p>
                {children}
            </div>
        </li>
    );
    return (
        <section aria-label="Nhận việc từ Google Sheet" className="rounded-card border border-slate-200 bg-white px-4 py-3 space-y-3">
            <div>
                <p className="text-[15px] font-bold text-slate-900">Nhận việc từ Google Sheet</p>
                <p className="text-[12px] text-slate-500">Quản lý ghi việc và checklist vào Google Sheet (chọn từ danh sách, không phải gõ nhiều), app tự nhận về, báo việc mới và nhắc đúng hạn. App đọc file 5 phút một lần.</p>
            </div>
            {sheet ? (
                <div className="space-y-2">
                    <p className="text-[13px] text-slate-700 break-all">Đang nhận việc từ: <span className="font-semibold">{sheet.url}</span></p>
                    <p data-testid="tinh-trang-sheet" className={`rounded-control px-3 py-2 text-[13px] font-semibold ${sheet.lastOk === false ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                        {sheet.lastSyncAt === undefined ? 'Chưa đọc lần nào'
                            : sheet.lastOk === false ? `${dateTimeTextOf(sheet.lastSyncAt)}: ${sheet.lastMessage}`
                                : `Đọc lúc ${dateTimeTextOf(sheet.lastSyncAt)}: ${sheet.taskCount ?? 0} công việc đang giao, ${sheet.checklistCount ?? 0} checklist`}
                    </p>
                    {sheet.skipped && sheet.skipped.length > 0 && (
                        <ul className="rounded-control border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800 space-y-0.5">
                            <li className="font-bold">App bỏ qua {sheet.skipped.length} dòng ghi chưa đúng:</li>
                            {sheet.skipped.slice(0, 8).map(item => <li key={`${item.sheet}-${item.row}`}>{item.sheet ? `Trang ${item.sheet}, d` : 'D'}òng {item.row}: {item.reason}</li>)}
                        </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" icon="refresh" isLoading={syncing} onClick={() => void syncSheet()}>Đồng bộ ngay</Button>
                        <Button size="sm" variant="secondary" icon="externalLink" onClick={() => open(sheet.url)}>Mở Google Sheet</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600" onClick={disconnectSheet}>Ngắt kết nối</Button>
                    </div>
                </div>
            ) : (
                <ol className="space-y-3">
                    <Step n={1} title="Tạo file nhắc việc">
                        <p className="text-[12px] text-slate-600">Trình duyệt mở trang của Google, đăng nhập rồi bấm <strong>Tạo bản sao</strong>. File mới nằm trong Google Drive của bạn, có sẵn trang Nhắc việc, Checklist, Danh mục người và Hướng dẫn.</p>
                        <Button size="sm" icon="add" onClick={() => open(TEMPLATE_COPY_URL)}>Tạo file nhắc việc</Button>
                    </Step>
                    <Step n={2} title="Chia sẻ file">
                        <p className="text-[12px] text-slate-600">
                            Trong file vừa tạo, bấm <strong>Chia sẻ</strong>, phần Quyền truy cập chung chọn <strong>Bất kỳ ai có đường liên kết</strong> và <strong>Người chỉnh sửa</strong>
                            để quản lý ghi việc được. Bấm <strong>Sao chép đường liên kết</strong>.
                        </p>
                    </Step>
                    <Step n={3} title="Dán link và kết nối">
                        <Button icon="paste" isLoading={busy} onClick={() => void pasteAndConnect()}>Dán link đã sao chép</Button>
                        <div className="flex gap-2">
                            <Input value={link} onChange={e => { setLink(e.target.value); setResult(null); }} placeholder="hoặc dán tay: https://docs.google.com/spreadsheets/d/…" aria-label="Link Google Sheet" />
                            <Button variant="secondary" disabled={!link.trim() || busy} onClick={() => void connect()}>Kết nối</Button>
                        </div>
                    </Step>
                </ol>
            )}
            {result && <p role={result.ok ? 'status' : 'alert'} className={`text-[13px] font-semibold ${result.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{result.message}</p>}
            <p className="text-[11px] text-slate-500">
                Ai có link đều xem được nội dung file, đừng ghi thông tin nhạy cảm. App chỉ đọc file: bấm Đã xong trong app không ghi ngược lên file. Ghi Huỷ ở cột Trạng thái để rút việc.
            </p>
        </section>
    );
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
    const change = async (next: Partial<Pick<BackgroundSettings, 'runInBackground' | 'openAtLogin'>>) => setSettings(await window.stickerDesktop.reminders.setBackground(next));
    return (
        <Modal isOpen={true} onClose={onClose} title="Cài đặt nhắc việc" maxWidth="lg" zIndex="z-[200]">
            <div className="space-y-4">
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
                            <span className="block text-[12px] text-slate-500">{settings?.loginItemAvailable === false ? 'Chỉ dùng được ở bản đã cài.' : 'Bật máy là app tự chạy nền để nhắc việc.'}</span>
                        </span>
                        <Switch checked={settings?.openAtLogin ?? true} disabled={settings?.loginItemAvailable === false} onChange={value => void change({ openAtLogin: value })} aria-labelledby="cd-khoi-dong" />
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
                                    <Button size="sm" variant="secondary" icon="play" onClick={() => playSpeech('Xin chào. Đây là giọng đọc nhắc việc của In Sticker.', false)}>Nghe thử giọng</Button>
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
    const { loaded, runs, openRequest, clearOpenRequest } = useNhacViec();
    const [tab, setTab] = useState<Tab>('today');
    const [editing, setEditing] = useState<Reminder | null | 'new'>(null);
    const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null | 'new'>(null);
    const [runId, setRunId] = useState<string | null>(null);
    const [highlightId, setHighlightId] = useState<string | undefined>();
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Mở từ cửa sổ nhắc: đến đúng lượt checklist hoặc nhắc việc
    useEffect(() => {
        if (!openRequest || !loaded) return;
        if (openRequest.kind === 'run') {
            setRunId(openRequest.id);
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
                        <RunView run={run} onBack={() => setRunId(null)} />
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
                                <Button variant="secondary" icon="settings" className="ml-auto" onClick={() => setSettingsOpen(true)}>Cài đặt</Button>
                            </div>
                            <div className="min-h-0 flex-1">
                                {tab === 'today' && <TodayPanel onEdit={setEditing} onCreate={() => setEditing('new')} onOpenRun={openRun} />}
                                {tab === 'reminders' && <ReminderList onCreate={() => setEditing('new')} onEdit={setEditing} highlightId={highlightId} />}
                                {tab === 'checklists' && <ChecklistPanel onOpenRun={openRun} onEditTemplate={template => setEditingTemplate(template ?? 'new')} />}
                                {tab === 'stats' && <StatsPanel onOpenRun={openRun} />}
                            </div>
                        </>
                    )}
                </div>
            )}
            {editing && <ReminderForm reminder={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
            {editingTemplate && <TemplateForm template={editingTemplate === 'new' ? null : editingTemplate} onClose={() => setEditingTemplate(null)} />}
            {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        </div>
    );
}


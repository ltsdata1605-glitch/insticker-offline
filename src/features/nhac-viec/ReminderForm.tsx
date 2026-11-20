import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/shared/ui/Modal';
import { Button } from '../../components/shared/ui/Button';
import { Input } from '../../components/shared/ui/Input';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import type { Priority, Reminder, RepeatKind, SoundSpec } from './nhacViecModel';
import { MINUTE, PRIORITY_TEXT, dateKey, defaultSpeech, newId, timeOfDay, weekdayName } from './nhacViecModel';
import type { Playback } from './sounds';
import { PRESETS, VOICE_HELP, playFile, playPreset, playSpeech, startRecording, vietnameseVoice } from './sounds';
import { clockNow, useNhacViec } from './NhacViecProvider';

const BEFORE_OPTIONS = [
    { minutes: 0, label: 'Đúng hạn' },
    { minutes: 5, label: '5 phút' },
    { minutes: 15, label: '15 phút' },
    { minutes: 30, label: '30 phút' },
    { minutes: 60, label: '1 giờ' },
    { minutes: 1440, label: '1 ngày' },
];
const REPEATS: { id: RepeatKind; label: string }[] = [
    { id: 'none', label: 'Không lặp' },
    { id: 'daily', label: 'Mỗi ngày' },
    { id: 'weekly', label: 'Theo thứ' },
    { id: 'monthly', label: 'Mỗi tháng' },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${on ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'}`;

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div className="space-y-1.5">
        <p className="text-[12px] font-bold text-slate-600">{label}</p>
        {children}
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
);

const readAsDataUrl = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});

/** Tạo hoặc sửa nhắc việc. */
export const ReminderForm: React.FC<{ reminder: Reminder | null; onClose: () => void }> = ({ reminder, onClose }) => {
    const { saveReminder, deleteReminder, templates, addMedia, getMedia } = useNhacViec();
    const start = reminder ? reminder.deadline : Math.ceil((clockNow() + 60 * MINUTE) / (5 * MINUTE)) * 5 * MINUTE;
    const [title, setTitle] = useState(reminder?.title ?? '');
    const [content, setContent] = useState(reminder?.content ?? '');
    const [date, setDate] = useState(dateKey(start));
    const [time, setTime] = useState(timeOfDay(start));
    const [before, setBefore] = useState<number[]>(reminder?.remindBefore ?? [15, 0]);
    const [repeat, setRepeat] = useState<RepeatKind>(reminder?.repeat ?? 'none');
    const [weekdays, setWeekdays] = useState<number[]>(reminder?.weekdays.length ? reminder.weekdays : [new Date(start).getDay()]);
    const [priority, setPriority] = useState<Priority>(reminder?.priority ?? 'normal');
    const [sound, setSound] = useState<SoundSpec>(reminder?.sound ?? { kind: 'preset', preset: 'chuong' });
    const [ttsText, setTtsText] = useState(reminder?.sound.kind === 'tts' ? reminder.sound.text : '');
    const [checklistId, setChecklistId] = useState(reminder?.checklistTemplateId ?? '');
    const [error, setError] = useState('');
    const [voiceMissing, setVoiceMissing] = useState(false);
    const [recording, setRecording] = useState<{ stop: () => Promise<string>; cancel: () => void; since: number } | null>(null);
    const [, forceTick] = useState(0);
    const preview = useRef<Playback | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        void vietnameseVoice().then(voice => setVoiceMissing(!voice));
        return () => {
            preview.current?.stop();
            recording?.cancel();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!recording) return;
        const timer = window.setInterval(() => forceTick(n => n + 1), 500);
        return () => window.clearInterval(timer);
    }, [recording]);

    const deadline = new Date(`${date}T${time || '00:00'}`).getTime();
    const speech = defaultSpeech({ title: title || 'Tiêu đề công việc', content }, Number.isFinite(deadline) ? deadline : clockNow(), clockNow());

    const play = (make: () => Playback) => {
        preview.current?.stop();
        preview.current = make();
    };

    const chooseFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_AUDIO_BYTES) {
            toast.error('File âm thanh lớn hơn 5 MB. Hãy chọn file ngắn hơn.');
            return;
        }
        const mediaId = await addMedia({ dataUrl: await readAsDataUrl(file), name: file.name, kind: 'audio' });
        setSound({ kind: 'file', mediaId, name: file.name });
    };

    const toggleRecording = async () => {
        if (recording) {
            const dataUrl = await recording.stop();
            setRecording(null);
            const name = `Ghi âm ${timeOfDay(Date.now())}`;
            const mediaId = await addMedia({ dataUrl, name, kind: 'audio' });
            setSound({ kind: 'file', mediaId, name });
            return;
        }
        try {
            const handle = await startRecording();
            setRecording({ ...handle, since: Date.now() });
        } catch {
            toast.error('Không mở được micro. Hãy cho phép app dùng micro trong cài đặt quyền riêng tư của máy.');
        }
    };

    const save = () => {
        const cleanTitle = title.trim();
        if (!cleanTitle) return setError('Nhập tiêu đề công việc.');
        if (!Number.isFinite(deadline)) return setError('Chọn ngày và giờ hạn hoàn tất.');
        if (before.length === 0) return setError('Chọn ít nhất một mốc nhắc.');
        if (repeat === 'none' && deadline <= clockNow() && !reminder) return setError('Hạn hoàn tất đã qua. Chọn giờ sau bây giờ.');
        if (repeat === 'weekly' && weekdays.length === 0) return setError('Chọn ít nhất một thứ trong tuần.');
        const at = clockNow();
        const finalSound: SoundSpec = sound.kind === 'tts' ? { kind: 'tts', text: ttsText.trim() } : sound;
        saveReminder({
            id: reminder?.id ?? newId('nv'),
            title: cleanTitle,
            content: content.trim(),
            deadline,
            remindBefore: [...before].sort((a, b) => b - a),
            repeat,
            weekdays: repeat === 'weekly' ? weekdays : [],
            priority,
            sound: finalSound,
            checklistTemplateId: checklistId || undefined,
            createdAt: reminder?.createdAt ?? at,
            updatedAt: at,
            armedAt: at,
            done: reminder?.done ?? {},
            fired: reminder?.fired ?? {},
            snoozes: reminder?.snoozes ?? [],
            stopped: reminder?.stopped,
        });
        toast.success(reminder ? 'Đã lưu nhắc việc' : 'Đã tạo nhắc việc');
        onClose();
    };

    const soundOption = (key: string, selected: boolean, label: React.ReactNode, onSelect: () => void, onPreview?: () => void, extra?: React.ReactNode) => (
        <div key={key} className={`rounded-control border px-3 py-2 ${selected ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-[13px] font-semibold text-slate-800 cursor-pointer">
                    <input type="radio" name="am-thanh" checked={selected} onChange={onSelect} className="accent-sky-600" />
                    {label}
                </label>
                {onPreview && (
                    <button type="button" onClick={onPreview} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[12px] font-semibold text-slate-600 hover:border-sky-300">
                        <AppIcon name="play" size="xs" /> Nghe thử
                    </button>
                )}
            </div>
            {extra}
        </div>
    );

    const footer = (
        <div className="flex w-full items-center gap-2">
            {reminder && (
                <Button variant="ghost" icon="delete" className="mr-auto text-rose-600" onClick={() => {
                    deleteReminder(reminder.id);
                    toast.success('Đã xoá nhắc việc');
                    onClose();
                }}>Xoá</Button>
            )}
            <Button variant="secondary" className={reminder ? '' : 'ml-auto'} onClick={onClose}>Huỷ</Button>
            <Button onClick={save}>{reminder ? 'Lưu' : 'Tạo nhắc việc'}</Button>
        </div>
    );

    const selectedFile = sound.kind === 'file' ? getMedia(sound.mediaId) : null;

    return (
        <Modal isOpen={true} onClose={onClose} title={reminder ? 'Sửa nhắc việc' : 'Tạo nhắc việc'} maxWidth="xl" footer={footer} zIndex="z-[200]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-4">
                    <Field label="Tiêu đề công việc">
                        <Input value={title} onChange={e => { setTitle(e.target.value); setError(''); }} placeholder="Kiểm hàng chuyển kho HĐ 1079638" autoFocus aria-label="Tiêu đề công việc" />
                    </Field>
                    <Field label="Nội dung công việc">
                        <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} aria-label="Nội dung công việc"
                            placeholder="Đối chiếu số lượng, gửi báo cáo thiếu cho kho chuyển"
                            className="w-full rounded-control border border-slate-200 px-3 py-2 text-[14px] focus:outline-none focus:border-sky-400" />
                    </Field>
                    <Field label="Hạn hoàn tất">
                        <div className="grid grid-cols-2 gap-2">
                            <Input type="date" value={date} onChange={e => { setDate(e.target.value); setError(''); }} aria-label="Ngày hạn" />
                            <Input type="time" value={time} onChange={e => { setTime(e.target.value); setError(''); }} aria-label="Giờ hạn" />
                        </div>
                    </Field>
                    <Field label="Nhắc trước hạn" hint="Chọn được nhiều mốc.">
                        <div role="group" aria-label="Nhắc trước hạn" className="flex flex-wrap gap-1.5">
                            {BEFORE_OPTIONS.map(option => (
                                <button key={option.minutes} type="button" aria-pressed={before.includes(option.minutes)} className={chip(before.includes(option.minutes))}
                                    onClick={() => setBefore(list => (list.includes(option.minutes) ? list.filter(m => m !== option.minutes) : [...list, option.minutes]))}>
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </Field>
                    <Field label="Lặp lại">
                        <div role="group" aria-label="Lặp lại" className="flex flex-wrap gap-1.5">
                            {REPEATS.map(option => (
                                <button key={option.id} type="button" aria-pressed={repeat === option.id} className={chip(repeat === option.id)} onClick={() => setRepeat(option.id)}>
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        {repeat === 'weekly' && (
                            <div role="group" aria-label="Các thứ trong tuần" className="flex flex-wrap gap-1.5 pt-1">
                                {WEEK_ORDER.map(day => (
                                    <button key={day} type="button" aria-pressed={weekdays.includes(day)} className={chip(weekdays.includes(day))}
                                        onClick={() => setWeekdays(list => (list.includes(day) ? list.filter(d => d !== day) : [...list, day]))}>
                                        {weekdayName(day)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Field>
                    <Field label="Mức độ" hint={priority === 'urgent' ? 'Việc khẩn: quá hạn chưa bấm Đã xong thì nhắc lại mỗi 10 phút.' : undefined}>
                        <div role="group" aria-label="Mức độ" className="flex flex-wrap gap-1.5">
                            {(['normal', 'important', 'urgent'] as Priority[]).map(level => (
                                <button key={level} type="button" aria-pressed={priority === level} className={chip(priority === level)} onClick={() => setPriority(level)}>
                                    {PRIORITY_TEXT[level]}
                                </button>
                            ))}
                        </div>
                    </Field>
                    {templates.length > 0 && (
                        <Field label="Checklist liên kết" hint="Nút trên cửa sổ nhắc mở thẳng checklist này.">
                            <select value={checklistId} onChange={e => setChecklistId(e.target.value)} aria-label="Checklist liên kết"
                                className="h-10 w-full rounded-control border border-slate-200 bg-white px-2 text-[14px] focus:outline-none focus:border-sky-400">
                                <option value="">Không có</option>
                                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                            </select>
                        </Field>
                    )}
                </div>

                <Field label="Âm thanh khi nhắc" hint="Kêu lặp lại đến khi bấm trên cửa sổ nhắc, tối đa 5 phút.">
                    <div role="radiogroup" aria-label="Âm thanh khi nhắc" className="space-y-1.5">
                        {PRESETS.map(preset => soundOption(preset.id, sound.kind === 'preset' && sound.preset === preset.id, preset.label,
                            () => setSound({ kind: 'preset', preset: preset.id }), () => play(() => playPreset(preset.id, false))))}
                        {soundOption('tts', sound.kind === 'tts', 'Đọc chữ thành tiếng', () => setSound({ kind: 'tts', text: ttsText }),
                            () => play(() => playSpeech(ttsText.trim() || speech, false)),
                            sound.kind === 'tts' && (
                                <div className="mt-2 space-y-1">
                                    <textarea value={ttsText} onChange={e => setTtsText(e.target.value)} rows={2} aria-label="Câu đọc"
                                        placeholder={`Để trống thì đọc: ${speech}`}
                                        className="w-full rounded-control border border-slate-200 px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-sky-400" />
                                    {voiceMissing && <p className="text-[11px] font-semibold text-amber-700">{VOICE_HELP}</p>}
                                </div>
                            ))}
                        {soundOption('file', sound.kind === 'file', (
                            <span className="min-w-0 truncate">{sound.kind === 'file' ? `File: ${sound.name}` : 'File âm thanh hoặc ghi âm'}</span>
                        ), () => fileRef.current?.click(), selectedFile ? () => play(() => playFile(selectedFile.dataUrl, false)) : undefined, (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <Button type="button" size="sm" variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>Chọn file (mp3, wav, m4a)</Button>
                                <Button type="button" size="sm" variant={recording ? 'danger' : 'secondary'} onClick={() => void toggleRecording()}>
                                    {recording ? `Dừng ghi (${Math.floor((Date.now() - recording.since) / 1000)} giây)` : 'Ghi âm bằng micro'}
                                </Button>
                            </div>
                        ))}
                    </div>
                    <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" className="hidden" aria-label="Chọn file âm thanh"
                        onChange={e => { void chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
                </Field>
            </div>
            {error && <p role="alert" className="mt-4 rounded-control bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700">{error}</p>}
        </Modal>
    );
};

import React, { useEffect, useRef, useState } from 'react';
import type { ReminderAction, ReminderPopupData } from '../../../electron/contract';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import type { Playback } from './sounds';
import { playReminderSound } from './sounds';
import { PRIORITY_TEXT, dateTimeText, relativeText, timeOfDay } from './nhacViecModel';
import { loadMediaDataUrl } from './NhacViecProvider';

/** Tắt tiếng sau 5 phút, cửa sổ vẫn còn đến khi bấm */
const SOUND_LIMIT_MS = 5 * 60_000;

const TONE = {
    urgent: { ring: 'border-rose-500', badge: 'bg-rose-600 text-white', head: 'text-rose-700' },
    important: { ring: 'border-amber-400', badge: 'bg-amber-500 text-white', head: 'text-amber-700' },
    normal: { ring: 'border-sky-400', badge: 'bg-sky-600 text-white', head: 'text-sky-700' },
} as const;

/** Cửa sổ nhắc việc bật lên (cửa sổ riêng, luôn nằm trên cùng), kèm âm thanh lặp đến khi bấm. */
export default function ReminderPopup(): React.JSX.Element {
    const [data, setData] = useState<ReminderPopupData | null>(null);
    const [muted, setMuted] = useState(false);
    const [now, setNow] = useState(Date.now());
    const playback = useRef<Playback | null>(null);
    /** Chênh lệch giữa đồng hồ của lịch nhắc và đồng hồ máy (khác 0 khi bài kiểm thử dời giờ) */
    const offset = useRef(0);

    useEffect(() => {
        document.title = 'Nhắc việc';
        void window.stickerDesktop.reminders.getPopupData().then(next => {
            if (next) {
                offset.current = next.shownAt - Date.now();
                setNow(next.shownAt);
            }
            setData(next);
        });
        const timer = window.setInterval(() => setNow(Date.now() + offset.current), 15_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!data) return;
        let cancelled = false;
        void playReminderSound(data.sound, { loop: data.kind !== 'missed', speech: data.speech, loadMedia: loadMediaDataUrl }).then(play => {
            if (cancelled) play.stop();
            else playback.current = play;
        });
        const limit = window.setTimeout(() => {
            playback.current?.stop();
            setMuted(true);
        }, SOUND_LIMIT_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(limit);
            playback.current?.stop();
        };
    }, [data]);

    const act = (action: ReminderAction['action'], minutes?: number) => {
        playback.current?.stop();
        if (data) void window.stickerDesktop.reminders.popupAction({ key: data.key, action, minutes });
    };

    if (!data) return <div className="h-dvh bg-white" />;
    const tone = TONE[data.priority];

    return (
        <div data-testid="cua-so-nhac" className={`h-dvh bg-white border-4 ${tone.ring} flex flex-col p-4 gap-3 select-none`}>
            <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black ${tone.badge}`}>
                    <AppIcon name="notification" size="sm" />
                    {data.kind === 'missed' ? 'Nhắc việc bị lỡ' : data.kind === 'new' ? 'Việc mới từ Google Sheet' : data.kind === 'checklist' ? 'Checklist' : `Nhắc việc · ${PRIORITY_TEXT[data.priority]}`}
                </span>
                {!muted && (
                    <button type="button" onClick={() => { playback.current?.stop(); setMuted(true); }}
                        className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
                        <AppIcon name="notificationOff" size="sm" /> Tắt tiếng
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <h1 className="text-[22px] font-black leading-tight text-slate-900 break-words">{data.title}</h1>
                {data.content && <p className="mt-2 text-[14px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{data.content}</p>}
                {(data.assignee || data.assigner) && (
                    <p className="mt-2 text-[13px] font-semibold text-slate-700">
                        {[data.assignee && `Giao cho: ${data.assignee}`, data.assigner && `Người giao: ${data.assigner}`].filter(Boolean).join(' · ')}
                    </p>
                )}
                {data.deadline !== undefined && data.kind !== 'missed' && data.kind !== 'new' && (
                    <div className={`mt-3 flex items-center justify-between rounded-control px-3 py-2 text-[14px] font-bold ${data.deadline >= now ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}`}>
                        <span>Hạn {dateTimeText(data.deadline)}</span>
                        <span>{relativeText(data.deadline, now)}</span>
                    </div>
                )}
                {data.missed && (
                    <ul className="mt-3 divide-y divide-slate-100 rounded-control border border-slate-200 text-[13px]">
                        {data.missed.map(item => (
                            <li key={`${item.title}-${item.at}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold text-slate-800">{item.title}</span>
                                    {item.note && <span className="block truncate text-[12px] text-slate-500">{item.note}</span>}
                                </span>
                                <span className="shrink-0 text-slate-500">{data.kind === 'new' ? 'Hạn ' : ''}{timeOfDay(item.at)} {new Date(item.at).toLocaleDateString('vi-VN')}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {data.kind === 'missed' || data.kind === 'new' ? (
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => act('open')} className="h-11 rounded-control bg-sky-600 text-white font-bold hover:bg-sky-700">Xem danh sách</button>
                    <button type="button" onClick={() => act('dismiss')} className="h-11 rounded-control border border-slate-300 font-bold text-slate-700 hover:bg-slate-50">Đóng</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {data.kind === 'reminder' ? (
                        <button type="button" onClick={() => act('done')} className="h-11 rounded-control bg-emerald-600 text-white font-bold hover:bg-emerald-700">
                            Đã xong
                        </button>
                    ) : (
                        <button type="button" onClick={() => act('open')} className="h-11 rounded-control bg-emerald-600 text-white font-bold hover:bg-emerald-700">
                            Mở checklist
                        </button>
                    )}
                    <div className="grid grid-cols-3 gap-1" role="group" aria-label="Hoãn nhắc">
                        {[5, 10, 30].map(minutes => (
                            <button key={minutes} type="button" onClick={() => act('snooze', minutes)} title={`Nhắc lại sau ${minutes} phút`}
                                className="h-11 rounded-control border border-slate-300 text-[13px] font-bold text-slate-700 hover:bg-slate-50">
                                {minutes}′
                            </button>
                        ))}
                    </div>
                    <p className="col-span-2 -mt-1 text-right text-[11px] text-slate-500">Bấm số phút để hoãn nhắc lại</p>
                    {data.kind === 'reminder' && (
                        <button type="button" onClick={() => act('open')} className="col-span-2 h-10 rounded-control border border-slate-300 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">
                            {data.hasChecklist ? 'Mở checklist liên kết' : 'Mở trong app'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

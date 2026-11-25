import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReminderAction, ReminderPopupData } from '../../../electron/contract';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import type { Playback } from './sounds';
import { playReminderSound } from './sounds';
import { PRIORITY_TEXT, dateTimeText, relativeText, timeOfDay } from './nhacViecModel';
import { loadMediaDataUrl } from './NhacViecProvider';

/** Tắt tiếng sau 5 phút kể từ lần có nhắc mới, bảng vẫn còn đến khi bấm */
const SOUND_LIMIT_MS = 5 * 60_000;
/** Báo lỡ và việc mới chỉ kêu một lượt */
const ONCE_LIMIT_MS = 15_000;

const TONE = {
    urgent: { ring: 'border-rose-500', badge: 'bg-rose-600 text-white' },
    important: { ring: 'border-amber-400', badge: 'bg-amber-500 text-white' },
    normal: { ring: 'border-sky-400', badge: 'bg-sky-600 text-white' },
} as const;
const RANK = { urgent: 3, important: 2, normal: 1 } as const;

type Item = ReminderPopupData;
type Act = (item: Item, action: ReminderAction['action'], minutes?: number) => void;

/** Nhắc phải làm (kêu đến khi bấm), khác báo lỡ và việc mới (chỉ để xem) */
const ringing = (item: Item) => item.kind === 'reminder' || item.kind === 'checklist';

const kindText = (item: Item) => (item.kind === 'missed' ? 'Nhắc việc bị lỡ' : item.kind === 'new' ? 'Việc mới từ Google Sheet' : item.kind === 'alert' ? 'Báo quản lý'
    : item.kind === 'checklist' ? 'Checklist' : `Nhắc việc · ${PRIORITY_TEXT[item.priority]}`);

const PROOF_HINT = { note: 'ghi chú', photo: 'ảnh', both: 'ảnh và ghi chú' } as const;

/** Thứ tự trong bảng: việc phải làm trước (khẩn hơn, hạn sớm hơn), báo lỡ và việc mới xuống cuối */
const ordered = (items: Item[]) => [...items].sort((a, b) => Number(ringing(b)) - Number(ringing(a))
    || RANK[b.priority] - RANK[a.priority] || (a.deadline ?? a.shownAt) - (b.deadline ?? b.shownAt));

/** Nhắc đang kêu: nhắc vừa đến (đến cùng lúc thì nhắc khẩn hơn); không còn nhắc phải làm thì báo lỡ, việc mới */
const leadOf = (items: Item[]): Item | null => {
    const pool = items.some(ringing) ? items.filter(ringing) : items;
    return pool.reduce<Item | null>((best, item) => {
        if (!best) return item;
        if (Math.abs(item.shownAt - best.shownAt) > 2_000) return item.shownAt > best.shownAt ? item : best;
        return RANK[item.priority] > RANK[best.priority] ? item : best;
    }, null);
};

const DeadlineBox: React.FC<{ item: Item; now: number }> = ({ item, now }) => (item.deadline === undefined || !ringing(item) ? null : (
    <div className={`mt-3 flex items-center justify-between rounded-control px-3 py-2 text-[14px] font-bold ${item.deadline >= now ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}`}>
        <span>Hạn {dateTimeText(item.deadline)}</span>
        <span>{relativeText(item.deadline, now)}</span>
    </div>
));

const Details: React.FC<{ item: Item; compact: boolean }> = ({ item, compact }) => (
    <>
        {item.content && <p className={`mt-1.5 text-slate-700 whitespace-pre-wrap break-words ${compact ? 'text-[13px] leading-snug line-clamp-3' : 'text-[14px] leading-relaxed'}`}>{item.content}</p>}
        {(item.assignee || item.assigner || item.department) && (
            <p className={`mt-1.5 font-semibold text-slate-700 ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
                {[item.department && `Bộ phận: ${item.department}`, item.assignee && `Giao cho: ${item.assignee}`, item.assigner && `Người giao: ${item.assigner}`].filter(Boolean).join(' · ')}
            </p>
        )}
        {item.proof && ringing(item) && <p className={`mt-1 font-semibold text-violet-700 ${compact ? 'text-[12px]' : 'text-[13px]'}`}>Khi xong cần kèm {PROOF_HINT[item.proof]}</p>}
        {item.missed && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-control border border-slate-200 text-[13px]">
                {item.missed.map(line => (
                    <li key={`${line.title}-${line.at}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800">{line.title}</span>
                            {line.note && <span className="block truncate text-[12px] text-slate-500">{line.note}</span>}
                        </span>
                        <span className="shrink-0 text-slate-500">{item.kind === 'new' ? 'Hạn ' : ''}{timeOfDay(line.at)} {new Date(line.at).toLocaleDateString('vi-VN')}</span>
                    </li>
                ))}
            </ul>
        )}
    </>
);

const Actions: React.FC<{ item: Item; compact: boolean; act: Act }> = ({ item, compact, act }) => {
    const height = compact ? 'h-9' : 'h-11';
    if (!ringing(item)) {
        // Việc mới: nhân viên bấm Đã nhận, file ghi người nhận và giờ nhận
        if (item.kind === 'new' && item.canAck) {
            return (
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => act(item, 'ack')} className={`${height} rounded-control bg-emerald-600 text-white font-bold hover:bg-emerald-700`}>Đã nhận</button>
                    <button type="button" onClick={() => act(item, 'open')} className={`${height} rounded-control border border-slate-300 font-bold text-slate-700 hover:bg-slate-50`}>Xem danh sách</button>
                </div>
            );
        }
        return (
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => act(item, 'open')} className={`${height} rounded-control bg-sky-600 text-white font-bold hover:bg-sky-700`}>Xem danh sách</button>
                <button type="button" onClick={() => act(item, 'dismiss')} className={`${height} rounded-control border border-slate-300 font-bold text-slate-700 hover:bg-slate-50`}>Đóng</button>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => act(item, item.kind === 'reminder' ? 'done' : 'open')} className={`${height} rounded-control bg-emerald-600 text-white font-bold hover:bg-emerald-700`}>
                {item.kind === 'reminder' ? 'Đã xong' : 'Mở checklist'}
            </button>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label="Hoãn nhắc">
                {[5, 10, 30].map(minutes => (
                    <button key={minutes} type="button" onClick={() => act(item, 'snooze', minutes)} title={`Nhắc lại sau ${minutes} phút`}
                        className={`${height} rounded-control border border-slate-300 text-[13px] font-bold text-slate-700 hover:bg-slate-50`}>
                        {minutes}′
                    </button>
                ))}
            </div>
            {!compact && <p className="col-span-2 -mt-1 text-right text-[11px] text-slate-500">Bấm số phút để hoãn nhắc lại</p>}
            {item.kind === 'reminder' && (item.canAck || item.canHelp) && (
                <div className={`col-span-2 grid gap-2 ${item.canAck && item.canHelp ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {item.canAck && (
                        <button type="button" onClick={() => act(item, 'ack')} title="Báo đã nhận việc, file ghi người nhận và giờ nhận"
                            className={`${compact ? 'h-8 text-[13px]' : 'h-10 text-[14px]'} rounded-control border border-emerald-300 bg-emerald-50 font-bold text-emerald-800 hover:bg-emerald-100`}>
                            Đã nhận
                        </button>
                    )}
                    {item.canHelp && (
                        <button type="button" onClick={() => act(item, 'help')} title="Báo quản lý: việc đang vướng, cần hỗ trợ"
                            className={`${compact ? 'h-8 text-[13px]' : 'h-10 text-[14px]'} rounded-control border border-amber-300 bg-amber-50 font-bold text-amber-800 hover:bg-amber-100`}>
                            Cần hỗ trợ
                        </button>
                    )}
                </div>
            )}
            {item.kind === 'reminder' && (
                <button type="button" onClick={() => act(item, 'open')} className={`col-span-2 ${compact ? 'h-8 text-[13px]' : 'h-10 text-[14px]'} rounded-control border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50`}>
                    {item.hasChecklist ? 'Mở checklist liên kết' : 'Mở trong app'}
                </button>
            )}
        </div>
    );
};

/** Một thẻ trong bảng khi có nhiều nhắc cùng lúc */
const Card: React.FC<{ item: Item; now: number; fresh: boolean; act: Act }> = ({ item, now, fresh, act }) => {
    const tone = TONE[item.priority];
    const ref = useRef<HTMLLIElement>(null);
    useEffect(() => {
        if (fresh) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [fresh]);
    const late = item.deadline !== undefined && item.deadline < now;
    return (
        <li ref={ref} data-testid="the-nhac" className={`rounded-card border-2 ${tone.ring} bg-white p-3 ${fresh ? 'shadow-lg shadow-slate-300/60' : ''}`}>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${tone.badge}`}>{kindText(item)}</span>
                {fresh && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-black text-white">Mới</span>}
                {item.deadline !== undefined && ringing(item) && (
                    <span className={`ml-auto text-[12px] font-bold ${late ? 'text-rose-700' : 'text-amber-800'}`}>Hạn {dateTimeText(item.deadline)} · {relativeText(item.deadline, now)}</span>
                )}
            </div>
            <h2 className="mt-1.5 text-[17px] font-black leading-tight text-slate-900 break-words">{item.title}</h2>
            <Details item={item} compact={true} />
            <div className="mt-2.5"><Actions item={item} compact={true} act={act} /></div>
        </li>
    );
};

/**
 * Bảng nhắc việc bật lên (cửa sổ riêng, luôn nằm trên cùng). Mọi nhắc đến cùng lúc nằm chung một bảng, mỗi nhắc một thẻ có nút riêng.
 * Chỉ một tiếng chuông: của nhắc vừa đến, lặp đến khi bấm.
 */
export default function ReminderPopup(): React.JSX.Element {
    const [items, setItems] = useState<Item[] | null>(null);
    const [muted, setMuted] = useState(false);
    /** Lần gần nhất có nhắc mới vào bảng */
    const [alertAt, setAlertAt] = useState(0);
    const [freshKey, setFreshKey] = useState('');
    const [now, setNow] = useState(Date.now());
    const seen = useRef(new Set<string>());
    /** Chênh lệch giữa đồng hồ của lịch nhắc và đồng hồ máy (khác 0 khi bài kiểm thử dời giờ) */
    const offset = useRef(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const api = window.stickerDesktop.reminders;

    const receive = useCallback((next: Item[]) => {
        const arrivals = next.filter(item => !seen.current.has(`${item.key}|${item.shownAt}`));
        for (const item of arrivals) seen.current.add(`${item.key}|${item.shownAt}`);
        if (arrivals.length > 0) {
            const latest = arrivals.reduce((a, b) => (b.shownAt > a.shownAt ? b : a));
            offset.current = latest.shownAt - Date.now();
            setNow(latest.shownAt);
            setMuted(false);
            setAlertAt(Date.now());
            // Đánh dấu "Mới" khi nhắc đến thêm vào bảng đang mở
            setFreshKey(arrivals.length < next.length ? latest.key : '');
        }
        setItems(next);
    }, []);

    useEffect(() => {
        const off = api.onPopupItems(receive);
        void api.getPopupData().then(receive);
        const timer = window.setInterval(() => setNow(Date.now() + offset.current), 15_000);
        return () => {
            off();
            window.clearInterval(timer);
        };
    }, [api, receive]);

    // Tên cửa sổ ghi số nhắc đang chờ (thanh tác vụ Windows, menu Cửa sổ của Mac)
    const count = items?.length ?? 0;
    useEffect(() => {
        document.title = count > 1 ? `Nhắc việc (${count})` : 'Nhắc việc';
    }, [count]);

    const lead = items ? leadOf(items) : null;
    const leadRef = useRef(lead);
    leadRef.current = lead;
    const leadId = lead ? `${lead.key}|${lead.shownAt}` : '';
    const sounding = Boolean(lead) && !muted;

    useEffect(() => {
        const item = leadRef.current;
        if (!item || muted) return;
        let cancelled = false;
        let playback: Playback | null = null;
        void playReminderSound(item.sound, { loop: ringing(item), speech: item.speech, loadMedia: loadMediaDataUrl }).then(play => {
            if (cancelled) play.stop();
            else playback = play;
        });
        const once = ringing(item) ? 0 : window.setTimeout(() => setMuted(true), ONCE_LIMIT_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(once);
            playback?.stop();
        };
    }, [leadId, muted, alertAt]);

    useEffect(() => {
        if (!alertAt) return;
        const limit = window.setTimeout(() => setMuted(true), SOUND_LIMIT_MS);
        return () => window.clearTimeout(limit);
    }, [alertAt]);

    // Báo cho app đang kêu hay đã im: kêu thì mở to âm lượng loa, im thì trả lại mức cũ
    useEffect(() => {
        void api.popupSound(sounding);
    }, [api, sounding]);

    // Cửa sổ co giãn theo nội dung: chiều cao cần = phần ngoài danh sách + chiều cao thật của danh sách
    const ready = items !== null;
    useLayoutEffect(() => {
        const root = rootRef.current;
        const list = listRef.current;
        const inner = innerRef.current;
        if (!root || !list || !inner) return;
        // Dư 2 px cho phần lẻ khi làm tròn, để không hiện thanh cuộn thừa
        const report = () => void api.popupResize(root.offsetHeight - list.clientHeight + Math.ceil(inner.getBoundingClientRect().height) + 2);
        const observer = new ResizeObserver(report);
        observer.observe(inner);
        observer.observe(root);
        report();
        return () => observer.disconnect();
    }, [api, ready]);

    const act: Act = (item, action, minutes) => {
        setItems(current => (current ?? []).filter(entry => entry.key !== item.key));
        void api.popupAction({ key: item.key, action, minutes });
    };

    if (!items || items.length === 0) return <div className="h-dvh bg-white" />;
    const single = items.length === 1 ? items[0] : null;
    const top = items.reduce((best, item) => (RANK[item.priority] > RANK[best.priority] ? item : best));
    const tone = TONE[(single ?? top).priority];

    return (
        <div ref={rootRef} data-testid="cua-so-nhac" className={`h-dvh bg-white border-4 ${tone.ring} flex flex-col p-4 gap-3 select-none`}>
            <div className="flex items-center gap-2">
                {single ? (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-black ${tone.badge}`}>
                        <AppIcon name="notification" size="sm" />
                        {kindText(single)}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-1 text-[12px] font-black text-white">
                        <AppIcon name="notification" size="sm" />
                        {items.length} nhắc việc đang chờ
                    </span>
                )}
                {sounding && (
                    <button type="button" onClick={() => setMuted(true)}
                        className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
                        <AppIcon name="notificationOff" size="sm" /> Tắt tiếng
                    </button>
                )}
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
                <div ref={innerRef}>
                    {single ? (
                        <>
                            <h1 className="text-[22px] font-black leading-tight text-slate-900 break-words">{single.title}</h1>
                            <Details item={single} compact={false} />
                            <DeadlineBox item={single} now={now} />
                        </>
                    ) : (
                        <ul className="space-y-2.5 pb-0.5">
                            {ordered(items).map(item => <Card key={item.key} item={item} now={now} fresh={item.key === freshKey} act={act} />)}
                        </ul>
                    )}
                </div>
            </div>

            {single && <Actions item={single} compact={false} act={act} />}
        </div>
    );
}

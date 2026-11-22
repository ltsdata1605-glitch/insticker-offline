import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { ConfirmDialog } from '../../components/shared/ui/ConfirmDialog';
import { Modal } from '../../components/shared/ui/Modal';
import { Switch } from '../../components/shared/ui/Switch';
import { TopBarActions } from '../../components/shared/ui/TopBarActions';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import { openPrintPreview } from '../../platform/printPreview';
import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import type { CodeItem, CodeKind, PageSettings } from './maCode';
import { DEFAULT_SETTINGS, FONT_CSS, KIND_TEXT, PER_PAGE_CHOICES, densityProblem, gridFor, itemProblem, pageCss, pageHtml, pagesOf, parseLines, printDocument } from './maCode';
import { exportCodeImages, exportPageImages } from './maImage';

const KEYS = { items: 'taoMaItems', settings: 'taoMaSettings' } as const;
const MM = 96 / 25.4;

const isBlankItem = (item: CodeItem) => !item.content.trim() && !item.title.trim();
/**
 * Đúng một dòng trống ở cuối: dòng cuối có chữ thì thêm dòng trống; hai dòng cuối cùng trống (vừa xoá chữ dòng áp chót) thì bỏ
 * dòng trống cuối, giữ dòng đang gõ. Dòng trống ở giữa để nguyên, kẻo đang xoá để gõ lại thì mất dòng.
 */
const withBlankRow = (list: CodeItem[]): CodeItem[] => {
    const next = [...list];
    while (next.length >= 2 && isBlankItem(next[next.length - 1]) && isBlankItem(next[next.length - 2])) next.pop();
    const last = next[next.length - 1];
    return last && isBlankItem(last) ? next : [...next, newItem()];
};

const newItem = (title = '', content = ''): CodeItem => ({ id: `ma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title, content, copies: 1 });

/** Nút chọn một trong vài lựa chọn */
const Segmented = <T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
    <div role="group" aria-label={label} className="grid gap-1 rounded-control bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(option => (
            <button key={String(option.value)} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
                className={`rounded-[8px] px-2 py-1.5 text-[13px] font-bold transition-colors ${option.value === value ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {option.label}
            </button>
        ))}
    </div>
);

/** Một dòng trong danh sách mã: tiêu đề, nội dung, số bản */
const ItemRow: React.FC<{
    item: CodeItem;
    index: number;
    kind: CodeKind;
    /** Cảnh báo (không chặn in), ví dụ mã vạch quá dày */
    warning: string;
    onChange: (item: CodeItem) => void;
    onRemove: () => void;
    onEnter: () => void;
    contentRef: (element: HTMLInputElement | null) => void;
    /** Dòng trống luôn có ở cuối để nhập tiếp */
    blank: boolean;
}> = ({ item, index, kind, warning, onChange, onRemove, onEnter, contentRef, blank }) => {
    const problem = item.content.trim() ? itemProblem(item, kind) : '';
    const field = 'h-9 w-full rounded-control border bg-white px-2.5 text-[14px] text-slate-900 focus:outline-none focus:border-sky-400';
    return (
        <li data-testid="dong-ma" data-trong={blank ? '' : undefined} className={`rounded-card border px-3 py-2 ${problem ? 'border-rose-300 bg-white' : blank ? 'border-dashed border-slate-300 bg-white/70' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">{index + 1}</span>
                {/* Nội dung đứng trước: chỉ cần gõ nội dung là có mã, tiêu đề không bắt buộc */}
                <input ref={contentRef} value={item.content} aria-label={`Nội dung mã ${index + 1}`} placeholder={blank ? 'Gõ nội dung để tạo mã mới…' : 'Nội dung: mã sản phẩm, đường link, chữ…'}
                    onChange={e => onChange({ ...item, content: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
                    className={`${field} basis-3/5 font-semibold ${problem ? 'border-rose-300' : 'border-slate-200'}`} />
                <input value={item.title} aria-label={`Tiêu đề mã ${index + 1}`} placeholder="Tiêu đề (nếu cần)" onChange={e => onChange({ ...item, title: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
                    className={`${field} border-slate-200 basis-2/5`} />
                <label className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-slate-500" title="Số bản in của mã này">
                    ×
                    <input type="number" min={1} max={500} value={item.copies} aria-label={`Số bản mã ${index + 1}`}
                        onChange={e => onChange({ ...item, copies: Math.max(1, Math.min(500, Math.round(Number(e.target.value)) || 1)) })}
                        className="h-9 w-16 rounded-control border border-slate-200 px-2 text-[14px] text-slate-900 tabular-nums focus:outline-none focus:border-sky-400" />
                </label>
                <Button size="icon" variant="ghost" icon="delete" aria-label={`Xoá mã ${index + 1}`} title="Xoá dòng này" onClick={onRemove}
                    className={`text-slate-400 hover:text-rose-600 ${blank ? 'invisible' : ''}`} tabIndex={blank ? -1 : undefined} />
            </div>
            {problem && <p role="alert" className="mt-1 pl-9 text-[12px] font-semibold text-rose-600">{problem}</p>}
            {!problem && warning && <p className="mt-1 pl-9 text-[12px] font-semibold text-amber-700">{warning}</p>}
        </li>
    );
};

/** Bảng dán nhiều dòng một lần */
const BulkDialog: React.FC<{ onClose: () => void; onAdd: (lines: { title: string; content: string }[], replace: boolean) => void }> = ({ onClose, onAdd }) => {
    const [text, setText] = useState('');
    const lines = useMemo(() => parseLines(text), [text]);
    return (
        <Modal isOpen={true} onClose={onClose} title="Nhập nhiều mã" maxWidth="lg" zIndex="z-[200]">
            <div className="space-y-3">
                <p className="text-[13px] text-slate-600">
                    Mỗi dòng một mã. Có tiêu đề thì ghi <strong>Tiêu đề | Nội dung</strong>, hoặc chép hai cột từ Excel (cột A tiêu đề, cột B nội dung) rồi dán vào đây.
                </p>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={10} autoFocus aria-label="Các dòng mã"
                    placeholder={'SP001\nTủ lạnh LG | SP002\nhttps://insticker.vn'}
                    className="w-full rounded-control border border-slate-200 px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-sky-400" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-600">Đọc được {lines.length} mã{lines.some(line => line.title) ? `, ${lines.filter(line => line.title).length} có tiêu đề` : ''}</span>
                    <div className="flex gap-2">
                        <Button variant="secondary" disabled={lines.length === 0} onClick={() => onAdd(lines, true)}>Thay cả danh sách</Button>
                        <Button icon="add" disabled={lines.length === 0} onClick={() => onAdd(lines, false)}>Thêm {lines.length} mã</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

/** Xem trước một trang A4 đúng như bản in, thu nhỏ theo khung */
const PagePreview: React.FC<{ page: CodeItem[]; settings: PageSettings }> = ({ page, settings }) => {
    const box = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(360);
    useEffect(() => {
        const element = box.current;
        if (!element) return;
        const observer = new ResizeObserver(() => setWidth(element.clientWidth));
        observer.observe(element);
        setWidth(element.clientWidth);
        return () => observer.disconnect();
    }, []);
    const grid = gridFor(settings.perPage, settings.landscape, settings.kind);
    const pageWidth = grid.pageW * MM;
    const scale = Math.min(1, width / pageWidth);
    // Chỉ dựng lại khi nội dung trang hoặc cài đặt đổi (gõ ở dòng khác trang thì không dựng lại)
    const key = JSON.stringify([page.map(item => [item.title, item.content]), settings]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const html = useMemo(() => `<style>${pageCss(settings, grid)}</style>${pageHtml(page, settings)}`, [key]);
    return (
        <div ref={box} className="w-full">
            <div className="mx-auto overflow-hidden rounded-[6px] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.18)] ring-1 ring-slate-200"
                style={{ width: pageWidth * scale, height: grid.pageH * MM * scale }}>
                <div data-testid="trang-xem-truoc" style={{ width: pageWidth, transform: `scale(${scale})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
        </div>
    );
};

/** Tạo mã QR, mã vạch từ nội dung nhập vào; mỗi mã có tiêu đề; xuất ảnh hoặc in nhiều mã trên trang A4 */
export default function TaoMaView({ active }: { active: boolean }): React.JSX.Element {
    const [loaded, setLoaded] = useState(false);
    const [items, setItemsRaw] = useState<CodeItem[]>([newItem()]);
    /** Luôn có đúng một dòng trống ở cuối để gõ tiếp, không phải bấm Thêm mã */
    const setItems = (change: CodeItem[] | ((list: CodeItem[]) => CodeItem[])) => setItemsRaw(list => withBlankRow(typeof change === 'function' ? change(list) : change));
    const [settings, setSettings] = useState<PageSettings>(DEFAULT_SETTINGS);
    const [bulk, setBulk] = useState(false);
    const [clearAsk, setClearAsk] = useState(false);
    const [pageIndex, setPageIndex] = useState(0);
    const [busy, setBusy] = useState<'' | 'codes' | 'pages'>('');
    const inputs = useRef(new Map<string, HTMLInputElement>());
    const focusNext = useRef<string | null>(null);

    // Xem trước và xuất ảnh dùng đúng phông của bản in
    useEffect(() => {
        if (document.querySelector(`link[href="${FONT_CSS}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = FONT_CSS;
        document.head.appendChild(link);
    }, []);
    useEffect(() => {
        void Promise.all([getSetting<CodeItem[]>(KEYS.items), getSetting<Partial<PageSettings>>(KEYS.settings)]).then(([savedItems, savedSettings]) => {
            if (Array.isArray(savedItems) && savedItems.length > 0) setItems(savedItems.map(item => ({ ...newItem(), ...item })));
            else setItems(list => list);
            if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
            setLoaded(true);
        });
    }, []);
    // Lưu lại để lần mở sau còn danh sách đang làm
    useEffect(() => {
        if (!loaded) return;
        const timer = window.setTimeout(() => {
            void saveSetting(KEYS.items, items);
            void saveSetting(KEYS.settings, settings);
        }, 400);
        return () => window.clearTimeout(timer);
    }, [items, settings, loaded]);
    useEffect(() => {
        if (!focusNext.current) return;
        const target = focusNext.current === 'cuoi' ? items[items.length - 1]?.id : focusNext.current;
        if (target) inputs.current.get(target)?.focus();
        focusNext.current = null;
    });

    const filled = items.filter(item => item.content.trim());
    const valid = filled.filter(item => !itemProblem(item, settings.kind));
    const broken = filled.length - valid.length;
    const dense = items.map((item, index) => (densityProblem(item, settings) ? index + 1 : 0)).filter(Boolean);
    const grid = gridFor(settings.perPage, settings.landscape, settings.kind);
    const pages = useMemo(() => pagesOf(valid, settings.perPage), [valid, settings.perPage]);
    const copies = pages.reduce((sum, page) => sum + page.length, 0);
    const shownPage = Math.min(pageIndex, Math.max(0, pages.length - 1));
    const change = (next: Partial<PageSettings>) => setSettings(current => ({ ...current, ...next }));

    const updateItem = (next: CodeItem) => setItems(list => list.map(item => (item.id === next.id ? next : item)));
    /** Đưa con trỏ tới dòng trống ở cuối */
    const addItem = () => {
        const last = items[items.length - 1];
        if (last) inputs.current.get(last.id)?.focus();
    };
    const removeItem = (id: string) => setItems(list => list.filter(item => item.id !== id));
    const addLines = (lines: { title: string; content: string }[], replace: boolean) => {
        const created = lines.map(line => newItem(line.title, line.content));
        setItems(list => (replace ? created : [...list.filter(item => item.content.trim() || item.title.trim()), ...created]));
        setBulk(false);
        toast.success(`Đã ${replace ? 'thay bằng' : 'thêm'} ${created.length} mã`);
    };

    const print = () => {
        const title = `${KIND_TEXT[settings.kind]} (${valid.length} mã)`;
        openPrintPreview({
            title,
            note: `${copies} mã · ${pages.length} trang · ${grid.cols} cột × ${grid.rows} hàng mỗi trang`,
            paper: { kind: 'a4', landscape: settings.landscape },
            buildHtml: () => printDocument(valid, settings, title),
        });
    };
    const exportCodes = async () => {
        setBusy('codes');
        try {
            const { saved, skipped } = await exportCodeImages(items, settings);
            if (saved === 0) toast.error('Không có mã nào xuất được');
            else if (skipped) toast.success(`Đã xuất ${saved} ảnh, bỏ qua ${skipped} dòng lỗi`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Không xuất được ảnh');
        } finally {
            setBusy('');
        }
    };
    const exportPages = async () => {
        setBusy('pages');
        try {
            await exportPageImages(valid, settings);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Không xuất được ảnh');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="relative h-full bg-slate-100">
            {active && <TopBarActions>{null}</TopBarActions>}
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-4 p-4 lg:p-5 xl:grid-cols-[minmax(0,1fr)_460px]">
                <section className="flex min-h-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto text-[14px] font-bold text-slate-700">
                            Danh sách mã ({filled.length}){copies !== valid.length && valid.length > 0 ? ` · ${copies} bản` : ''}
                        </p>
                        <Button variant="secondary" icon="viewList" onClick={() => setBulk(true)}>Nhập nhiều dòng</Button>
                        <Button variant="secondary" icon="add" onClick={addItem}>Thêm mã</Button>
                        <Button variant="ghost" icon="delete" className="text-rose-600" disabled={filled.length === 0} onClick={() => setClearAsk(true)}>Xoá hết</Button>
                    </div>
                    <p className="text-[12px] text-slate-500">
                        Chỉ cần gõ nội dung là có mã, bấm Enter để xuống dòng trống bên dưới gõ tiếp. Tiêu đề không bắt buộc, có thì in to phía trên mã. Ô × là số bản in.
                    </p>
                    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-thin pr-1">
                        {items.map((item, index) => (
                            <ItemRow key={item.id} item={item} index={index} kind={settings.kind} warning={densityProblem(item, settings)} onChange={updateItem} onRemove={() => removeItem(item.id)}
                                blank={index === items.length - 1 && isBlankItem(item)}
                                onEnter={() => {
                                    // Dòng cuối vừa gõ thì dòng trống mới hiện ra ngay sau lần vẽ này: chờ nó rồi mới chuyển con trỏ
                                    const next = items[index + 1];
                                    if (next) inputs.current.get(next.id)?.focus();
                                    else focusNext.current = 'cuoi';
                                }}
                                contentRef={element => { if (element) inputs.current.set(item.id, element); else inputs.current.delete(item.id); }} />
                        ))}
                    </ul>
                </section>

                <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
                    <section className="space-y-3 rounded-card border border-slate-200 bg-white p-3">
                        <div className="space-y-1.5">
                            <p className="text-[12px] font-bold text-slate-600">Loại mã</p>
                            <Segmented label="Loại mã" value={settings.kind} onChange={kind => change({ kind })}
                                options={(['qr', 'barcode', 'both'] as const).map(kind => ({ value: kind, label: KIND_TEXT[kind] }))} />
                            {settings.kind !== 'qr' && <p className="text-[11px] text-slate-500">Mã vạch (Code 128) chỉ nhận chữ không dấu, số và ký hiệu. Nội dung có dấu hoặc đường link dài nên dùng mã QR.</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1.5">
                                <span className="block text-[12px] font-bold text-slate-600">Số mã mỗi trang</span>
                                <select value={settings.perPage} aria-label="Số mã mỗi trang" onChange={e => { change({ perPage: Number(e.target.value) }); setPageIndex(0); }}
                                    className="h-9 w-full rounded-control border border-slate-200 bg-white px-2 text-[14px] font-semibold focus:outline-none focus:border-sky-400">
                                    {PER_PAGE_CHOICES.map(n => {
                                        const g = gridFor(n, settings.landscape, settings.kind);
                                        return <option key={n} value={n}>{n} mã ({g.cols} × {g.rows})</option>;
                                    })}
                                </select>
                            </label>
                            <div className="space-y-1.5">
                                <span className="block text-[12px] font-bold text-slate-600">Khổ giấy A4</span>
                                <Segmented label="Khổ giấy" value={settings.landscape} onChange={landscape => change({ landscape })}
                                    options={[{ value: false, label: 'Dọc' }, { value: true, label: 'Ngang' }]} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span id="tm-nd" className="text-[13px] text-slate-700">Ghi nội dung dưới mã</span>
                            <Switch checked={settings.showText} onChange={showText => change({ showText })} aria-labelledby="tm-nd" />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span id="tm-cat" className="text-[13px] text-slate-700">Viền nét đứt để cắt</span>
                            <Switch checked={settings.cutLines} onChange={cutLines => change({ cutLines })} aria-labelledby="tm-cat" />
                        </div>
                    </section>

                    <section className="space-y-2">
                        {broken > 0 && <p role="alert" className="text-[12px] font-semibold text-rose-600">{broken} dòng lỗi (viền đỏ) sẽ không in, không xuất.</p>}
                        {dense.length > 0 && (
                            <p className="text-[12px] font-semibold text-amber-700">
                                Mã vạch dòng {dense.join(', ')} dày quá ở cỡ {settings.perPage} mã mỗi trang, máy quét khó đọc. Chọn ít mã mỗi trang hơn hoặc dùng mã QR.
                            </p>
                        )}
                        <Button size="lg" icon="print" className="w-full" disabled={valid.length === 0} onClick={print}>
                            In {copies} mã{pages.length > 1 ? ` (${pages.length} trang)` : ''}
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                            <Button variant="secondary" icon="exportImage" disabled={valid.length === 0 || busy !== ''} onClick={() => void exportCodes()}>
                                {busy === 'codes' ? 'Đang xuất…' : 'Ảnh từng mã'}
                            </Button>
                            <Button variant="secondary" icon="exportImage" disabled={valid.length === 0 || busy !== ''} onClick={() => void exportPages()}>
                                {busy === 'pages' ? 'Đang xuất…' : 'Ảnh theo trang'}
                            </Button>
                        </div>
                    </section>
                    <section className="space-y-2 rounded-card border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                            <p className="mr-auto text-[12px] font-bold text-slate-600">
                                Xem trước{pages.length > 0 ? ` · trang ${shownPage + 1}/${pages.length}` : ''}
                                <span className="font-medium text-slate-500"> · {grid.cols} cột × {grid.rows} hàng</span>
                            </p>
                            {pages.length > 1 && (
                                <>
                                    <Button size="icon-xs" variant="ghost" icon="chevronLeft" aria-label="Trang trước" disabled={shownPage === 0} onClick={() => setPageIndex(shownPage - 1)} />
                                    <Button size="icon-xs" variant="ghost" icon="chevronRight" aria-label="Trang sau" disabled={shownPage >= pages.length - 1} onClick={() => setPageIndex(shownPage + 1)} />
                                </>
                            )}
                        </div>
                        {pages.length > 0 ? <PagePreview page={pages[shownPage]} settings={settings} /> : (
                            <div className="flex aspect-[210/297] w-full flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-slate-300 text-center text-[13px] text-slate-500">
                                <AppIcon name="qrCode" size="lg" />
                                Gõ nội dung ở bên trái để tạo mã
                            </div>
                        )}
                    </section>

                </aside>
            </div>

            {bulk && <BulkDialog onClose={() => setBulk(false)} onAdd={addLines} />}
            <ConfirmDialog
                isOpen={clearAsk}
                onClose={() => setClearAsk(false)}
                onConfirm={() => { setItems([newItem()]); setClearAsk(false); setPageIndex(0); }}
                title="Xoá hết danh sách mã?"
                variant="danger"
                zIndex="z-[200]"
                confirmText="Xoá hết"
                cancelText="Không xoá"
                message={`${filled.length} mã trong danh sách sẽ bị xoá.`}
            />
        </div>
    );
}

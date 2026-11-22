import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { ConfirmDialog } from '../../components/shared/ui/ConfirmDialog';
import { TopBarActions } from '../../components/shared/ui/TopBarActions';
import { toast } from '../../components/shared/ui/toast';
import { openPrintPreview } from '../../platform/printPreview';
import { getSetting, saveSetting } from '../sticker-event/services/dbService';
import { FONT_CSS } from '../tao-ma/maCode';
import type { Calibration, FifoRow, LabelCell, LabelKind, TemplateId } from './nhanModel';
import {
    FIFO_COLORS, KIND_TEXT, LABEL_CSS, NO_CALIBRATION, TEMPLATES, cellContentHtml, cellProblem, densityProblem, emptyCell, fifoLabels, isEmptyCell,
    labelBox, parseSheetRows, perSheet, placeCells, printDocument, sequenceLabels, sheetLabels, sheetsOf,
} from './nhanModel';

const STATE_KEY = 'inNhanState';
const MM = 96 / 25.4;

interface NhanState {
    template: TemplateId;
    cells: Record<TemplateId, (LabelCell | null)[]>;
    calibration: Record<TemplateId, Calibration>;
    fifo: { rows: FifoRow[] };
}

const today = () => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}`;
};

const DEFAULT_STATE: NhanState = {
    template: 'tomy-117',
    cells: { 'tomy-117': [], 'tomy-105': [] },
    calibration: { 'tomy-117': NO_CALIBRATION, 'tomy-105': NO_CALIBRATION },
    fifo: { rows: FIFO_COLORS.map(color => ({ color, quantity: 0, note: '' })) },
};

const field = 'h-9 w-full rounded-control border border-slate-200 bg-white px-2.5 text-[14px] text-slate-900 focus:outline-none focus:border-sky-400';

const Segmented = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
    <div role="group" aria-label={label} className="grid gap-1 rounded-control bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(option => (
            <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
                className={`rounded-[8px] px-2 py-1.5 text-[13px] font-bold transition-colors ${option.value === value ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {option.label}
            </button>
        ))}
    </div>
);

const KINDS: { value: LabelKind; label: string }[] = (['text', 'qr', 'barcode'] as const).map(kind => ({ value: kind, label: KIND_TEXT[kind] }));

/** Một số mm có nút cộng trừ */
const Stepper: React.FC<{ label: string; value: number; step: number; onChange: (value: number) => void }> = ({ label, value, step, onChange }) => (
    <label className="flex items-center justify-between gap-2 text-[13px] text-slate-700">
        <span>{label}</span>
        <span className="flex items-center gap-1">
            <Button size="icon-xs" variant="secondary" icon="minus" aria-label={`${label} giảm`} onClick={() => onChange(Math.round((value - step) * 100) / 100)} />
            <input type="number" step={step} value={value} aria-label={label} onChange={e => onChange(Number(e.target.value) || 0)}
                className="h-8 w-16 rounded-control border border-slate-200 px-1.5 text-center text-[13px] tabular-nums focus:outline-none focus:border-sky-400" />
            <Button size="icon-xs" variant="secondary" icon="add" aria-label={`${label} tăng`} onClick={() => onChange(Math.round((value + step) * 100) / 100)} />
            <span className="w-6 text-slate-500">mm</span>
        </span>
    </label>
);

/** Tờ nhãn thu nhỏ theo khung; bấm vào tem để chọn */
const SheetPreview: React.FC<{
    templateId: TemplateId;
    cells: (LabelCell | null)[];
    first: number;
    selected: number;
    onSelect: (index: number) => void;
}> = ({ templateId, cells, first, selected, onSelect }) => {
    const template = TEMPLATES[templateId];
    const box = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(700);
    useEffect(() => {
        const element = box.current;
        if (!element) return;
        const observer = new ResizeObserver(() => setWidth(element.clientWidth));
        observer.observe(element);
        setWidth(element.clientWidth);
        return () => observer.disconnect();
    }, []);
    const pageW = template.paperW * MM;
    const scale = Math.min(1.6, width / pageW);
    return (
        <div ref={box} className="w-full">
            <style>{LABEL_CSS}</style>
            <div className="mx-auto overflow-hidden rounded-[6px] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.18)] ring-1 ring-slate-200"
                style={{ width: pageW * scale, height: template.paperH * MM * scale }}>
                <div data-testid="to-nhan" className="tn-to" style={{ width: `${template.paperW}mm`, height: `${template.paperH}mm`, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    {Array.from({ length: perSheet(template) }, (_, i) => {
                        const index = first + i;
                        const cell = cells[index];
                        const at = labelBox(template, i);
                        const problem = cell && !isEmptyCell(cell) ? cellProblem(cell) : '';
                        return (
                            <button key={index} type="button" data-testid="o-nhan" data-so={index + 1} aria-label={`Tem số ${index + 1}`} aria-pressed={index === selected}
                                onClick={() => onSelect(index)}
                                className={`tn-tem ${template.shape === 'round' ? 'tron' : ''} tn-khung cursor-pointer ${index === selected ? '!outline-2 !outline-solid !outline-sky-500 bg-sky-50/60' : problem ? 'bg-rose-50' : 'hover:bg-slate-50'}`}
                                style={{ left: `${at.x}mm`, top: `${at.y}mm`, width: `${template.width}mm`, height: `${template.height}mm` }}>
                                {cell && !isEmptyCell(cell)
                                    ? <span className="contents" dangerouslySetInnerHTML={{ __html: cellContentHtml(cell, template) }} />
                                    : <span className="text-[2.6mm] text-slate-300">{index + 1}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

/** In nhãn Tomy A5: tem tròn 117 hoặc tem vuông 105, mỗi tem là chữ, mã QR hoặc mã vạch; tạo nhanh FIFO, mã tự tăng, Excel */
export default function InNhanView({ active }: { active: boolean }): React.JSX.Element {
    const [loaded, setLoaded] = useState(false);
    const [state, setState] = useState<NhanState>(DEFAULT_STATE);
    const [selected, setSelected] = useState(0);
    const [quick, setQuick] = useState<'fifo' | 'seq' | 'excel'>('fifo');
    const [start, setStart] = useState(1);
    const [fifoDate, setFifoDate] = useState(today);
    const [seq, setSeq] = useState({ kind: 'barcode' as LabelKind, prefix: 'SP', from: 1, count: 10, name: '' });
    const [excelKind, setExcelKind] = useState<LabelKind>('barcode');
    const [clearAsk, setClearAsk] = useState(false);
    const firstInput = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        void getSetting<Partial<NhanState>>(STATE_KEY).then(saved => {
            if (saved) {
                setState({
                    ...DEFAULT_STATE, ...saved,
                    cells: { ...DEFAULT_STATE.cells, ...(saved.cells ?? {}) },
                    calibration: { ...DEFAULT_STATE.calibration, ...(saved.calibration ?? {}) },
                    fifo: saved.fifo?.rows?.length ? saved.fifo : DEFAULT_STATE.fifo,
                });
            }
            setLoaded(true);
        });
    }, []);
    useEffect(() => {
        if (!loaded) return;
        const timer = window.setTimeout(() => void saveSetting(STATE_KEY, state), 300);
        return () => window.clearTimeout(timer);
    }, [state, loaded]);

    const template = TEMPLATES[state.template];
    const size = perSheet(template);
    const cells = state.cells[state.template];
    const calibration = state.calibration[state.template];
    const sheets = useMemo(() => sheetsOf(cells, template), [cells, template]);
    const page = Math.floor(selected / size);
    const filled = cells.filter(cell => !isEmptyCell(cell));
    const broken = filled.filter(cell => cellProblem(cell!)).length;
    const printable = filled.length - broken;
    const current = cells[selected] ?? emptyCell(cells.find(cell => cell && !isEmptyCell(cell))?.kind ?? 'text');

    const setCells = (next: (LabelCell | null)[]) => setState(s => ({ ...s, cells: { ...s.cells, [s.template]: next } }));
    const updateCurrent = (change: Partial<LabelCell>) => {
        const next = [...cells];
        while (next.length <= selected) next.push(null);
        next[selected] = { ...current, ...change };
        setCells(next);
    };
    const goNext = () => {
        setSelected(index => index + 1);
        window.setTimeout(() => firstInput.current?.focus(), 0);
    };
    const place = (labels: LabelCell[], what: string) => {
        if (labels.length === 0) {
            toast.error('Chưa có tem nào để tạo');
            return;
        }
        const from = Math.max(1, Math.round(start) || 1) - 1;
        setCells(placeCells(cells, from, labels));
        setSelected(from);
        toast.success(`Đã tạo ${labels.length} ${what} từ tem số ${from + 1}`);
    };
    const setCalibration = (change: Partial<Calibration>) => setState(s => ({ ...s, calibration: { ...s.calibration, [s.template]: { ...s.calibration[s.template], ...change } } }));

    const importExcel = async (file: File) => {
        try {
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(await file.arrayBuffer());
            const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '' });
            place(sheetLabels(parseSheetRows(rows), excelKind), 'tem từ Excel');
        } catch {
            toast.error('Không đọc được file Excel');
        }
    };
    const downloadSample = async () => {
        const XLSX = await import('xlsx');
        const sheet = XLSX.utils.aoa_to_sheet([['Tên sản phẩm', 'Mã', 'Số tem'], ['Ốp lưng iPhone 15', 'OP015', 2], ['Cáp sạc Type-C', '8934563138165', 1]]);
        sheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 8 }];
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Nhãn');
        XLSX.writeFile(book, 'Mau_in_nhan.xlsx');
    };

    const print = (testFrame: boolean) => {
        // Tem lỗi để trống, không in dòng báo lỗi lên tem
        const clean = cells.map(cell => (cell && !isEmptyCell(cell) && !cellProblem(cell) ? cell : null));
        const pages = testFrame ? 1 : sheetsOf(clean, template).length;
        openPrintPreview({
            title: testFrame ? `${template.name} - in thử khung` : template.name,
            paper: { kind: 'a5', landscape: true },
            note: testFrame
                ? 'In lên giấy thường, áp lên tờ nhãn soi đèn: khung lệch thì chỉnh ở phần Căn chỉnh. Khi in chọn khổ A5, tỉ lệ 100%.'
                : `${printable} tem · ${pages} tờ A5. Khi in chọn khổ A5, tỉ lệ 100% (không co giãn).`,
            buildHtml: () => printDocument(template, clean, calibration, FONT_CSS, testFrame),
        });
    };

    const warn = cellProblem(current) || densityProblem(current, template);
    const fifoCount = state.fifo.rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.quantity) || 0), 0);

    return (
        <div className="relative h-full bg-slate-100">
            {active && <TopBarActions>{null}</TopBarActions>}
            {loaded && (
                <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-4 p-4 lg:p-5 xl:grid-cols-[minmax(0,1fr)_430px]">
                    <section className="flex min-h-0 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="w-[340px]">
                                <Segmented label="Mẫu tem" value={state.template} onChange={id => { setState(s => ({ ...s, template: id })); setSelected(0); }}
                                    options={[{ value: 'tomy-117', label: 'Tròn 117 · 48 tem' }, { value: 'tomy-105', label: 'Vuông 105 · 30 tem' }]} />
                            </div>
                            <p className="mr-auto text-[13px] font-semibold text-slate-600">
                                {filled.length} tem · {sheets.length} tờ A5{broken ? <span className="text-rose-600"> · {broken} tem lỗi không in</span> : null}
                            </p>
                            <Button size="icon-xs" variant="ghost" icon="chevronLeft" aria-label="Tờ trước" disabled={page === 0} onClick={() => setSelected((page - 1) * size)} />
                            <span className="text-[13px] font-bold text-slate-700 tabular-nums">Tờ {page + 1}/{Math.max(sheets.length, page + 1)}</span>
                            <Button size="icon-xs" variant="ghost" icon="chevronRight" aria-label="Tờ sau" onClick={() => setSelected((page + 1) * size)} />
                            <Button variant="ghost" icon="delete" className="text-rose-600" disabled={filled.length === 0} onClick={() => setClearAsk(true)}>Xoá hết</Button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto rounded-card border border-slate-200 bg-slate-50 p-3 scrollbar-thin">
                            <SheetPreview templateId={state.template} cells={cells} first={page * size} selected={selected}
                                onSelect={index => { setSelected(index); window.setTimeout(() => firstInput.current?.focus(), 0); }} />
                            <p className="mt-2 text-center text-[12px] text-slate-500">Bấm vào tem để sửa; gõ xong bấm Enter là sang tem kế tiếp. Khung nét đứt chỉ để xem, không in.</p>
                        </div>
                    </section>

                    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
                        <section className="space-y-2.5 rounded-card border border-slate-200 bg-white p-3" aria-label="Tem đang chọn">
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] font-bold text-slate-700">Tem số {selected + 1}</p>
                                <Button size="xs" variant="ghost" icon="delete" className="text-rose-600" disabled={isEmptyCell(cells[selected])}
                                    onClick={() => { const next = [...cells]; next[selected] = null; setCells(next); }}>Xoá tem</Button>
                            </div>
                            <Segmented label="Loại tem" value={current.kind} onChange={kind => updateCurrent({ kind })} options={KINDS} />
                            {current.kind === 'text' ? (
                                <div className="space-y-1.5">
                                    {(['line1', 'line2', 'line3'] as const).map((key, i) => (
                                        <input key={key} ref={i === 0 ? firstInput : undefined} value={current[key]} aria-label={`Dòng ${i + 1}`}
                                            placeholder={['Dòng 1 (chữ to), ví dụ 22/11', 'Dòng 2, ví dụ màu Đen', 'Dòng 3, ví dụ ghi chú 8/128'][i]}
                                            onChange={e => updateCurrent({ [key]: e.target.value })}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); goNext(); } }}
                                            className={`${field} ${i === 0 ? 'font-bold' : ''}`} />
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <input ref={firstInput} value={current.code} aria-label="Nội dung mã" placeholder={current.kind === 'qr' ? 'Nội dung mã QR: mã, đường link, chữ…' : 'Nội dung mã vạch: chữ không dấu, số'}
                                        onChange={e => updateCurrent({ code: e.target.value })}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); goNext(); } }}
                                        className={`${field} font-bold`} />
                                    <input value={current.name} aria-label="Tên sản phẩm" placeholder="Tên sản phẩm (không bắt buộc)"
                                        onChange={e => updateCurrent({ name: e.target.value })}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); goNext(); } }}
                                        className={field} />
                                    <p className="text-[11px] text-slate-500">Tem in tên sản phẩm, {current.kind === 'qr' ? 'mã QR' : 'mã vạch'} và dòng chữ của mã.</p>
                                </div>
                            )}
                            {warn && <p role="alert" className={`text-[12px] font-semibold ${cellProblem(current) ? 'text-rose-600' : 'text-amber-700'}`}>{warn}</p>}
                            <Button size="sm" variant="secondary" icon="copy" className="w-full" disabled={isEmptyCell(cells[selected])}
                                onClick={() => {
                                    const from = selected - (selected % size);
                                    const next = [...cells];
                                    for (let i = from; i < from + size; i += 1) if (isEmptyCell(next[i])) { while (next.length <= i) next.push(null); next[i] = { ...current }; }
                                    setCells(next);
                                    toast.success('Đã chép tem này vào các ô trống của tờ');
                                }}>Chép tem này vào các ô trống của tờ</Button>
                        </section>

                        <section className="space-y-2.5 rounded-card border border-slate-200 bg-white p-3" aria-label="Tạo nhanh">
                            <p className="text-[13px] font-bold text-slate-700">Tạo nhanh nhiều tem</p>
                            <Segmented label="Cách tạo" value={quick} onChange={setQuick}
                                options={[{ value: 'fifo', label: 'FIFO theo màu' }, { value: 'seq', label: 'Mã tự tăng' }, { value: 'excel', label: 'Nhập Excel' }]} />
                            <label className="flex items-center justify-between gap-2 text-[13px] text-slate-700">
                                <span>In từ vị trí (tem số)</span>
                                <input type="number" min={1} value={start} aria-label="In từ vị trí" onChange={e => setStart(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                                    className="h-8 w-20 rounded-control border border-slate-200 px-2 text-center text-[13px] tabular-nums focus:outline-none focus:border-sky-400" />
                            </label>
                            {quick === 'fifo' && (
                                <div className="space-y-1.5">
                                    <label className="flex items-center justify-between gap-2 text-[13px] text-slate-700">
                                        <span>Ngày tháng</span>
                                        <input value={fifoDate} aria-label="Ngày tháng" onChange={e => setFifoDate(e.target.value)} className={`${field} !w-28 text-center font-bold`} />
                                    </label>
                                    <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] gap-1 text-[11px] font-bold text-slate-500"><span>Màu</span><span>SL</span><span>Ghi chú</span></div>
                                    {state.fifo.rows.map((row, i) => {
                                        const change = (patch: Partial<FifoRow>) => setState(s => ({ ...s, fifo: { rows: s.fifo.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } }));
                                        return (
                                            <div key={i} className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] gap-1">
                                                <input value={row.color} aria-label={`Màu ${i + 1}`} onChange={e => change({ color: e.target.value })} className={`${field} !h-8 text-[13px]`} />
                                                <input type="number" min={0} value={row.quantity} aria-label={`Số lượng ${row.color || i + 1}`} onChange={e => change({ quantity: Math.max(0, Math.round(Number(e.target.value)) || 0) })}
                                                    className={`${field} !h-8 !px-1 text-center text-[13px] tabular-nums`} />
                                                <input value={row.note} aria-label={`Ghi chú ${row.color || i + 1}`} placeholder="8/128" onChange={e => change({ note: e.target.value })} className={`${field} !h-8 text-[13px]`} />
                                            </div>
                                        );
                                    })}
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="ghost" icon="add" onClick={() => setState(s => ({ ...s, fifo: { rows: [...s.fifo.rows, { color: '', quantity: 0, note: '' }] } }))}>Thêm màu</Button>
                                        <Button size="sm" className="ml-auto" disabled={fifoCount === 0} onClick={() => place(fifoLabels(fifoDate, state.fifo.rows), 'tem FIFO')}>Tạo {fifoCount} tem FIFO</Button>
                                    </div>
                                </div>
                            )}
                            {quick === 'seq' && (
                                <div className="space-y-1.5">
                                    <Segmented label="Loại tem tự tăng" value={seq.kind} onChange={kind => setSeq(s => ({ ...s, kind }))} options={KINDS} />
                                    <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold text-slate-500">
                                        <label className="space-y-0.5"><span>Đầu mã</span><input value={seq.prefix} aria-label="Đầu mã" onChange={e => setSeq(s => ({ ...s, prefix: e.target.value }))} className={field} /></label>
                                        <label className="space-y-0.5"><span>Số bắt đầu</span><input type="number" min={0} value={seq.from} aria-label="Số bắt đầu" onChange={e => setSeq(s => ({ ...s, from: Math.max(0, Math.round(Number(e.target.value)) || 0) }))} className={field} /></label>
                                        <label className="space-y-0.5"><span>Số tem</span><input type="number" min={1} value={seq.count} aria-label="Số tem tự tăng" onChange={e => setSeq(s => ({ ...s, count: Math.max(1, Math.round(Number(e.target.value)) || 1) }))} className={field} /></label>
                                    </div>
                                    <input value={seq.name} aria-label="Tên sản phẩm tự tăng" placeholder="Tên sản phẩm in kèm (không bắt buộc)" onChange={e => setSeq(s => ({ ...s, name: e.target.value }))} className={field} />
                                    <Button size="sm" className="w-full" onClick={() => place(sequenceLabels(seq.kind, seq.prefix.trim(), seq.from, seq.count, seq.name.trim()), 'tem mã tự tăng')}>
                                        Tạo {seq.count} tem: {seq.prefix}{seq.from} … {seq.prefix}{String(seq.from + seq.count - 1).padStart(String(seq.from).length, '0')}
                                    </Button>
                                </div>
                            )}
                            {quick === 'excel' && (
                                <div className="space-y-1.5">
                                    <p className="text-[12px] text-slate-500">File có cột <strong>Tên sản phẩm</strong>, <strong>Mã</strong>, <strong>Số tem</strong> (không có thì in 1 tem mỗi dòng).</p>
                                    <Segmented label="Loại tem từ Excel" value={excelKind} onChange={setExcelKind} options={KINDS} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Chọn file Excel</Button>
                                        <Button size="sm" variant="secondary" icon="download" onClick={() => void downloadSample()}>Tải file mẫu</Button>
                                    </div>
                                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="File Excel nhãn"
                                        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importExcel(file); }} />
                                </div>
                            )}
                        </section>

                        <section className="space-y-2 rounded-card border border-slate-200 bg-white p-3">
                            <Button size="lg" icon="print" className="w-full" disabled={printable === 0} onClick={() => print(false)}>
                                In {printable} tem{sheets.length > 1 ? ` (${sheets.length} tờ)` : ''}
                            </Button>
                            <p className="text-[11px] text-slate-500">Khi in chọn khổ giấy <strong>A5</strong>, tỉ lệ <strong>100%</strong> (không co giãn), đặt tờ nhãn đúng chiều.</p>
                            <details className="rounded-control border border-slate-200 px-3 py-2">
                                <summary className="cursor-pointer text-[13px] font-bold text-slate-700">Căn chỉnh vị trí in</summary>
                                <div className="mt-2 space-y-1.5">
                                    <p className="text-[11px] text-slate-500">In thử khung lên giấy thường, áp lên tờ nhãn soi đèn. Lệch bao nhiêu thì chỉnh bấy nhiêu; mỗi mẫu tem nhớ riêng.</p>
                                    <Stepper label="Dịch sang phải" value={calibration.offsetX} step={0.5} onChange={offsetX => setCalibration({ offsetX })} />
                                    <Stepper label="Dịch xuống dưới" value={calibration.offsetY} step={0.5} onChange={offsetY => setCalibration({ offsetY })} />
                                    <Stepper label="Nới khoảng cách cột" value={calibration.gapX} step={0.1} onChange={gapX => setCalibration({ gapX })} />
                                    <Stepper label="Nới khoảng cách hàng" value={calibration.gapY} step={0.1} onChange={gapY => setCalibration({ gapY })} />
                                    <div className="flex gap-2 pt-1">
                                        <Button size="sm" variant="secondary" icon="print" onClick={() => print(true)}>In thử khung</Button>
                                        <Button size="sm" variant="ghost" icon="reset" onClick={() => setCalibration(NO_CALIBRATION)}>Đặt lại</Button>
                                    </div>
                                </div>
                            </details>
                        </section>
                    </aside>
                </div>
            )}
            <ConfirmDialog isOpen={clearAsk} onClose={() => setClearAsk(false)}
                onConfirm={() => { setCells([]); setSelected(0); setClearAsk(false); }}
                title="Xoá hết tem?" variant="danger" zIndex="z-[200]" confirmText="Xoá hết" cancelText="Không xoá"
                message={`${filled.length} tem của ${template.name} sẽ bị xoá.`} />
        </div>
    );
}

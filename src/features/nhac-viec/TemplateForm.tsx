import React, { useState } from 'react';
import { Modal } from '../../components/shared/ui/Modal';
import { Button } from '../../components/shared/ui/Button';
import { Input } from '../../components/shared/ui/Input';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import type { ChecklistItemTemplate, ChecklistTemplate } from './nhacViecModel';
import { newId, weekdayName } from './nhacViecModel';
import { useNhacViec } from './NhacViecProvider';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const emptyItem = (): ChecklistItemTemplate => ({ id: newId('i'), title: '', guide: '', required: true, needPhoto: false, needNote: false });

const Toggle: React.FC<{ on: boolean; label: string; onChange: (value: boolean) => void }> = ({ on, label, onChange }) => (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
        className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${on ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500'}`}>
        {on ? '✓ ' : ''}{label}
    </button>
);

/**
 * Tạo hoặc sửa mẫu checklist: danh sách việc, việc nào bắt buộc, cần ảnh, cần ghi chú; lịch làm và hạn trong ngày.
 * `copyFrom`: nhân bản, điền sẵn đủ danh sách việc và lịch, tên thêm "(bản sao)", lưu thành mẫu mới.
 */
export const TemplateForm: React.FC<{ template: ChecklistTemplate | null; copyFrom?: ChecklistTemplate | null; onClose: () => void }> = ({ template, copyFrom, onClose }) => {
    const { saveTemplate, deleteTemplate } = useNhacViec();
    const base = template ?? copyFrom ?? null;
    const [name, setName] = useState(template?.name ?? (copyFrom ? `${copyFrom.name} (bản sao)` : ''));
    const [description, setDescription] = useState(base?.description ?? '');
    const [items, setItems] = useState<ChecklistItemTemplate[]>(() => {
        if (template?.items.length) return template.items;
        if (copyFrom?.items.length) return copyFrom.items.map(item => ({ ...item, id: newId('i') }));
        return [emptyItem(), emptyItem(), emptyItem()];
    });
    const [schedule, setSchedule] = useState(base?.schedule ?? { enabled: false, days: [1, 2, 3, 4, 5, 6, 0], start: '08:00', due: '09:00' });
    const [error, setError] = useState('');

    const update = (index: number, change: Partial<ChecklistItemTemplate>) => setItems(list => list.map((item, i) => (i === index ? { ...item, ...change } : item)));
    const move = (index: number, delta: number) => setItems(list => {
        const next = [...list];
        const [item] = next.splice(index, 1);
        next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
        return next;
    });

    const save = () => {
        const cleanItems = items.map(item => ({ ...item, title: item.title.trim(), guide: item.guide.trim() })).filter(item => item.title);
        if (!name.trim()) return setError('Nhập tên checklist.');
        if (cleanItems.length === 0) return setError('Thêm ít nhất một việc.');
        if (schedule.enabled && schedule.days.length === 0) return setError('Chọn ít nhất một ngày trong lịch.');
        if (schedule.enabled && schedule.due <= schedule.start) return setError('Giờ hạn phải sau giờ bắt đầu.');
        const now = Date.now();
        saveTemplate({
            id: template?.id ?? newId('cl'),
            name: name.trim(),
            description: description.trim(),
            items: cleanItems,
            schedule,
            createdAt: template?.createdAt ?? now,
            updatedAt: now,
        });
        toast.success(template ? 'Đã lưu mẫu checklist' : copyFrom ? 'Đã tạo bản sao mẫu checklist' : 'Đã tạo mẫu checklist');
        onClose();
    };

    const footer = (
        <div className="flex w-full items-center gap-2">
            {template && (
                <Button variant="ghost" icon="delete" className="mr-auto text-rose-600" onClick={() => {
                    deleteTemplate(template.id);
                    toast.success('Đã xoá mẫu checklist. Các lượt đã làm vẫn còn trong lịch sử.');
                    onClose();
                }}>Xoá mẫu</Button>
            )}
            <Button variant="secondary" className={template ? '' : 'ml-auto'} onClick={onClose}>Huỷ</Button>
            <Button onClick={save}>{template ? 'Lưu' : 'Tạo mẫu'}</Button>
        </div>
    );

    return (
        <Modal isOpen={true} onClose={onClose} title={template ? 'Sửa mẫu checklist' : copyFrom ? 'Nhân bản mẫu checklist' : 'Tạo mẫu checklist'} maxWidth="xl" footer={footer} zIndex="z-[200]">
            <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <label className="space-y-1.5 block">
                        <span className="text-[12px] font-bold text-slate-600">Tên checklist</span>
                        <Input value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Mở ca sáng" autoFocus aria-label="Tên checklist" />
                    </label>
                    <label className="space-y-1.5 block">
                        <span className="text-[12px] font-bold text-slate-600">Mô tả</span>
                        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Làm trước khi mở cửa đón khách" aria-label="Mô tả checklist" />
                    </label>
                </div>

                <div className="space-y-2">
                    <p className="text-[12px] font-bold text-slate-600">Các việc ({items.filter(item => item.title.trim()).length})</p>
                    <ol className="space-y-2">
                        {items.map((item, index) => (
                            <li key={item.id} className="rounded-control border border-slate-200 bg-white p-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-6 shrink-0 text-center text-[13px] font-bold text-slate-400">{index + 1}</span>
                                    <Input value={item.title} onChange={e => update(index, { title: e.target.value })} placeholder="Tên việc" aria-label={`Việc ${index + 1}`} className="flex-1" />
                                    <button type="button" aria-label="Lên" onClick={() => move(index, -1)} disabled={index === 0} className="h-8 w-8 rounded-control text-slate-500 hover:bg-slate-100 disabled:opacity-30"><AppIcon name="chevronUp" size="sm" /></button>
                                    <button type="button" aria-label="Xuống" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="h-8 w-8 rounded-control text-slate-500 hover:bg-slate-100 disabled:opacity-30"><AppIcon name="chevronDown" size="sm" /></button>
                                    <button type="button" aria-label={`Xoá việc ${index + 1}`} onClick={() => setItems(list => list.filter((_, i) => i !== index))} className="h-8 w-8 rounded-control text-slate-400 hover:bg-rose-50 hover:text-rose-600"><AppIcon name="delete" size="sm" /></button>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                                    <input value={item.guide} onChange={e => update(index, { guide: e.target.value })} placeholder="Hướng dẫn cách làm (không bắt buộc)" aria-label={`Hướng dẫn việc ${index + 1}`}
                                        className="h-8 min-w-[200px] flex-1 rounded-control border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:border-sky-400" />
                                    <Toggle on={item.required} label="Bắt buộc" onChange={value => update(index, { required: value })} />
                                    <Toggle on={item.needPhoto} label="Cần ảnh" onChange={value => update(index, { needPhoto: value })} />
                                    <Toggle on={item.needNote} label="Cần ghi chú" onChange={value => update(index, { needNote: value })} />
                                </div>
                            </li>
                        ))}
                    </ol>
                    <Button variant="secondary" size="sm" icon="add" onClick={() => setItems(list => [...list, emptyItem()])}>Thêm việc</Button>
                </div>

                <div className="rounded-control border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <label className="flex items-center gap-2 text-[13px] font-bold text-slate-700">
                        <input type="checkbox" checked={schedule.enabled} onChange={e => setSchedule({ ...schedule, enabled: e.target.checked })} className="accent-sky-600" />
                        Làm theo lịch và nhắc tự động
                    </label>
                    {schedule.enabled && (
                        <>
                            <div role="group" aria-label="Ngày làm" className="flex flex-wrap gap-1.5">
                                {WEEK_ORDER.map(day => {
                                    const on = schedule.days.includes(day);
                                    return (
                                        <button key={day} type="button" aria-pressed={on} onClick={() => setSchedule({ ...schedule, days: on ? schedule.days.filter(d => d !== day) : [...schedule.days, day] })}
                                            className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${on ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                                            {weekdayName(day)}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-700">
                                <label className="flex items-center gap-2">Bắt đầu <Input type="time" value={schedule.start} onChange={e => setSchedule({ ...schedule, start: e.target.value })} aria-label="Giờ bắt đầu" className="w-32" /></label>
                                <label className="flex items-center gap-2">Hạn hoàn tất <Input type="time" value={schedule.due} onChange={e => setSchedule({ ...schedule, due: e.target.value })} aria-label="Giờ hạn checklist" className="w-32" /></label>
                            </div>
                            <p className="text-[11px] text-slate-500">App nhắc lúc bắt đầu, 15 phút trước hạn và lúc hạn nếu chưa hoàn tất.</p>
                        </>
                    )}
                </div>
                {error && <p role="alert" className="rounded-control bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700">{error}</p>}
            </div>
        </Modal>
    );
};

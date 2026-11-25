import React, { useRef, useState } from 'react';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';
import { Textarea } from '../../components/shared/ui/Textarea';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { toast } from '../../components/shared/ui/toast';
import type { Reminder } from './nhacViecModel';
import { PROOF_TEXT, dateTimeText, proofNeedsNote, proofNeedsPhoto } from './nhacViecModel';
import { MAX_PHOTOS } from './sheetBridge';
import { CameraCapture, compressImage } from './photos';
import { useNhacViec } from './NhacViecProvider';

/**
 * Hoàn tất việc kèm ghi chú, ảnh (việc yêu cầu thì bắt buộc), hoặc báo Cần hỗ trợ kèm lý do, ảnh. Đồng bộ hai chiều thì file ghi vào
 * Nhật ký, ảnh lưu vào Google Drive, máy quản lý được báo.
 */
export const OccDialog: React.FC<{ mode: 'done' | 'help'; reminder: Reminder; occ: number; onClose: () => void }> = ({ mode, reminder, occ, onClose }) => {
    const { completeReminder, requestHelp, bridgeV2 } = useNhacViec();
    const [note, setNote] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [camera, setCamera] = useState(false);
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const done = mode === 'done';
    const needNote = !done || proofNeedsNote(reminder.proof);
    const needPhoto = done && proofNeedsPhoto(reminder.proof);
    const full = photos.length >= MAX_PHOTOS;
    const addPhotos = (list: string[]) => {
        setPhotos(current => [...current, ...list].slice(0, MAX_PHOTOS));
        setError('');
    };

    const submit = () => {
        if (needNote && !note.trim()) {
            setError(done ? 'Việc này cần ghi chú khi xong.' : 'Ghi lý do cần hỗ trợ để quản lý biết.');
            return;
        }
        if (needPhoto && photos.length === 0) {
            setError('Việc này cần ảnh khi xong: bấm Chụp ảnh hoặc Chọn ảnh.');
            return;
        }
        if (done) completeReminder(reminder.id, occ, { note, photos });
        else requestHelp(reminder.id, occ, { note, photos });
        toast.success(done ? 'Đã xong' : 'Đã báo cần hỗ trợ');
        onClose();
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={done ? 'Hoàn tất việc' : 'Cần hỗ trợ'} maxWidth="md" zIndex="z-[200]"
            footer={(
                <div className="flex w-full justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>Huỷ</Button>
                    <Button icon={done ? 'check' : 'send'} variant={done ? 'success' : 'warning'} onClick={submit}>{done ? 'Xong' : 'Gửi quản lý'}</Button>
                </div>
            )}>
            <div className="space-y-3">
                <div>
                    <p className="text-[15px] font-bold text-slate-900 break-words">{reminder.title}</p>
                    <p className="text-[12px] text-slate-500">
                        Hạn {dateTimeText(occ)}{reminder.department ? ` · ${reminder.department}` : ''}{done && reminder.proof ? ` · Khi xong cần: ${PROOF_TEXT[reminder.proof]}` : ''}
                    </p>
                </div>
                <label className="block space-y-1.5">
                    <span className="block text-[13px] font-bold text-slate-700">
                        {done ? `Ghi chú${needNote ? '' : ' (không bắt buộc)'}` : 'Lý do cần hỗ trợ'}
                    </span>
                    <Textarea value={note} onChange={e => { setNote(e.target.value); setError(''); }} rows={3} autoFocus
                        aria-label={done ? 'Ghi chú khi xong' : 'Lý do cần hỗ trợ'}
                        placeholder={done ? 'Ví dụ: đã nhập đủ 12 thùng, thiếu 1 thùng ốp lưng' : 'Ví dụ: xe hàng chưa tới, cần người phụ bốc hàng'} />
                </label>
                <div className="space-y-1.5">
                    <p className="text-[13px] font-bold text-slate-700">Ảnh{needPhoto ? '' : ' (không bắt buộc)'} · {photos.length}/{MAX_PHOTOS}</p>
                    {photos.length > 0 && (
                        <ul className="grid grid-cols-4 gap-2">
                            {photos.map((url, index) => (
                                <li key={index} className="relative">
                                    <img src={url} alt={`Ảnh ${index + 1}`} className="aspect-square w-full rounded-control object-cover ring-1 ring-slate-200" />
                                    <button type="button" aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}
                                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-rose-600">
                                        <AppIcon name="close" size="xs" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="flex gap-2">
                        <Button size="sm" variant={needPhoto && photos.length === 0 ? 'warning' : 'secondary'} icon="takePhoto" disabled={full} onClick={() => setCamera(true)}>Chụp ảnh</Button>
                        <Button size="sm" variant="secondary" icon="image" disabled={full} onClick={() => fileRef.current?.click()}>Chọn ảnh</Button>
                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Chọn ảnh kèm theo"
                            onChange={async event => {
                                const files = [...(event.target.files ?? [])];
                                event.target.value = '';
                                const list: string[] = [];
                                for (const file of files.slice(0, MAX_PHOTOS)) list.push(await compressImage(file));
                                addPhotos(list);
                            }} />
                    </div>
                </div>
                {error && <p role="alert" className="text-[13px] font-semibold text-rose-600">{error}</p>}
                <p className="text-[12px] text-slate-500">
                    {!bridgeV2 ? 'Ghi chú và ảnh lưu trên máy này.'
                        : done ? 'Google Sheet ghi người xong, ghi chú và link ảnh vào trang Nhật ký.'
                            : 'Máy quản lý và người giao việc được báo ngay khi đồng bộ (khoảng 1 phút). Google Sheet ghi vào trang Nhật ký.'}
                </p>
            </div>
            {camera && <CameraCapture onClose={() => setCamera(false)} onCapture={dataUrl => { setCamera(false); addPhotos([dataUrl]); }} />}
        </Modal>
    );
};

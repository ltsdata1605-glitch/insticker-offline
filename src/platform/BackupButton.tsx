import React, { useRef, useState } from 'react';
import { Button } from '../components/shared/ui/Button';
import { AppIcon } from '../components/shared/ui/icon/AppIcon';
import { Modal } from '../components/shared/ui/Modal';
import { toast } from '../components/shared/ui/toast';
import { getSetting, saveSetting } from '../features/sticker-event/services/dbService';
import { readAppData, replaceAppData } from '../features/sticker-event/services/fileParser';
import { APP_DATA_KEYS, SETTING_KEYS, encodeBackup, parseBackup } from './backupFormat';
import { RESTORE_SOURCE, freezeLocalWrites, unfreezeLocalWrites } from './localWriteGuard';
import type { BackupData } from './backupFormat';

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const createBackupFile = async (): Promise<void> => {
  const settings: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = await getSetting(key);
    if (value !== null) settings[key] = value;
  }
  const now = new Date();
  const text = encodeBackup({ appData: await readAppData(APP_DATA_KEYS), settings }, now);

  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `in-sticker-sao-luu-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const restoreBackup = async (data: BackupData): Promise<void> => {
  await replaceAppData(APP_DATA_KEYS, data.appData);
  for (const key of SETTING_KEYS) {
    await saveSetting(key, key in data.settings ? data.settings[key] : null, RESTORE_SOURCE);
  }
};

/** Nút trên thanh trên cùng: chuyển dữ liệu giữa các máy bằng file, thay cho đồng bộ Cloud của bản web. */
export const BackupButton: React.FC<{ className?: string }> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<(BackupData & { createdAt: string }) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setBusy(true);
    try {
      await createBackupFile();
    } catch (e) {
      toast.error(`Không sao lưu được: ${toMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      toast.error(toMessage(e));
    }
  };

  const handleRestore = async () => {
    if (!pending) return;
    setBusy(true);
    freezeLocalWrites();
    try {
      await restoreBackup(pending);
      window.location.reload();
    } catch (e) {
      unfreezeLocalWrites();
      toast.error(`Không khôi phục được: ${toMessage(e)}`);
      setBusy(false);
    }
  };

  const close = () => {
    setIsOpen(false);
    setPending(null);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="none"
        onClick={() => setIsOpen(true)}
        className={className}
        title="Sao lưu và khôi phục dữ liệu"
        aria-label="Sao lưu và khôi phục dữ liệu"
      >
        <AppIcon name="database" size="md" />
      </Button>

      {isOpen && (
        <Modal isOpen onClose={close} title="Sao lưu và khôi phục" titleColorClass="text-slate-900" maxWidth="sm" zIndex="z-[200]">
          {pending ? (
            <div className="space-y-4" data-testid="backup-confirm">
              <p className="text-sm text-slate-700 leading-relaxed">
                Khôi phục sẽ <strong>thay toàn bộ dữ liệu hiện có trên máy này</strong> bằng dữ liệu trong file
                {pending.createdAt ? <> tạo lúc <strong>{new Date(pending.createdAt).toLocaleString('vi-VN')}</strong></> : null}.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>Hủy</Button>
                <Button variant="danger" onClick={() => void handleRestore()} disabled={busy}>Thay dữ liệu</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Dữ liệu của app nằm trên máy này. Để chuyển sang máy khác, tạo file sao lưu rồi mở file đó ở máy kia. File gồm bảng giá, tồn kho, sản phẩm nhập tay, danh sách đã lưu, lịch sử in và cài đặt.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" icon="download" onClick={() => void handleBackup()} disabled={busy}>Sao lưu ra file</Button>
                <Button variant="secondary" icon="upload" onClick={() => inputRef.current?.click()} disabled={busy}>Khôi phục từ file</Button>
              </div>
              <input ref={inputRef} type="file" accept=".json,application/json" onChange={(e) => void handlePick(e)} className="hidden" data-testid="backup-file" />
            </div>
          )}
        </Modal>
      )}
    </>
  );
};

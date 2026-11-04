import { useEffect } from 'react';
import type { DownloadDone } from '../../electron/contract';
import { toast } from '../components/shared/ui/toast';

/** Gom các tệp lưu gần nhau (vd xuất nhiều ảnh, nhiều file mẫu) thành một thông báo. */
const GROUP_WINDOW_MS = 900;

/** App tự lưu file vào thư mục Tải về như Chrome, nên cần báo cho người dùng biết file ở đâu. */
export const useDownloadNotice = (): void => {
  useEffect(() => {
    let batch: DownloadDone[] = [];
    let timer: number | undefined;

    const flush = () => {
      const saved = batch.filter((item) => item.ok);
      const failed = batch.length - saved.length;
      batch = [];
      if (failed > 0) toast.error(`Không lưu được ${failed} tệp`);
      if (saved.length === 0) return;
      const last = saved[saved.length - 1];
      toast.action({
        kind: 'success',
        title: saved.length === 1 ? `Đã lưu ${last.fileName}` : `Đã lưu ${saved.length} tệp`,
        description: 'Trong thư mục Tải về của máy',
        duration: 6000,
        actions: [{ label: 'Mở thư mục', onClick: () => window.stickerDesktop.showInFolder(last.path) }],
      });
    };

    const unsubscribe = window.stickerDesktop.onDownloadDone((item) => {
      batch.push(item);
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, GROUP_WINDOW_MS);
    });

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);
};

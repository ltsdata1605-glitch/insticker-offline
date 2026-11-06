import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/shared/ui/Button';
import { AppIcon } from '../components/shared/ui/icon/AppIcon';
import { ProgressBar } from '../components/shared/ui/ProgressBar';
import { toast } from '../components/shared/ui/toast';
import { subscribePrintPreviewOpen } from './printPreview';
import { useUpdateState } from './useUpdateState';

const BLOCKING_PHASES = new Set(['available', 'downloading', 'ready', 'installing', 'failed', 'manual']);

const toMb = (bytes = 0): string => (bytes / 1024 / 1024).toFixed(0);

/**
 * Có bản mới thì khoá app tới khi cập nhật xong. Đang mở màn in thì chờ người dùng in xong mới khoá.
 * Chỉ khi tải hoặc cài gặp sự cố mới có nút dùng tiếp, để lỗi cập nhật không chặn việc in.
 */
export const UpdateGate: React.FC = () => {
  const state = useUpdateState();
  const [previewOpen, setPreviewOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const announcedRef = useRef(false);
  const api = window.stickerDesktop.update;

  useEffect(() => subscribePrintPreviewOpen(setPreviewOpen), []);

  const blocking = Boolean(state?.version && !state.bypassed && BLOCKING_PHASES.has(state.phase));
  const visible = blocking && !previewOpen;

  useEffect(() => {
    if (visible && state?.phase === 'ready') void api.install();
  }, [visible, state?.phase, api]);

  useEffect(() => {
    if (!state?.justUpdatedFrom || announcedRef.current) return;
    announcedRef.current = true;
    toast.success(`Đã cập nhật lên bản ${state.currentVersion}`);
  }, [state?.justUpdatedFrom, state?.currentVersion]);

  // Khoá cả bàn phím: không cho Tab tới các nút phía sau lớp phủ
  useEffect(() => {
    if (!visible) return undefined;
    const others = [...document.body.children].filter((el) => el !== overlayRef.current);
    others.forEach((el) => el.setAttribute('inert', ''));
    return () => others.forEach((el) => el.removeAttribute('inert'));
  }, [visible]);

  if (!visible || !state) return null;

  const { phase, version, percent = 0, downloadedBytes, totalBytes, message } = state;
  const title = {
    available: `Có bản mới ${version}`,
    downloading: `Đang tải bản ${version}`,
    ready: `Đang cài bản ${version}`,
    installing: `Đang cài bản ${version}`,
    failed: 'Chưa cập nhật được',
    manual: `Có bản mới ${version}`,
  }[phase as 'available'];

  return createPortal(
    <div
      ref={overlayRef}
      data-testid="update-gate"
      className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-popup bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${phase === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'}`}>
            <AppIcon name={phase === 'failed' ? 'warning' : 'download'} size="md" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>

        {phase === 'available' && (
          <>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cần cập nhật để tiếp tục dùng app. Bảng giá, danh sách và cài đặt của bạn được giữ nguyên.
            </p>
            <Button variant="primary" className="w-full" onClick={() => void api.download()}>Cập nhật ngay</Button>
          </>
        )}

        {phase === 'downloading' && (
          <div className="space-y-2">
            <ProgressBar value={percent} variant="brand" size="md" aria-label="Tiến độ tải bản mới" />
            <p className="text-sm text-slate-600" data-testid="update-progress">
              {percent}%{totalBytes ? ` (${toMb(downloadedBytes)}/${toMb(totalBytes)} MB)` : ''}. Sau khi tải xong, app tự cài và mở lại.
            </p>
          </div>
        )}

        {(phase === 'ready' || phase === 'installing') && (
          <p className="text-sm text-slate-600 leading-relaxed">App sẽ tự đóng và mở lại sau khi cài xong. Vui lòng chờ trong giây lát.</p>
        )}

        {(phase === 'failed' || phase === 'manual') && (
          <>
            <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
            <div className="flex flex-col gap-2">
              {phase === 'failed'
                ? <Button variant="primary" onClick={() => void api.download()}>Thử lại</Button>
                : <Button variant="primary" onClick={() => void api.openDownloadPage()}>Mở trang tải</Button>}
              <Button variant="secondary" onClick={() => void api.continueWithoutUpdate()}>Dùng tiếp lần này</Button>
            </div>
            <p className="text-xs text-slate-500">Lần mở app sau sẽ nhắc cập nhật lại.</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

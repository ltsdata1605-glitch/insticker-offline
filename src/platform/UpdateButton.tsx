import React, { useState } from 'react';
import type { UpdateState } from '../../electron/contract';
import { Button } from '../components/shared/ui/Button';
import { AppIcon } from '../components/shared/ui/icon/AppIcon';
import { Modal } from '../components/shared/ui/Modal';
import { Switch } from '../components/shared/ui/Switch';
import { useUpdateState } from './useUpdateState';

const describeStatus = (state: UpdateState): string => {
  if (!state.enabled) return 'Bản chạy từ mã nguồn không có cập nhật.';
  if (state.phase === 'checking') return 'Đang kiểm tra bản mới...';
  if (state.bypassed && state.version) return `Có bản ${state.version} nhưng lần này đang dùng tiếp bản cũ.`;
  if (state.phase === 'up-to-date') return 'Đang dùng bản mới nhất.';
  if (state.phase === 'idle' && state.message) return state.message;
  return 'Chưa kiểm tra bản mới.';
};

const formatCheckedAt = (at?: number): string | null =>
  at ? new Date(at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

/** Nút trên thanh trên cùng: luôn hiện số phiên bản, bấm vào để kiểm tra bản mới và chọn tự động tải hay không. */
export const UpdateButton: React.FC<{ className?: string }> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const state = useUpdateState();
  const api = window.stickerDesktop.update;
  const pending = Boolean(state?.bypassed && state.version);
  const version = state?.currentVersion;
  const checkedAt = formatCheckedAt(state?.lastCheckedAt);

  return (
    <>
      <Button
        variant="ghost"
        size="none"
        onClick={() => setIsOpen(true)}
        className={className}
        title={version ? `Phiên bản ${version}. Bấm để kiểm tra bản mới` : 'Kiểm tra bản mới'}
        aria-label={version ? `Cập nhật ứng dụng, đang dùng bản ${version}` : 'Cập nhật ứng dụng'}
      >
        <AppIcon name="refresh" size="sm" />
        {version && <span className="text-[12px] font-semibold tabular-nums" data-testid="app-version">v{version}</span>}
        {pending && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" data-testid="update-pending-dot" />}
      </Button>

      {isOpen && state && (
        <Modal isOpen onClose={() => setIsOpen(false)} title="Cập nhật ứng dụng" titleColorClass="text-slate-900" maxWidth="sm" zIndex="z-[200]">
          <div className="space-y-4" data-testid="update-settings">
            <div className="rounded-control bg-slate-50 border border-slate-100 p-3 space-y-1">
              <p className="text-sm text-slate-700">Phiên bản đang dùng: <strong>{state.currentVersion}</strong></p>
              <p className="text-sm text-slate-600" role="status" data-testid="update-status">{describeStatus(state)}</p>
              {checkedAt && <p className="text-xs text-slate-500" data-testid="update-checked-at">Kiểm tra lần cuối: {checkedAt}</p>}
            </div>

            {pending ? (
              <Button variant="primary" className="w-full" onClick={() => void api.download()}>Cập nhật ngay</Button>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                icon="refresh"
                isLoading={state.phase === 'checking'}
                disabled={!state.enabled || state.phase === 'checking'}
                onClick={() => void api.check()}
              >
                {state.phase === 'checking' ? 'Đang kiểm tra...' : 'Kiểm tra bản mới'}
              </Button>
            )}

            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="update-auto-label" className="text-sm font-medium text-slate-800">Tự động tải và cài</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                  Tắt thì app báo có bản mới và chờ bạn bấm Cập nhật ngay.
                </p>
              </div>
              <Switch
                checked={state.autoDownload}
                onChange={(checked) => void api.setAutoDownload(checked)}
                aria-labelledby="update-auto-label"
                data-testid="update-auto-switch"
              />
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Có bản mới thì phải cập nhật mới dùng tiếp được. App chỉ dùng mạng để kiểm tra và tải bản cập nhật; không có mạng vẫn in bình thường.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
};

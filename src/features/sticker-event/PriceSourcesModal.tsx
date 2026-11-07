import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';
import { EmptyState } from '../../components/shared/ui/EmptyState';
import { toast } from '../../components/shared/ui/toast';
import ConfirmModal from './ConfirmModal';
import { loadPriceSources } from './services/fileParser';
import { fullyOverriddenIds, summarizeSources } from './services/priceSources';
import type { PriceSourceSummary } from './services/priceSources';

interface PriceSourcesModalProps {
  onClose: () => void;
  /** Xoá các file khỏi bảng giá, trả về số sản phẩm còn lại. */
  onDeleteSources: (ids: string[]) => Promise<number>;
}

interface PendingDelete {
  ids: string[];
  title: string;
  message: string;
  done: string;
}

const vi = (n: number) => n.toLocaleString('vi-VN');

/** Màn quản lý các file bảng giá đã nhập: mỗi file một dòng, xoá riêng từng file. */
const PriceSourcesModal: React.FC<PriceSourcesModalProps> = ({ onClose, onDeleteSources }) => {
  const [sources, setSources] = useState<PriceSourceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Giữ nội dung hộp xác nhận cả lúc hộp đang đóng dần, chữ không bị trống
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSources(summarizeSources(await loadPriceSources()));
      setError(null);
    } catch (err) {
      console.error('Không đọc được các file bảng giá:', err);
      setError('Không đọc được các file bảng giá đã nhập.');
      setSources([]);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const replacedIds = useMemo(() => (sources ? fullyOverriddenIds(sources) : []), [sources]);
  const effectiveTotal = useMemo(
    () => (sources ?? []).reduce((sum, s) => sum + s.productCount - s.overriddenCount, 0),
    [sources],
  );

  const askDelete = (source: PriceSourceSummary) => {
    const kept = source.overriddenCount;
    setPending({
      ids: [source.id],
      title: 'Xoá file khỏi bảng giá',
      message: [
        `Xoá "${source.fileName}" (${vi(source.productCount)} sản phẩm) khỏi bảng giá?`,
        'Sản phẩm chỉ có trong file này sẽ không còn tìm được. Sản phẩm có trong file khác vẫn còn, lấy giá của file nhập gần nhất còn lại.',
        kept > 0 ? `${vi(kept)} sản phẩm của file này đang dùng giá của file nhập sau nên không đổi.` : '',
        'Danh sách đang hiển thị giữ nguyên.',
      ].filter(Boolean).join('\n\n'),
      done: `Đã xoá "${source.fileName}"`,
    });
    setIsConfirmOpen(true);
  };

  const askDeleteReplaced = () => {
    setPending({
      ids: replacedIds,
      title: 'Dọn file đã bị thay hết',
      message: `Xoá ${replacedIds.length} file mà mọi sản phẩm đều đã có giá ở file nhập sau? Bảng giá đang dùng không đổi.`,
      done: `Đã xoá ${replacedIds.length} file`,
    });
    setIsConfirmOpen(true);
  };

  const executeDelete = async () => {
    if (!pending) return;
    const { ids, done } = pending;
    setIsConfirmOpen(false);
    setBusy(true);
    try {
      const remaining = await onDeleteSources(ids);
      toast.success(`${done}. Bảng giá còn ${vi(remaining)} sản phẩm.`);
      await reload();
    } catch (err) {
      console.error('Không xoá được file bảng giá:', err);
      toast.error('Không xoá được file. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="File bảng giá đã nhập"
      subTitle={sources && sources.length > 0 ? `${vi(sources.length)} file · ${vi(effectiveTotal)} sản phẩm trong bảng giá` : undefined}
      maxWidth="lg"
    >
      <div className="space-y-3" data-testid="price-sources">
        {error && <div className="bg-rose-50 text-rose-600 p-3 rounded-md text-sm">{error}</div>}

        {sources === null ? (
          <div className="flex justify-center items-center py-14">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
          </div>
        ) : sources.length === 0 ? (
          <EmptyState icon="spreadsheet" title="Chưa nhập file bảng giá nào" description='Bấm ô "Bảng Giá" để nhập file giá xuất từ ERP.' />
        ) : (
          <>
            <p className="text-xs text-slate-500 leading-relaxed">
              File nhập sau ghi đè giá của file nhập trước khi trùng mã. Xoá một file thì sản phẩm của nó có trong file khác vẫn còn.
            </p>

            {replacedIds.length > 0 && (
              <div className="flex items-center justify-between gap-3 p-2.5 rounded-popup bg-amber-50 border border-amber-200 text-amber-800">
                <span className="text-xs">
                  {vi(replacedIds.length)} file có mọi sản phẩm đã được file mới hơn cập nhật giá.
                </span>
                <Button variant="secondary" size="sm" onClick={askDeleteReplaced} disabled={busy} className="shrink-0 bg-white">
                  Dọn {vi(replacedIds.length)} file
                </Button>
              </div>
            )}

            <ul className="space-y-2">
              {sources.map((source, index) => {
                const effective = source.productCount - source.overriddenCount;
                const replaced = source.productCount > 0 && effective === 0;
                return (
                  <li
                    key={source.id}
                    data-source-file={source.fileName}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-popup border border-slate-200 hover:border-sky-300 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-control bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <AppIcon name="spreadsheet" size="md" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-800 truncate" title={source.fileName}>{source.fileName}</h3>
                        {index === 0 && (
                          <span className="shrink-0 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-100 px-1.5 rounded">Mới nhất</span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                        <span>{new Date(source.importedAt).getTime() > 0 ? new Date(source.importedAt).toLocaleString('vi-VN') : 'Nạp từ bản trước'}</span>
                        {source.exportDate && <span className="truncate">· {source.exportDate}</span>}
                      </div>
                      {source.overriddenCount > 0 && (
                        <p className={`text-[11px] mt-0.5 ${replaced ? 'text-amber-700' : 'text-slate-400'}`}>
                          {replaced
                            ? 'Mọi sản phẩm đã có giá ở file nhập sau'
                            : `${vi(source.overriddenCount)} sản phẩm đã có giá ở file nhập sau`}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold text-slate-800 tabular-nums" data-testid="source-count">{vi(source.productCount)}</span>
                      <span className="block text-[11px] text-slate-500">sản phẩm</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => askDelete(source)}
                      disabled={busy}
                      icon="delete"
                      title={`Xoá file ${source.fileName}`}
                      aria-label={`Xoá file ${source.fileName}`}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={executeDelete}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        confirmText="Xoá"
        type="danger"
      />
    </Modal>
  );
};

export default PriceSourcesModal;

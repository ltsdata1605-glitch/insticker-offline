import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Button } from '../../components/shared/ui/Button';
import { Input } from '../../components/shared/ui/Input';
import { Modal } from '../../components/shared/ui/Modal';
import { EmptyState } from '../../components/shared/ui/EmptyState';
import { toast } from '../../components/shared/ui/toast';
import ConfirmModal from './ConfirmModal';
import { loadPriceImportHistory, savePriceImportHistory } from './services/fileParser';
import { MAX_IMPORT_HISTORY } from './services/priceSources';
import type { PriceChange, PriceImportRecord, PriceItemSummary } from './services/priceSources';

interface PriceImportHistoryModalProps {
  onClose: () => void;
}

type DetailTab = 'added' | 'updated';

/** Lô lớn (lần nhập đầu có thể vài nghìn mã) chỉ vẽ chừng này dòng, gõ để lọc phần còn lại. */
const MAX_ROWS = 300;

const vi = (n: number) => n.toLocaleString('vi-VN');

const matches = (item: PriceItemSummary, query: string) =>
  !query || item.msp.toLowerCase().includes(query) || item.sanPham.toLowerCase().includes(query);

const PriceChangeText: React.FC<{ item: PriceChange }> = ({ item }) => {
  if (item.giaGiam !== item.giaGiamCu) {
    return (
      <span className="tabular-nums whitespace-nowrap">
        <span className="text-slate-400 line-through">{item.giaGiamCu}</span>
        <span className="mx-1 text-slate-400">→</span>
        <span className="font-bold text-rose-600">{item.giaGiam}</span>
      </span>
    );
  }
  if (item.giaGoc !== item.giaGocCu) {
    return (
      <span className="tabular-nums whitespace-nowrap text-slate-600">
        Giá gốc <span className="text-slate-400 line-through">{item.giaGocCu}</span>
        <span className="mx-1 text-slate-400">→</span>
        <span className="font-semibold">{item.giaGoc}</span>
      </span>
    );
  }
  return <span className="text-slate-500 whitespace-nowrap">Đổi khuyến mãi, thưởng hoặc tên</span>;
};

const RecordDetail: React.FC<{ record: PriceImportRecord }> = ({ record }) => {
  const [tab, setTab] = useState<DetailTab>(record.added.length > 0 || record.updated.length === 0 ? 'added' : 'updated');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const rows = useMemo(
    () => (tab === 'added' ? record.added : record.updated).filter((item) => matches(item, q)),
    [record, tab, q],
  );
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1" role="group" aria-label="Chi tiết lần nhập">
          <Button
            variant={tab === 'added' ? 'tinted' : 'secondary'}
            size="sm"
            aria-pressed={tab === 'added'}
            onClick={() => setTab('added')}
          >
            Thêm mới ({vi(record.added.length)})
          </Button>
          <Button
            variant={tab === 'updated' ? 'tinted' : 'secondary'}
            size="sm"
            aria-pressed={tab === 'updated'}
            onClick={() => setTab('updated')}
          >
            Cập nhật giá ({vi(record.updated.length)})
          </Button>
        </div>
        <div className="flex-1 min-w-40">
          <Input
            dense
            type="search"
            aria-label="Lọc sản phẩm trong lần nhập"
            placeholder="Lọc theo mã hoặc tên..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          {q ? 'Không có sản phẩm khớp.' : tab === 'added' ? 'Lần nhập này không có sản phẩm mới.' : 'Lần nhập này không đổi giá sản phẩm nào.'}
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-control border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {shown.map((item) => (
                <tr key={item.msp} data-history-msp={item.msp}>
                  <td className="px-2 py-1.5 align-top">
                    <span className="font-mono text-[11px] font-bold text-sky-700 bg-sky-50 px-1 py-0.5 rounded">{item.msp}</span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-700 w-full">{item.sanPham}</td>
                  <td className="px-2 py-1.5 text-right align-top">
                    {tab === 'added'
                      ? <span className="font-bold text-rose-600 tabular-nums whitespace-nowrap">{item.giaGiam}</span>
                      : <PriceChangeText item={item as PriceChange} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown.length && (
        <p className="text-[11px] text-slate-500">Đang hiện {vi(shown.length)} / {vi(rows.length)} sản phẩm. Gõ mã hoặc tên để lọc.</p>
      )}
    </div>
  );
};

/** Lịch sử các lần nhập bảng giá và chi tiết sản phẩm được thêm mới, cập nhật giá ở mỗi lần. */
const PriceImportHistoryModal: React.FC<PriceImportHistoryModalProps> = ({ onClose }) => {
  const [history, setHistory] = useState<PriceImportRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    loadPriceImportHistory().then((records) => {
      setHistory(records);
      setOpenId(records[0]?.id ?? null);
    });
  }, []);

  const clearHistory = async () => {
    try {
      await savePriceImportHistory([]);
      setHistory([]);
      toast.success('Đã xoá lịch sử nhập. Bảng giá không đổi.');
    } catch (err) {
      console.error('Không xoá được lịch sử nhập:', err);
      toast.error('Không xoá được lịch sử nhập.');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Lịch sử nhập bảng giá"
      subTitle={`Giữ ${MAX_IMPORT_HISTORY} lần nhập gần nhất`}
      maxWidth="lg"
      controls={history && history.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => setIsConfirmOpen(true)} className="text-rose-600 hover:bg-rose-50">
          Xoá lịch sử
        </Button>
      ) : undefined}
    >
      <div className="space-y-2" data-testid="price-import-history">
        {history === null ? (
          <div className="flex justify-center items-center py-14">
            <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <EmptyState icon="history" title="Chưa có lần nhập nào" description='Mỗi lần nhập file ở ô "Bảng Giá" sẽ được ghi lại ở đây.' />
        ) : (
          history.map((record) => {
            const isOpen = openId === record.id;
            return (
              <div key={record.id} data-history-record="" className={`p-3 rounded-popup border transition-colors ${isOpen ? 'bg-white border-sky-300 shadow-2xs' : 'bg-slate-50 border-slate-200'}`}>
                <Button
                  variant="row"
                  size="none"
                  onClick={() => setOpenId(isOpen ? null : record.id)}
                  aria-expanded={isOpen}
                  className="w-full text-left flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <AppIcon name="history" size="xs" className="text-slate-400" />
                      <span>{new Date(record.importedAt).toLocaleString('vi-VN')}</span>
                      <span>· Bảng giá: {vi(record.totalAfter)} SP</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {record.files.map((file) => (
                        <span key={file.sourceId} className="inline-flex items-center gap-1 max-w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                          <AppIcon name="spreadsheet" size="xs" className="text-emerald-600 shrink-0" />
                          <span className="truncate">{file.fileName}</span>
                          <span className="font-normal text-slate-500 shrink-0">({vi(file.productCount)} SP)</span>
                        </span>
                      ))}
                      {record.failedFiles.map((name) => (
                        <span key={name} className="inline-flex items-center gap-1 max-w-full text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                          <span className="truncate">{name}</span>
                          <span className="font-normal shrink-0">(lỗi)</span>
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] font-semibold">
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">+{vi(record.added.length)} mới</span>
                      <span className="text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">{vi(record.updated.length)} cập nhật giá</span>
                      <span className="text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">{vi(record.unchanged)} không đổi</span>
                    </div>
                  </div>
                  <AppIcon name={isOpen ? 'chevronUp' : 'chevronDown'} size="sm" className="text-slate-400 mt-1 shrink-0" />
                </Button>
                {isOpen && <RecordDetail record={record} />}
              </div>
            );
          })
        )}
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={clearHistory}
        title="Xoá lịch sử nhập"
        message="Xoá toàn bộ lịch sử nhập bảng giá? Bảng giá và các file đã nhập vẫn giữ nguyên."
        confirmText="Xoá"
        type="danger"
      />
    </Modal>
  );
};

export default PriceImportHistoryModal;

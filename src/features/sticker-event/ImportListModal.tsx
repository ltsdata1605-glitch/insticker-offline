import React, { useMemo, useRef, useState } from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Banner } from '../../components/shared/ui/Banner';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';
import { toast } from '../../components/shared/ui/toast';
import type { Product } from './types';
import {
  downloadImportWorkbook,
  indexProducts,
  matchImportItems,
  parseImportText,
  readImportFile,
} from './services/productListImport';
import type { ImportEntry, ImportMode } from './services/productListImport';

interface ImportListModalProps {
  onClose: () => void;
  allProducts: Product[];
  currentCount: number;
  onImport: (entries: ImportEntry[], mode: ImportMode, notFound: string[]) => void;
}

const SAMPLE = '2714133000100\t1\n4844099000052\t2';

const ImportListModal: React.FC<ImportListModalProps> = ({ onClose, allProducts, currentCount, onImport }) => {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const productIndex = useMemo(() => indexProducts(allProducts), [allProducts]);
  const parsed = useMemo(() => parseImportText(text), [text]);
  const { entries, notFound } = useMemo(() => matchImportItems(parsed.items, productIndex), [parsed.items, productIndex]);
  const totalTags = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const hasContent = text.trim().length > 0;

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const content = await readImportFile(file);
      if (!content) {
        toast.error('File không có dòng dữ liệu nào.');
        return;
      }
      setText(content);
      setFileName(file.name);
    } catch (err) {
      console.error('Không đọc được file nhập:', err);
      toast.error('Không đọc được file. Hãy dùng file mẫu .xlsx.');
    }
  };

  const handleDownloadTemplate = () => {
    downloadImportWorkbook([]).catch((err) => {
      console.error('Không tạo được file mẫu:', err);
      toast.error('Không tạo được file mẫu.');
    });
  };

  const submit = (mode: ImportMode) => onImport(entries, mode, notFound);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Nhập danh sách sản phẩm"
      maxWidth="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Hủy</Button>
          {currentCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              disabled={entries.length === 0}
              onClick={() => submit('replace')}
              title={`Bỏ ${currentCount} sản phẩm đang có, chỉ giữ các sản phẩm vừa nhập`}
            >
              Thay danh sách
            </Button>
          )}
          <Button type="button" variant="primary" disabled={entries.length === 0} onClick={() => submit('add')}>
            Thêm vào danh sách
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="hidden"
            data-testid="import-file"
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} leftIcon={<AppIcon name="upload" size="sm" />}>
            Chọn file Excel
          </Button>
          <Button type="button" variant="ghost" onClick={handleDownloadTemplate} leftIcon={<AppIcon name="download" size="sm" />}>
            Tải file mẫu
          </Button>
          {fileName && <span className="text-xs text-slate-500 truncate max-w-56" title={fileName}>{fileName}</span>}
        </div>

        <div>
          <label htmlFor="import-text" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Hoặc dán từ Excel: mỗi dòng gồm mã sản phẩm và số lượng
          </label>
          <textarea
            id="import-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
            }}
            rows={9}
            spellCheck={false}
            placeholder={SAMPLE}
            autoFocus
            className="w-full rounded-control border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
          />
        </div>

        <div className="space-y-2" aria-live="polite" data-testid="import-summary">
          {!hasContent && (
            <p className="text-xs text-slate-500">
              Không ghi số lượng thì tính là 1. Mã trùng nhau sẽ được cộng số lượng.
            </p>
          )}
          {hasContent && allProducts.length === 0 && (
            <Banner tone="warning" maxLines={3}>Chưa có bảng giá nên chưa tìm được sản phẩm. Hãy nạp Bảng Giá trước.</Banner>
          )}
          {entries.length > 0 && (
            <Banner tone="success" maxLines={3}>
              Tìm thấy {entries.length} sản phẩm, tổng {totalTags} tem.
              {parsed.mergedLines > 0 && ` Đã gộp ${parsed.mergedLines} dòng trùng mã.`}
            </Banner>
          )}
          {notFound.length > 0 && allProducts.length > 0 && (
            <Banner tone="danger" maxLines={3}>Không tìm thấy {notFound.length} mã, sẽ bỏ qua: {notFound.join(', ')}</Banner>
          )}
          {parsed.problems.length > 0 && (
            <Banner tone="warning" maxLines={3}>
              {parsed.problems.length} dòng bị bỏ qua. {parsed.problems.map((p) => `Dòng ${p.line}: ${p.reason}.`).join(' ')}
            </Banner>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ImportListModal;

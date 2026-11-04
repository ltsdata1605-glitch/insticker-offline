import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PrintJobInfo, PrinterSummary } from '../../electron/contract';
import { Button } from '../components/shared/ui/Button';
import { Input } from '../components/shared/ui/Input';
import { Modal } from '../components/shared/ui/Modal';
import { Select } from '../components/shared/ui/Select';
import { toast } from '../components/shared/ui/toast';
import { subscribePrintPreview } from './printPreview';
import type { PrintPreviewRequest } from './printPreview';

const formatSeconds = (ms: number): string => `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây`;
const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Electron không cho biết máy in mặc định của hệ thống nên nhớ máy in đã dùng lần trước. */
const LAST_PRINTER_KEY = 'sticker_last_printer';
const readLastPrinter = (): string | null => {
  try {
    return localStorage.getItem(LAST_PRINTER_KEY);
  } catch {
    return null;
  }
};
const rememberPrinter = (name: string): void => {
  try {
    localStorage.setItem(LAST_PRINTER_KEY, name);
  } catch {
    // Không lưu được thì lần sau chọn lại máy in, không ảnh hưởng lượt in này.
  }
};

/** Màn xem trước bản in: thay cho hộp thoại Ctrl+P của Chrome trên bản web. */
export const PrintPreviewHost: React.FC = () => {
  const [request, setRequest] = useState<PrintPreviewRequest | null>(null);
  // Kết quả gắn với đúng yêu cầu đã tạo ra nó. Nếu chỉ lưu kết quả, lúc mở lại màn này sẽ có một khoảnh khắc còn
  // hiện bản in lần trước (đã đóng), bấm In ngay đúng lúc đó sẽ báo lỗi.
  const [result, setResult] = useState<{ request: PrintPreviewRequest; job?: PrintJobInfo; error?: string } | null>(null);
  const [printers, setPrinters] = useState<PrinterSummary[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const activeJobId = useRef<string | null>(null);

  useEffect(() => subscribePrintPreview(setRequest), []);

  const isCurrent = result !== null && result.request === request;
  const job = isCurrent ? result.job ?? null : null;
  const error = isCurrent ? result.error ?? null : null;

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setCopies(1);

    window.stickerDesktop.print.listPrinters().then((list) => {
      if (cancelled) return;
      setPrinters(list);
      const last = readLastPrinter();
      setDeviceName((list.find((p) => p.name === last) ?? list[0])?.name ?? '');
    }).catch(() => setPrinters([]));

    // Chờ một khung hình để màn "Đang dựng bản in" hiện lên trước khi làm việc nặng
    const build = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (cancelled) return;
      // Các mốc này để biết lượt in dừng ở bước nào khi bị kẹt
      performance.mark('in:sau-khung-hinh');
      const html = request.buildHtml();
      performance.mark('in:xong-html');
      const info = await window.stickerDesktop.print.createJob({ html, title: request.title, paper: request.paper });
      if (cancelled) {
        void window.stickerDesktop.print.closeJob(info.jobId);
        return;
      }
      activeJobId.current = info.jobId;
      setResult({ request, job: info });
    };
    build().catch((e) => {
      if (!cancelled) setResult({ request, error: toMessage(e) });
    });

    return () => {
      cancelled = true;
      if (activeJobId.current) {
        void window.stickerDesktop.print.closeJob(activeJobId.current);
        activeJobId.current = null;
      }
    };
  }, [request]);

  const close = useCallback(() => setRequest(null), []);

  const send = async (useSystemDialog: boolean) => {
    if (!job) return;
    setBusy('print');
    try {
      const result = await window.stickerDesktop.print.send({ jobId: job.jobId, deviceName: deviceName || undefined, copies, useSystemDialog });
      if (result.ok) {
        if (deviceName) rememberPrinter(deviceName);
        toast.success(`Đã gửi ${job.totalPages} trang tới máy in`);
        close();
      } else if (result.reason && !/cancel/i.test(result.reason)) {
        toast.error(`Không in được: ${result.reason}`);
      }
    } catch (e) {
      toast.error(`Không in được: ${toMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const savePdf = async () => {
    if (!job || !request) return;
    setBusy('pdf');
    try {
      const result = await window.stickerDesktop.print.savePdf({ jobId: job.jobId, suggestedName: `${request.title}.pdf` });
      if (result.saved) toast.success(`Đã lưu PDF${result.buildMs ? ` sau ${formatSeconds(result.buildMs)}` : ''}`);
      else if (result.error) toast.error(`Không lưu được PDF: ${result.error}`);
    } finally {
      setBusy(null);
    }
  };

  if (!request) return null;

  const isPartialPreview = job && job.previewPages < job.totalPages;

  return (
    <Modal isOpen onClose={close} title="Xem trước bản in" titleColorClass="text-slate-900" maxWidth="full" zIndex="z-[200]">
      <div className="flex gap-4 h-[calc(90dvh-120px)] min-h-[420px]" data-testid="print-preview">
        <div className="flex-1 min-w-0 rounded-control border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
          {job ? (
            <iframe key={job.jobId} src={`${job.previewUrl}#toolbar=0&navpanes=0`} title="Bản xem trước" className="w-full h-full border-0" />
          ) : error ? (
            <p className="p-6 text-sm text-rose-600" role="alert">Không dựng được bản in: {error}</p>
          ) : (
            <div className="flex flex-col items-center gap-3" role="status">
              <div className="w-8 h-8 border-[3px] border-sky-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Đang dựng bản in...</p>
            </div>
          )}
        </div>

        <aside className="w-[280px] shrink-0 flex flex-col gap-4">
          <div className="space-y-1.5">
            <label htmlFor="print-device" className="text-[12px] font-semibold text-slate-600">Máy in</label>
            {printers.length > 0 ? (
              <Select id="print-device" value={deviceName} onChange={(e) => setDeviceName(e.target.value)}>
                {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName}</option>)}
              </Select>
            ) : (
              <p className="text-xs text-slate-500">Không thấy máy in nào trên máy này. Bạn vẫn có thể lưu PDF.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="print-copies" className="text-[12px] font-semibold text-slate-600">Số bản</label>
            <Input id="print-copies" type="number" min="1" max="99" value={copies} onChange={(e) => setCopies(Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
          </div>

          {job && (
            <dl className="p-3 rounded-control bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1" data-testid="print-summary">
              <div className="flex justify-between gap-2"><dt>Khổ giấy</dt><dd className="font-semibold text-slate-800 text-right">{job.paperLabel}</dd></div>
              <div className="flex justify-between gap-2"><dt>Số trang</dt><dd className="font-semibold text-slate-800">{job.totalPages.toLocaleString('vi-VN')}</dd></div>
              <div className="flex justify-between gap-2"><dt>Lề và nền</dt><dd className="font-semibold text-slate-800">Không lề, có in nền</dd></div>
              {isPartialPreview && <p className="pt-1 text-slate-500">Khung bên trái chỉ hiện {job.previewPages} trang đầu cho nhanh. Bản in và PDF đủ {job.totalPages.toLocaleString('vi-VN')} trang.</p>}
            </dl>
          )}

          <div className="mt-auto space-y-2">
            <Button
              onClick={() => void send(false)}
              disabled={!job || !deviceName || busy !== null}
              className="w-full !bg-amber-400 hover:!bg-amber-500 !text-slate-950 font-bold border-transparent"
            >
              {busy === 'print' ? 'Đang gửi tới máy in...' : 'In ngay'}
            </Button>
            <Button variant="secondary" onClick={() => void send(true)} disabled={!job || busy !== null} className="w-full">
              Mở hộp thoại in của hệ thống
            </Button>
            <Button variant="secondary" onClick={() => void savePdf()} disabled={!job || busy !== null} className="w-full">
              {busy === 'pdf' ? 'Đang tạo PDF...' : 'Lưu PDF'}
            </Button>
          </div>
        </aside>
      </div>
    </Modal>
  );
};

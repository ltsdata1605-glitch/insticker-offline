import { BrowserWindow, app, dialog } from 'electron';
import type { Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  PrintJobInfo,
  PrintJobRequest,
  PrintPaper,
  PrintSendRequest,
  PrintSendResult,
  SavePdfRequest,
  SavePdfResult,
} from './contract';

/** Lô lớn hơn mức này chỉ dựng vài trang đầu để xem trước, bản in thật vẫn đủ trang. */
const PREVIEW_ALL_PAGES_UP_TO = 6;
const PREVIEW_PAGES_FOR_LARGE_JOB = 3;
/** Ảnh hoặc phông lỗi không được làm treo cả lượt in. */
const ASSET_WAIT_MS = 15_000;
/** Chừa thêm chút chiều cao để tem cuộn không bị đẩy phần cuối sang trang sau. */
const ROLL_HEIGHT_SLACK_MM = 1;
/** 1 milimét CSS = 96/25,4 pixel. */
const PX_PER_MM = 96 / 25.4;

// Tài liệu in chứa chữ lấy từ file Excel nên không cho chạy script nào trong đó.
// Lệnh chờ phông từ main process (executeJavaScript) không bị CSP này chặn.
const PRINT_DOC_CSP =
  "default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; base-uri 'none'; form-action 'none'";

// Chờ phông và ảnh nền xong rồi đếm trang. Ảnh nền CSS không nằm trong document.images nên phải nạp riêng.
const READY_SCRIPT = `(async () => {
  const wait = (async () => {
    void document.body.offsetHeight;
    await document.fonts.ready;
    const urls = new Set();
    for (const el of document.querySelectorAll('[style*="background-image"]')) {
      const m = el.style.backgroundImage.match(/url\\(["']?([^"')]+)/);
      if (m) urls.add(m[1]);
    }
    const first = document.querySelector('.sticker-container');
    if (first) {
      const m = getComputedStyle(first).backgroundImage.match(/url\\(["']?([^"')]+)/);
      if (m) urls.add(m[1]);
    }
    const imgs = [...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }));
    const bgs = [...urls].map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; }));
    await Promise.all([...imgs, ...bgs]);
    await document.fonts.ready;
  })();
  await Promise.race([wait, new Promise((r) => setTimeout(r, ${ASSET_WAIT_MS}))]);
  const tagPages = document.querySelectorAll('.print-page');
  const hostPages = document.querySelectorAll('#print-host > .sticker-container');
  const pages = tagPages.length || hostPages.length || 1;
  let maxHeightPx = 0;
  for (const el of tagPages) maxHeightPx = Math.max(maxHeightPx, el.getBoundingClientRect().height);
  return { pages, maxHeightPx };
})()`;

interface Job {
  id: string;
  title: string;
  html: string;
  paper: PrintPaper;
  win: BrowserWindow;
  rollHeightMm?: number;
  totalPages: number;
  previewPdf?: Buffer;
}

const paperLabel = (paper: PrintPaper, rollHeightMm?: number): string => {
  if (paper.kind === 'a4') return paper.landscape ? 'A4 ngang' : 'A4 dọc';
  return `Giấy cuộn ${paper.widthMm} mm × ${Math.round(rollHeightMm ?? 0)} mm mỗi tem`;
};

export class PrintJobs {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly origin: string,
    private readonly getOwner: () => BrowserWindow | null,
    private readonly getPrintSession: () => Session,
  ) {}

  /** Trả nội dung cho app://…/__print/<id>/<tệp>, null nếu không có. */
  respond(pathname: string): Response | null {
    const match = pathname.match(/^\/__print\/([0-9a-f-]+)\/(doc\.html|preview\.pdf)$/);
    if (!match) return null;
    const job = this.jobs.get(match[1]);
    // Đóng màn xem trước lúc trình xem PDF còn đang tải: khung đã bị gỡ nên không cần nội dung, cũng không phải lỗi.
    if (!job) return new Response(null, { status: 204 });
    if (match[2] === 'doc.html') {
      return new Response(job.html, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PRINT_DOC_CSP },
      });
    }
    if (!job.previewPdf) return null;
    return new Response(new Uint8Array(job.previewPdf), { headers: { 'content-type': 'application/pdf' } });
  }

  async create(request: PrintJobRequest): Promise<PrintJobInfo> {
    const startedAt = Date.now();
    this.closeAll();

    const id = randomUUID();
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        // Phiên riêng buộc cửa sổ in chạy ở tiến trình riêng. Nếu chung tiến trình với cửa sổ chính, dựng 1.000 trang
        // sẽ làm giao diện đơ (đo thấy trên máy Windows yếu). Phiên riêng cũng không đọc được dữ liệu của app.
        session: this.getPrintSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const job: Job = { id, title: request.title, html: request.html, paper: request.paper, win, totalPages: 1 };
    this.jobs.set(id, job);

    try {
      await win.loadURL(`${this.origin}/__print/${id}/doc.html`);
      const { pages, maxHeightPx } = await win.webContents.executeJavaScript(READY_SCRIPT) as { pages: number; maxHeightPx: number };
      job.totalPages = pages;

      if (request.paper.kind === 'roll') {
        job.rollHeightMm = Math.ceil(maxHeightPx / PX_PER_MM) + ROLL_HEIGHT_SLACK_MM;
        // Khai báo `size: 80mm auto` trong mẫu tem không hợp lệ nên trình duyệt bỏ qua; đặt khổ thật ở đây.
        // Phải thêm vào chính tài liệu: quy tắc @page chèn bằng webContents.insertCSS không có tác dụng khi in.
        const pageRule = `@page { size: ${request.paper.widthMm}mm ${job.rollHeightMm}mm; margin: 0; }`;
        await win.webContents.executeJavaScript(
          `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(pageRule)}; document.head.appendChild(s); })()`,
        );
      }

      const previewPages = pages > PREVIEW_ALL_PAGES_UP_TO ? PREVIEW_PAGES_FOR_LARGE_JOB : pages;
      job.previewPdf = await this.renderPdf(job, previewPages < pages ? `1-${previewPages}` : undefined);

      return {
        jobId: id,
        previewUrl: `${this.origin}/__print/${id}/preview.pdf`,
        totalPages: pages,
        previewPages,
        paperLabel: paperLabel(job.paper, job.rollHeightMm),
        buildMs: Date.now() - startedAt,
      };
    } catch (error) {
      this.close(id);
      throw error;
    }
  }

  send(request: PrintSendRequest): Promise<PrintSendResult> {
    const job = this.jobs.get(request.jobId);
    if (!job) return Promise.resolve({ ok: false, reason: 'Bản in đã đóng, hãy mở lại.' });

    const copies = Math.min(99, Math.max(1, Math.floor(request.copies) || 1));
    const silent = !request.useSystemDialog && Boolean(request.deviceName);
    const pageSize = job.paper.kind === 'a4'
      ? 'A4' as const
      : { width: job.paper.widthMm * 1000, height: (job.rollHeightMm ?? 297) * 1000 };

    return new Promise((resolve) => {
      job.win.webContents.print(
        {
          silent,
          deviceName: silent ? request.deviceName : undefined,
          copies,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize,
          landscape: job.paper.kind === 'a4' ? job.paper.landscape : false,
        },
        (ok, failureReason) => resolve({ ok, reason: ok ? undefined : failureReason }),
      );
    });
  }

  async savePdf(request: SavePdfRequest): Promise<SavePdfResult> {
    const job = this.jobs.get(request.jobId);
    if (!job) return { saved: false, error: 'Bản in đã đóng, hãy mở lại.' };

    const owner = this.getOwner();
    const options = {
      title: 'Lưu PDF',
      defaultPath: path.join(app.getPath('documents'), request.suggestedName.replace(/[/\\?%*:|"<>]/g, '-')),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const picked = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { saved: false };

    const startedAt = Date.now();
    try {
      await fs.writeFile(picked.filePath, await this.renderPdf(job));
      return { saved: true, path: picked.filePath, buildMs: Date.now() - startedAt };
    } catch (error) {
      return { saved: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  close(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.delete(jobId);
    if (!job.win.isDestroyed()) job.win.destroy();
  }

  closeAll(): void {
    for (const id of [...this.jobs.keys()]) this.close(id);
  }

  private renderPdf(job: Job, pageRanges?: string): Promise<Buffer> {
    return job.win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageRanges,
    });
  }
}

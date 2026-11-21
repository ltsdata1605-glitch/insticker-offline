import { exportElementAsImage } from '../../components/shared/export';
import { downloadBlobFile } from '../../components/shared/ui/imageDelivery';
import type { CodeItem, PageSettings } from './maCode';
import { QUIET, code128Bars, fileSlug, gridFor, itemProblem, pageCss, pageHtml, pagesOf, qrMatrix } from './maCode';

const FONT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
const PAD = 56;
const QR_SIZE = 760;
const BAR_WIDTH = 900;

/** Ngắt chữ theo bề rộng, tối đa `maxLines` dòng (dòng cuối thêm … nếu còn chữ) */
const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] => {
    const lines: string[] = [];
    let line = '';
    const push = (next: string) => {
        lines.push(next);
        line = '';
    };
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word;
        if (ctx.measureText(attempt).width <= maxWidth) {
            line = attempt;
            continue;
        }
        if (line) push(line);
        // Từ quá dài (đường link, mã liền): cắt theo ký tự
        let rest = word;
        while (ctx.measureText(rest).width > maxWidth) {
            let cut = rest.length - 1;
            while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut -= 1;
            push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
        line = rest;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}…`;
    while (last.length > 1 && ctx.measureText(last).width > maxWidth) last = `${last.slice(0, -2)}…`;
    kept[maxLines - 1] = last;
    return kept;
};

/** Ảnh PNG của một mã: tiêu đề, mã QR và/hoặc mã vạch, nội dung bên dưới */
export const codeImageBlob = async (item: Pick<CodeItem, 'title' | 'content'>, settings: Pick<PageSettings, 'kind' | 'showText'>): Promise<Blob> => {
    const content = item.content.trim();
    const problem = itemProblem(item, settings.kind);
    if (problem) throw new Error(problem);
    await Promise.all([document.fonts?.load(`700 56px ${FONT}`), document.fonts?.load(`400 38px ${FONT}`)]).catch(() => undefined);
    const qr = settings.kind !== 'barcode' ? qrMatrix(content) : null;
    const bars = settings.kind !== 'qr' ? code128Bars(content) : null;
    const unit = bars ? Math.max(2, Math.floor(BAR_WIDTH / (bars.modules + QUIET * 2))) : 0;
    const barWidth = bars ? unit * (bars.modules + QUIET * 2) : 0;
    const barHeight = settings.kind === 'both' ? 200 : 320;
    const qrCell = qr ? Math.floor(QR_SIZE / (qr.length + 8)) : 0;
    const qrWidth = qr ? qrCell * (qr.length + 8) : 0;
    const width = Math.max(860, qrWidth + PAD * 2, barWidth + PAD * 2);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `700 56px ${FONT}`;
    const titleLines = item.title.trim() ? wrapText(ctx, item.title.trim(), width - PAD * 2, 3) : [];
    ctx.font = `400 38px ${FONT}`;
    const textLines = settings.showText ? wrapText(ctx, content, width - PAD * 2, 4) : [];
    const gap = 28;
    const height = PAD
        + (titleLines.length ? titleLines.length * 66 + gap : 0)
        + (qr ? qrWidth + gap : 0)
        + (bars ? barHeight + gap : 0)
        + (textLines.length ? textLines.length * 46 : -gap)
        + PAD;

    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = PAD;
    if (titleLines.length) {
        ctx.font = `700 56px ${FONT}`;
        titleLines.forEach((line, i) => ctx.fillText(line, width / 2, y + i * 66));
        y += titleLines.length * 66 + gap;
    }
    if (qr) {
        const x0 = Math.round((width - qrWidth) / 2) + qrCell * 4;
        qr.forEach((row, r) => row.forEach((dark, c) => {
            if (dark) ctx.fillRect(x0 + c * qrCell, y + qrCell * 4 + r * qrCell, qrCell, qrCell);
        }));
        y += qrWidth + gap;
    }
    if (bars) {
        let x = Math.round((width - barWidth) / 2) + QUIET * unit;
        bars.widths.forEach((w, i) => {
            if (i % 2 === 0) ctx.fillRect(x, y, w * unit, barHeight);
            x += w * unit;
        });
        y += barHeight + gap;
    }
    if (textLines.length) {
        ctx.font = `400 38px ${FONT}`;
        ctx.fillStyle = '#111827';
        textLines.forEach((line, i) => ctx.fillText(line, width / 2, y + i * 46));
    }
    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Không dựng được ảnh'))), 'image/png'));
};

/**
 * Xuất ảnh từng mã (mỗi mã một ảnh, không lặp theo số bản). `items` là cả danh sách: tên file đánh số theo số dòng, dòng trống bỏ qua,
 * dòng lỗi đếm vào `skipped`.
 */
export const exportCodeImages = async (items: CodeItem[], settings: PageSettings): Promise<{ saved: number; skipped: number }> => {
    let saved = 0;
    let skipped = 0;
    for (const [index, item] of items.entries()) {
        if (!item.content.trim()) continue;
        if (itemProblem(item, settings.kind)) {
            skipped += 1;
            continue;
        }
        const blob = await codeImageBlob(item, settings);
        const name = fileSlug(item.title.trim() || item.content.trim());
        downloadBlobFile(blob, `${settings.kind === 'barcode' ? 'MaVach' : 'QR'}_${String(index + 1).padStart(2, '0')}_${name}.png`);
        saved += 1;
        // Nghỉ một chút để trình tải về không gộp mất tệp
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    return { saved, skipped };
};

/** Xuất ảnh từng trang A4 đúng như bản in */
export const exportPageImages = async (items: CodeItem[], settings: PageSettings): Promise<number> => {
    const grid = gridFor(settings.perPage, settings.landscape, settings.kind);
    const pages = pagesOf(items, settings.perPage);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    try {
        for (const [index, page] of pages.entries()) {
            host.innerHTML = `<div class="tm-anh"><style>${pageCss(settings, grid)}</style>${pageHtml(page, settings)}</div>`;
            const element = host.firstElementChild as HTMLElement;
            await exportElementAsImage(element, `Trang_ma_${index + 1}_cua_${pages.length}.png`, {
                preset: 'raw', footer: false, scale: 2.5, progressTitle: `Xuất ảnh trang ${index + 1}/${pages.length}`,
            });
        }
    } finally {
        host.remove();
    }
    return pages.length;
};

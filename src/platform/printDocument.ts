// Dựng tài liệu HTML đầy đủ để đưa sang cửa sổ in ẩn.

const BODY_CLASS = 'bg-slate-50 relative min-h-dvh antialiased text-slate-900';

const escapeTitle = (title: string): string =>
  title.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * Bản web in ngay trên trang app (`window.print()` với `#print-host`), nên bản in hưởng toàn bộ CSS của
 * app kể cả phông đang chọn. Chép đúng các style trong <head> sang tài liệu in để giữ nguyên kết quả đó.
 */
export const buildAppStyledDocument = (bodyHtml: string, title: string): string => {
  const styles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join('\n');
  return `<!DOCTYPE html><html lang="vi" class="light"><head><meta charset="UTF-8"><title>${escapeTitle(title)}</title>${styles}</head><body class="${BODY_CLASS}">${bodyHtml}</body></html>`;
};

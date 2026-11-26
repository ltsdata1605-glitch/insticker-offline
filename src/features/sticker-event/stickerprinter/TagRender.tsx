import React, { useEffect, useRef, useState } from 'react';
import { buildPriceTagPreview } from '../services/printService';
import type { PrintSettings, PriceTagPreview } from '../services/printService';
import type { Product } from '../types';

const PX_PER_MM = 96 / 25.4;
const CUSTOM_FONTS_ID = 'tag-preview-custom-fonts';
const GHOST_CLASS = 'tag-ghost';

/**
 * Phông tự tải lên (cài đặt tem) khai bằng @font-face trong CSS bản in. Chromium bỏ qua @font-face khai trong shadow DOM
 * nên chép các khai báo này ra trang chính. Phông có sẵn (Oswald, Roboto Condensed) trang chính đã nạp từ index.html.
 */
const shareFontFaces = (css: string): void => {
    const faces = css.match(/@font-face\s*{[^}]*}/g)?.join('\n') ?? '';
    let style = document.getElementById(CUSTOM_FONTS_ID);
    if (!style) {
        if (!faces) return;
        style = document.createElement('style');
        style.id = CUSTOM_FONTS_ID;
        document.head.appendChild(style);
    }
    if (style.textContent !== faces) style.textContent = faces;
};

/**
 * Tài liệu in chỉ nạp nét đậm (700) của Oswald và Roboto Condensed, nên chữ nét thường cũng in ra nét đậm. Trang app có đủ
 * các nét, nên khung xem trước dùng tên phông riêng chỉ trỏ tới nét đậm, lấy từ chính các khai báo phông của trang app.
 */
const PRINT_FONTS_ID = 'tag-preview-print-fonts';
const PRINT_FONT_ALIASES: Record<string, string> = { 'Oswald': 'Tem Oswald', 'Roboto Condensed': 'Tem Roboto Condensed' };

const sharePrintFonts = (): void => {
    if (document.getElementById(PRINT_FONTS_ID)) return;
    const faces: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const rule of Array.from(rules)) {
            if (!(rule instanceof CSSFontFaceRule)) continue;
            const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
            const weight = rule.style.getPropertyValue('font-weight').trim();
            if (!PRINT_FONT_ALIASES[family] || (weight !== '700' && weight !== 'bold')) continue;
            const range = rule.style.getPropertyValue('unicode-range');
            faces.push(`@font-face{font-family:'${PRINT_FONT_ALIASES[family]}';font-style:normal;font-weight:100 900;src:${rule.style.getPropertyValue('src')};${range ? `unicode-range:${range};` : ''}}`);
        }
    }
    // Trang app chưa nạp xong phông thì để lần vẽ sau làm lại
    if (faces.length === 0) return;
    const style = document.createElement('style');
    style.id = PRINT_FONTS_ID;
    style.textContent = faces.join('\n');
    document.head.appendChild(style);
};

const usePrintFonts = (css: string): string =>
    Object.entries(PRINT_FONT_ALIASES).reduce((out, [family, alias]) => out.split(`'${family}'`).join(`'${alias}', '${family}'`), css);

const ownText = (el: Element): string =>
    Array.from(el.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim();

/**
 * Làm mờ những phần của tem lấy từ nội dung mẫu. Dựng tem hai lần với hai bộ nội dung mẫu khác nhau: phần nào đổi theo
 * nội dung mẫu (chữ, ảnh QR, % giảm, tiền tiết kiệm) là phần chưa nhập. Hai tem khác cấu trúc thì làm mờ cả tem.
 */
const markGhostParts = (tag: string, alternative: string): string => {
    const a = document.createElement('template');
    const b = document.createElement('template');
    a.innerHTML = tag;
    b.innerHTML = alternative;
    const left = Array.from(a.content.querySelectorAll('*'));
    const right = Array.from(b.content.querySelectorAll('*'));
    if (left.length !== right.length || left.some((el, i) => el.tagName !== right[i].tagName)) {
        left[0]?.classList.add(GHOST_CLASS);
        return a.innerHTML;
    }
    left.forEach((el, i) => {
        const differs = el.tagName === 'IMG'
            ? el.getAttribute('src') !== right[i].getAttribute('src')
            : ownText(el) !== ownText(right[i]);
        if (differs) el.classList.add(GHOST_CLASS);
    });
    return a.innerHTML;
};

interface TagRenderProps {
    products: Product[];
    settings: PrintSettings;
    employeeName: string;
    /**
     * Khung xương mờ: `products` đã điền nội dung mẫu vào các ô còn trống, mảng này điền nội dung mẫu khác. Phần nào
     * khác nhau giữa hai bản là phần chưa nhập và được làm mờ.
     */
    ghostAlternative?: Product[];
    /** Chiều rộng hiển thị một tem (px). Không có thì lấy theo chiều rộng khung chứa. */
    width?: number;
    /**
     * 'width': tem rộng bằng khung, cao theo tỉ lệ (mặc định). 'contain': tem thu nhỏ để nằm gọn trong khung cả chiều rộng
     * lẫn chiều cao, dùng khi khung có chiều cao cố định và không được cuộn.
     */
    fit?: 'width' | 'contain';
    className?: string;
}

/**
 * Hiện tem đúng như bản in (cùng HTML và CSS), thu nhỏ theo chiều rộng khung. CSS bản in đặt trong shadow DOM để không
 * lẫn với giao diện app.
 */
export const TagRender: React.FC<TagRenderProps> = ({ products, settings, employeeName, ghostAlternative, width, fit = 'width', className }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const [preview, setPreview] = useState<PriceTagPreview | null>(null);
    const [box, setBox] = useState({ width: 0, height: 0 });

    useEffect(() => {
        let active = true;
        Promise.all([
            buildPriceTagPreview(products, employeeName, settings),
            ghostAlternative ? buildPriceTagPreview(ghostAlternative, employeeName, settings) : null,
        ])
            .then(([next, alternative]) => {
                if (!active) return;
                setPreview(alternative
                    ? { ...next, tags: next.tags.map((tag, i) => markGhostParts(tag, alternative.tags[i] ?? '')) }
                    : next);
            })
            .catch((err) => console.error('Không dựng được tem xem trước:', err));
        return () => { active = false; };
    }, [products, employeeName, settings, ghostAlternative]);

    useEffect(() => {
        if (width !== undefined) return;
        const host = hostRef.current;
        if (!host) return;
        const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(host);
        return () => observer.disconnect();
    }, [width]);

    const shownWidth = width ?? box.width;
    const boxHeight = fit === 'contain' ? box.height : 0;

    useEffect(() => {
        const host = hostRef.current;
        if (!host || !preview || shownWidth <= 0) return;
        shareFontFaces(preview.css);
        sharePrintFonts();
        const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        const widthZoom = shownWidth / (preview.widthMm * PX_PER_MM);
        // Tài liệu in không có CSS của app. Chặn mọi thuộc tính kế thừa từ app (phông, giãn dòng, màu chữ) rồi đặt lại
        // đúng như thẻ body của tài liệu in, nếu không chữ to và rộng hơn bản in, tràn ra ngoài tem.
        root.innerHTML = `<style>${usePrintFonts(preview.css)}
            :host { all: initial; display: block; }
            .tag-preview-stack {
                display: flex; flex-direction: column; gap: 16px; width: max-content; margin-inline: auto;
                font-family: 'Tem Roboto Condensed', 'Roboto Condensed', sans-serif; color: #000; background-color: #fff;
                -webkit-print-color-adjust: exact;
            }
            .tag-preview-stack .price-tag { background: #fff; }
            /* Đường cắt nét đứt chỉ cần trên giấy (giữa các tem); xem trước một tem thì trông như viền thừa */
            .tag-preview-stack .price-tag::after { display: none; }
            .${GHOST_CLASS} { opacity: 0.22; }
        </style><div class="tag-preview-stack ${preview.sizeClass}">${preview.tags.join('')}</div>`;
        const stack = root.querySelector<HTMLElement>('.tag-preview-stack');
        if (!stack) return;
        let zoom = widthZoom;
        if (boxHeight > 0) {
            // Đo chiều cao thật của tem ở cỡ gốc rồi thu nhỏ thêm nếu khung thấp hơn. Bỏ qua chênh lệch dưới 1px do làm tròn
            // để khung cao theo nội dung (màn hẹp) không bị thu nhỏ dần qua mỗi lần đo. Trước đây bỏ qua tới 2% nên tem to
            // có thể bị khung cắt mất viền dưới (tem cao 452px trong khung 445px).
            stack.style.zoom = '1';
            const naturalHeight = stack.getBoundingClientRect().height;
            if (naturalHeight > 0 && naturalHeight * widthZoom > boxHeight + 1) zoom = boxHeight / naturalHeight;
        }
        stack.style.zoom = String(zoom);
    }, [preview, shownWidth, boxHeight]);

    return <div ref={hostRef} className={className} data-testid="tag-render" />;
};

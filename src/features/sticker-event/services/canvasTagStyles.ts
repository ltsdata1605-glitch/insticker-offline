/**
 * Hai kiểu tem Giá to và Phiếu giảm giá, vẽ trên khung cố định 800 x 540 rồi thu phóng cho vừa tem như kiểu hiện đại, nên cùng
 * một bố cục dùng được cho 1 đến 24 tem mỗi trang và máy in bill.
 *
 * In trắng đen nên không dùng nền đen hay mảng tô lớn (tốn mực): chỉ chữ đen, đường viền và nét gạch trên nền trắng.
 */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 540;

export type CanvasTagStyle = 'big' | 'coupon';

export interface CanvasTagData {
    /** Tên sản phẩm, đã escape. */
    name: string;
    /** Dòng khuyến mãi đã escape, rỗng nếu không in. */
    promotion: string;
    /** Giá gốc; 0 khi không có hoặc không cao hơn giá mới (không in giá gốc). */
    originalPrice: number;
    finalPrice: number;
    discountPercent: number;
    /** Tên người in (và thưởng nếu bật), đã escape. */
    employeeInfo: string;
    timestamp: string;
    qrCodeUrl: string;
    /** Tỉ lệ thu phóng khung 800 x 540 cho vừa tem. */
    scale: number;
    /** Máy in bill: tem cao theo nội dung, phải đặt chiều cao bằng khung đã thu nhỏ. */
    isBill: boolean;
}

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

/** "3.490.000" thành "3.490" và ".000đ" để phần nghìn đồng in nhỏ. */
const splitPrice = (value: number): { big: string; small: string } => {
    const text = money(value);
    const lastDot = text.lastIndexOf('.');
    return lastDot === -1 ? { big: text, small: 'đ' } : { big: text.slice(0, lastDot), small: `${text.slice(lastDot)}đ` };
};

/** Bề rộng ước tính theo em của chữ số đậm (phông hẹp Oswald): đủ để chọn cỡ chữ không tràn. */
const widthEm = (text: string): number =>
    Array.from(text).reduce((sum, ch) => sum + (/\d/.test(ch) ? 0.56 : ch === '.' || ch === ',' ? 0.26 : ch === '%' ? 0.8 : 0.6), 0);

const fitPx = (text: string, widthPx: number, maxPx: number, minPx = 12): number =>
    Math.max(minPx, Math.min(maxPx, Math.floor((widthPx / Math.max(widthEm(text), 0.1)) * 0.94)));

/** Cỡ giá mới: phần nghìn nhỏ bằng `smallRatio` phần chính, cả hai vừa bề rộng cho trước. */
const fitPricePx = (big: string, small: string, widthPx: number, maxPx: number, smallRatio: number): number =>
    Math.max(24, Math.min(maxPx, Math.floor((widthPx / (widthEm(big) + widthEm(small) * smallRatio + 0.1)) * 0.94)));

/** Cỡ chữ cho đoạn chữ in hoa đậm tối đa 2 dòng, giãn dòng 1,2, trong khung rộng x cao cho trước. */
const twoLinePx = (text: string, widthPx: number, heightPx: number, maxPx: number, minPx = 18): number => {
    const length = Math.max(text.length, 1);
    const byWidth = Math.floor((widthPx * 2) / (length * 0.56));
    return Math.max(minPx, Math.min(maxPx, byWidth, Math.floor(heightPx / 2.45)));
};

const priceHtml = (value: number, bigPx: number, smallRatio: number): string => {
    const { big, small } = splitPrice(value);
    return `<span class="ct-price">`
        + `<span class="ct-price-big modern-primary-font" style="font-size:${bigPx}px">${big}</span>`
        + `<span class="ct-price-small modern-primary-font" style="font-size:${Math.round(bigPx * smallRatio)}px">${small}</span>`
        + `</span>`;
};

/** Giá gốc gạch ngang. */
const oldPriceHtml = (value: number, widthPx: number, maxPx: number): string =>
    `<span class="ct-old modern-primary-font" style="font-size:${fitPx(`${money(value)}đ`, widthPx, maxPx)}px">${money(value)}đ</span>`;

const promoHtml = (promotion: string, widthPx: number, heightPx: number, maxPx: number): string =>
    `<p class="ct-promo modern-primary-font" style="font-size:${twoLinePx(promotion, widthPx, heightPx, maxPx, 14)}px">${promotion}</p>`;

const nameHtml = (name: string, widthPx: number, heightPx: number, maxPx: number): string =>
    `<h1 class="ct-name" style="font-size:${twoLinePx(name, widthPx, heightPx, maxPx)}px">${name}</h1>`;

const infoBlock = (data: CanvasTagData): string => `
    <div class="ct-info">
        ${data.qrCodeUrl ? `<img alt="QR" class="ct-qr" src="${data.qrCodeUrl}"/>` : ''}
        ${data.employeeInfo ? `<p class="ct-meta">${data.employeeInfo}</p>` : ''}
        <p class="ct-meta ct-time">${data.timestamp}</p>
    </div>`;

const wrap = (style: CanvasTagStyle, data: CanvasTagData, inner: string): string => {
    const height = data.isBill ? ` style="height:${Math.ceil(CANVAS_HEIGHT * data.scale) + 8}px;min-height:0"` : '';
    return `
    <div class="price-tag canvas-tag style-${style}"${height}>
        <div class="ct-wrapper" style="width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;transform:scale(${data.scale});">
            ${inner}
        </div>
    </div>`;
};

const percentBadge = (data: CanvasTagData, widthPx: number, maxPx: number, fallback: string): string => data.discountPercent > 0
    ? `<span class="ct-badge-label">GIẢM</span><span class="ct-badge-value modern-primary-font" style="font-size:${fitPx(`${data.discountPercent}%`, widthPx, maxPx)}px">${data.discountPercent}%</span>`
    : `<span class="ct-badge-value modern-primary-font" style="font-size:${Math.round(maxPx * 0.62)}px">${fallback}</span>`;

/** Giá to: giá mới chiếm gần hết tem, tên và giá gốc gọn ở hàng trên. */
const bigTag = (data: CanvasTagData): string => {
    const hasOriginal = data.originalPrice > 0;
    const { big, small } = splitPrice(data.finalPrice);
    return wrap('big', data, `
        <div class="ct-tag ctg">
            <div class="ctg-top">
                <div class="ct-center ct-left ctg-name">${nameHtml(data.name, hasOriginal ? 470 : 720, 88, 40)}</div>
                ${hasOriginal ? `
                <div class="ct-stack ct-stack-center ctg-old">
                    ${oldPriceHtml(data.originalPrice, 220, 44)}
                    ${data.discountPercent > 0 ? `<span class="ct-pill ct-pill-sm modern-primary-font">GIẢM ${data.discountPercent}%</span>` : ''}
                </div>` : ''}
            </div>
            <div class="ct-center ctg-price">${priceHtml(data.finalPrice, fitPricePx(big, small, 740, 300, 0.3), 0.3)}</div>
            <div class="ct-foot ctg-foot">${promoHtml(data.promotion, 620, 70, 30)}${infoBlock(data)}</div>
        </div>`);
};

/** Phiếu giảm giá: viền nét đứt có kéo cắt, cuống phiếu ghi % giảm, thân phiếu ghi tên và giá. */
const couponTag = (data: CanvasTagData): string => {
    const hasOriginal = data.originalPrice > 0;
    const { big, small } = splitPrice(data.finalPrice);
    return wrap('coupon', data, `
        <div class="ct-tag ctp">
            <span class="ctp-scissors" aria-hidden="true">✂</span>
            <div class="ctp-stub">
                ${percentBadge(data, 150, 96, 'GIÁ<br/>TỐT')}
                ${hasOriginal ? `<span class="ct-label ctp-stub-label">GIÁ GỐC</span>${oldPriceHtml(data.originalPrice, 160, 34)}` : `<span class="ct-label ctp-stub-label">HÔM NAY</span>`}
            </div>
            <div class="ctp-main">
                <div class="ct-center ct-left ctp-name">${nameHtml(data.name, 520, 104, 44)}</div>
                <div class="ct-stack ctp-price"><span class="ct-label">GIÁ ƯU ĐÃI</span>${priceHtml(data.finalPrice, fitPricePx(big, small, 520, 196, 0.32), 0.32)}</div>
                <div class="ct-foot ctp-foot">${promoHtml(data.promotion, 400, 70, 28)}${infoBlock(data)}</div>
            </div>
        </div>`);
};

const GENERATORS: Record<CanvasTagStyle, (data: CanvasTagData) => string> = {
    big: bigTag,
    coupon: couponTag,
};

export const isCanvasTagStyle = (style: string): style is CanvasTagStyle => style in GENERATORS;

export const generateCanvasTagHTML = (style: CanvasTagStyle, data: CanvasTagData): string => GENERATORS[style](data);

/** CSS của các kiểu, gộp vào CSS bản in. Không có nền đen hay mảng tô lớn. */
export const canvasTagCss = (): string => `
    .price-tag.canvas-tag {
        border: 1px dashed #d1d5db;
        padding: 0;
        display: flex !important;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .ct-wrapper { flex-shrink: 0; transform-origin: center center; color: #000; }
    .ct-wrapper * { box-sizing: border-box; margin: 0; }
    .ct-tag { width: 800px; height: 540px; background: #fff; display: flex; flex-direction: column; position: relative; }
    .ct-center { display: flex; align-items: center; justify-content: center; min-width: 0; }
    .ct-left { justify-content: flex-start; }
    .ct-stack { display: flex; flex-direction: column; justify-content: center; line-height: 1; gap: 4px; }
    .ct-stack-center { align-items: center; }
    .ct-name { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 900; text-transform: uppercase; line-height: 1.2; text-align: center; }
    .ct-left .ct-name { text-align: left; }
    .ct-label { font-size: 22px; font-weight: 900; letter-spacing: 0.08em; line-height: 1.15; }
    .ct-label-wide { width: 100%; text-align: center; font-size: 36px; }
    .ct-old { font-weight: 700; line-height: 1.05; text-decoration: line-through; text-decoration-thickness: 0.09em; text-decoration-color: #000; white-space: nowrap; }
    .ct-pill { border: 5px solid #000; border-radius: 999px; padding: 4px 20px; font-size: 52px; font-weight: 900; line-height: 1; white-space: nowrap; }
    .ct-pill-sm { border-width: 4px; padding: 2px 14px; font-size: 30px; }
    .ct-price { display: inline-flex; align-items: baseline; gap: 8px; white-space: nowrap; }
    .ct-price-big { font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
    .ct-price-small { font-weight: 900; line-height: 1; }
    .ct-promo { flex: 1; min-width: 0; padding: 0 16px; font-weight: 700; text-transform: uppercase; line-height: 1.25; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .ct-foot { display: flex; align-items: center; flex-shrink: 0; }
    .ct-info { width: 112px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 3px; overflow: hidden; flex-shrink: 0; }
    .ct-qr { width: 50px; height: 50px; object-fit: contain; display: block; flex-shrink: 0; }
    .ct-meta { font-size: 11px; line-height: 1.15; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; font-weight: 700; }
    .ct-time { font-weight: 400; opacity: 0.75; }
    .ct-badge-label { font-size: 30px; font-weight: 900; letter-spacing: 0.12em; line-height: 1; }
    .ct-badge-value { font-weight: 900; line-height: 0.95; text-align: center; }

    /* Giá to */
    .ctg { border: 4px solid #000; }
    .ctg-top { height: 100px; display: flex; border-bottom: 3px solid #000; flex-shrink: 0; }
    .ctg-name { flex: 1; padding: 0 22px; }
    .ctg-old { width: 270px; border-left: 3px solid #000; gap: 6px; }
    .ctg-price { flex: 1; min-height: 0; overflow: hidden; }
    .ctg-foot { height: 76px; border-top: 3px solid #000; }
    .ctg-foot .ct-info { border-left: 3px solid #000; }
    .ctg-foot .ct-qr { width: 44px; height: 44px; }

    /* Phiếu giảm giá */
    .ctp { border: 5px dashed #000; border-radius: 26px; flex-direction: row; }
    .ctp-scissors { position: absolute; top: -20px; left: 46px; font-size: 32px; line-height: 1; background: #fff; padding: 0 6px; }
    .ctp-stub { width: 210px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border-right: 4px dashed #000; position: relative; padding: 0 12px; }
    .ctp-stub::before, .ctp-stub::after { content: ''; position: absolute; right: -19px; width: 34px; height: 34px; border: 4px solid #000; border-radius: 999px; background: #fff; }
    .ctp-stub::before { top: -18px; }
    .ctp-stub::after { bottom: -18px; }
    .ctp-stub-label { margin-top: 10px; font-size: 20px; }
    .ctp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 14px 18px 4px 30px; }
    .ctp-name { height: 108px; flex-shrink: 0; }
    .ctp-price { flex: 1; min-height: 0; overflow: hidden; gap: 2px; }
    .ctp-foot { height: 82px; border-top: 3px dashed #000; margin-right: -18px; }
    .ctp-foot .ct-promo { padding-left: 0; text-align: left; }

`;

import type { Product } from '../types';
import type { StickerPage } from './types';
import { resolvePagePrices } from './pageHtmlUtils';
import { formatCurrency, normalizeStickerPriceUnit, normalizeTagQuantity } from '../utils/format';

const digitsOf = (value: string | undefined): number => Number(String(value ?? '').replace(/\D/g, '')) || 0;

/**
 * Tab Sticker soạn sticker như tab Giá Sốc nhưng in ra tem giá của tab Event (kiểu có sẵn hoặc hiện đại, 1 đến 24 tem
 * mỗi trang). Đổi một sticker sang sản phẩm của mẫu tem: tên, giá cũ thành giá gốc, giá mới thành giá bán, chân sticker
 * thành dòng khuyến mãi, mã vạch thành mã QR.
 *
 * Giá mới trên sticker Giá Sốc ghi theo nghìn đồng (sticker in thêm ".000"). Quy đổi bằng đúng công thức tính % giảm
 * trên sticker để tem và sticker khớp nhau. Không có giá cũ thì coi giá mới là nghìn đồng, trừ khi đã gõ đủ số (từ 100.000
 * trở lên, như khi mở lại app). Không có giá mới thì tem in giá cũ làm giá bán và không gạch giá gốc.
 */
export const stickerPageToTagProduct = (page: StickerPage, priceSource: 'sale' | 'service'): Product => {
    const { newPrice } = resolvePagePrices(page, priceSource);
    const oldValue = digitsOf(page.oldPrice);
    const newDigits = digitsOf(newPrice);
    const newValue = newDigits === 0 ? 0
        : oldValue > 0 ? normalizeStickerPriceUnit(oldValue, newDigits)
        : newDigits >= 100000 ? newDigits : newDigits * 1000;
    const finalValue = newValue || oldValue;
    return {
        msp: (page.code ?? '').trim(),
        sanPham: (page.label ?? '').trim(),
        giaGoc: oldValue > 0 ? formatCurrency(oldValue) : '',
        giaGiam: formatCurrency(finalValue),
        khuyenMai: (page.footer ?? '').trim(),
        thuongERP: 0,
        thuongNong: 0,
        tongThuong: 0,
        ngayIn: '',
        selected: true,
        quantity: normalizeTagQuantity(page.quantity ?? 1),
    };
};

type GhostFields = Pick<StickerPage, 'label' | 'oldPrice' | 'newPrice' | 'footer' | 'code'>;

/** Nội dung mẫu cho khung xương mờ của sticker đang soạn. Hai bộ khác nhau ở mọi ô để biết phần nào là mẫu. */
const GHOST_SAMPLE: GhostFields = { label: 'Tên sản phẩm', oldPrice: '5.490.000', newPrice: '3.490', footer: 'Nội dung khuyến mãi', code: 'MA-SAN-PHAM' };
const GHOST_ALTERNATIVE: GhostFields = { label: 'Sản phẩm mẫu', oldPrice: '6.990.000', newPrice: '4.290', footer: 'Khuyến mãi mẫu', code: 'MA-KHAC' };

const isBlank = (value: string | undefined) => !(value ?? '').trim();
const hasNoDigits = (value: string | undefined) => !/\d/.test(value ?? '');

const fillBlankFields = (page: StickerPage, sample: GhostFields): StickerPage => ({
    ...page,
    label: isBlank(page.label) ? sample.label : page.label,
    oldPrice: hasNoDigits(page.oldPrice) ? sample.oldPrice : page.oldPrice,
    newPrice: hasNoDigits(page.newPrice) ? sample.newPrice : page.newPrice,
    salePrice: hasNoDigits(page.newPrice) ? undefined : page.salePrice,
    footer: isBlank(page.footer) ? sample.footer : page.footer,
    code: isBlank(page.code) ? sample.code : page.code,
});

/**
 * Sticker đang soạn còn ô trống thì khung xem trước hiện khung xương mờ: ô trống lấy nội dung mẫu và được làm mờ, để vẫn
 * thấy bố cục tem. Trả về tem điền mẫu và tem điền mẫu khác (dùng để biết phần nào là mẫu); không còn ô trống thì null.
 */
export const ghostTagPreview = (page: StickerPage, priceSource: 'sale' | 'service'): { product: Product; alternative: Product } | null => {
    const blank = isBlank(page.label) || hasNoDigits(page.oldPrice) || hasNoDigits(page.newPrice) || isBlank(page.footer) || isBlank(page.code);
    if (!blank) return null;
    return {
        product: stickerPageToTagProduct(fillBlankFields(page, GHOST_SAMPLE), priceSource),
        alternative: stickerPageToTagProduct(fillBlankFields(page, GHOST_ALTERNATIVE), priceSource),
    };
};

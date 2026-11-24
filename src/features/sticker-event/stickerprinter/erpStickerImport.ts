import type { Product } from '../types';
import type { StickerPage } from './types';
import { formatPriceChangePercent } from '../utils/format';

const digitsOf = (value: string | undefined): number => Number(String(value ?? '').replace(/\D/g, '')) || 0;

/**
 * Giá của một dòng bảng giá ERP thành giá trên sticker. Giá mới ghi theo nghìn đồng như sticker Giá Sốc. Giá cũ chỉ ghi khi
 * cao hơn giá bán, như tem tab Event chỉ gạch giá gốc khi có giảm.
 *
 * Riêng giá từ 100 triệu không giảm: giá mới từ 100.000 nghìn trở lên mà không có giá cũ sẽ bị hiểu là đã gõ đủ số đồng
 * (xem stickerPageToTagProduct), nên ghi giá cũ bằng đúng giá bán. Hai giá bằng nhau thì tem không gạch giá cũ.
 */
export const erpStickerPrices = (product: Pick<Product, 'giaGoc' | 'giaGiam'>): { oldPrice: string; newPrice: string; percent: string } => {
    const goc = digitsOf(product.giaGoc);
    const sale = digitsOf(product.giaGiam) || goc;
    const thousands = Math.round(sale / 1000);
    const newPrice = thousands > 0 ? thousands.toLocaleString('vi-VN') : '';
    const old = goc > sale ? goc : thousands >= 100000 ? thousands * 1000 : 0;
    const oldPrice = old > 0 ? old.toLocaleString('vi-VN') : '';
    return { oldPrice, newPrice, percent: formatPriceChangePercent(oldPrice, newPrice) };
};

/** Phần nội dung của sticker lấy từ bảng giá. Cập nhật sticker đã có thì chỉ đổi các phần này. */
const contentOf = (product: Product): Pick<StickerPage, 'label' | 'code' | 'oldPrice' | 'newPrice' | 'salePrice' | 'servicePrice' | 'percent' | 'footer'> => {
    const { oldPrice, newPrice, percent } = erpStickerPrices(product);
    const code = product.msp.trim();
    return {
        label: product.sanPham.trim() || code,
        code,
        oldPrice,
        newPrice,
        salePrice: newPrice,
        // Bảng giá không có giá dịch vụ: bỏ giá dịch vụ cũ để sticker in đúng giá vừa nhập
        servicePrice: undefined,
        percent,
        footer: (product.khuyenMai ?? '').trim(),
    };
};

interface MergeContext {
    /** Tiêu đề, dòng phụ của sticker mới, như khi bấm Thêm */
    header: string;
    subHeader: string;
    /** Ngưỡng % giảm để chọn sẵn sticker, như khi nhập file mẫu. Trống là chọn hết. */
    discountThreshold: string;
    now?: number;
}

export interface ErpStickerMerge {
    pages: StickerPage[];
    /** Sticker mới tạo, theo thứ tự trong file */
    added: StickerPage[];
    /** Số sticker đã có cùng mã, được cập nhật tên, giá, khuyến mãi (giữ số bản in) */
    updated: number;
}

const isSelectedBy = (threshold: string, percent: string): boolean => {
    const limit = parseInt(threshold.replace(/\D/g, ''), 10);
    if (isNaN(limit)) return true;
    const value = parseInt(percent.replace(/\D/g, ''), 10);
    return (isNaN(value) ? 0 : value) >= limit;
};

/**
 * Tab Sticker nhập bảng giá ERP (file của tab Event): mỗi sản phẩm thành một sticker, không phải tìm từng mã như tab Event.
 * Mã đã có sticker trong danh sách thì cập nhật sticker đó (như tab Event cập nhật giá sản phẩm đang có trong danh sách in),
 * giữ số bản in và lựa chọn. Mã trùng trong file thì lấy dòng sau cùng.
 */
export const mergeErpProductsIntoPages = (existing: StickerPage[], products: Product[], context: MergeContext): ErpStickerMerge => {
    const latest = new Map<string, Product>();
    for (const product of products) {
        const code = product.msp.trim();
        if (code) latest.set(code, product);
    }
    const byCode = new Map<string, number>();
    existing.forEach((page, index) => {
        const code = (page.code ?? '').trim();
        if (code && !byCode.has(code)) byCode.set(code, index);
    });

    const now = context.now ?? Date.now();
    const pages = [...existing];
    const added: StickerPage[] = [];
    let updated = 0;
    let order = 0;
    for (const [code, product] of latest) {
        const content = contentOf(product);
        const index = byCode.get(code);
        if (index !== undefined) {
            pages[index] = { ...pages[index], ...content };
            updated += 1;
            continue;
        }
        const page: StickerPage = {
            id: `erp_${now}_${order++}_${Math.random().toString(36).slice(2, 6)}`,
            html: '',
            timestamp: now,
            header: context.header,
            subHeader: context.subHeader,
            selected: isSelectedBy(context.discountThreshold, content.percent),
            quantity: 1,
            ...content,
        };
        added.push(page);
        pages.push(page);
    }
    return { pages, added, updated };
};

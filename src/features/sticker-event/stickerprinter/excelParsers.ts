import { generateBarcodeDataUrl } from './BarcodeCanvas';
import { StickerPage } from './types';
import { formatPriceChangePercent, normalizeStickerPriceUnit, normalizeTagQuantity } from '../utils/format';

export const parsePercentValue = (percentStr: string | undefined): number => {
    if (!percentStr) return 0;
    const clean = percentStr.replace(/[^0-9]/g, '');
    const val = parseInt(clean, 10);
    return isNaN(val) ? 0 : val;
};

export async function downloadStickerTemplate(stickerType: 'gia_soc' | 'gio_vang' | 'draw'): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    let header: string[];
    let sampleData: string[][];
    let filename: string;
    let cols: { wch: number }[];

    if (stickerType === 'gia_soc') {
        header = ['TIÊU ĐỀ', 'CODE', 'TÊN SẢN PHẨM', 'GIÁ GỐC', 'GIÁ GIẢM', 'KHUYẾN MÃI', 'SỐ BẢN IN'];
        sampleData = [
            ['QUẠT ĐIỀU HOÀ', 'ABC123', 'Quạt điều hoà Daikiosan DMI03', '5490000', '3490000', 'Khuyến mãi áp dụng đến hết ngày 3/5/2026', '1'],
            ['TỦ LẠNH', 'DEF456', 'Tủ lạnh Samsung RT29K5012S8', '8990000', '6990000', 'Khuyến mãi áp dụng đến hết ngày 3/5/2026', '2'],
        ];
        filename = 'Sticker_Template_Gia_Soc.xlsx';
        cols = [
            { wch: 20 }, { wch: 15 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 45 }, { wch: 12 }
        ];
    } else {
        const today = new Date();
        const currentDay = today.getDay();
        const dayOfWeek = currentDay === 0 ? 7 : currentDay;
        const friday = new Date(today);
        friday.setDate(today.getDate() + (5 - dayOfWeek));
        const sunday = new Date(today);
        sunday.setDate(today.getDate() + (7 - dayOfWeek));
        const pad = (n: number) => String(n).padStart(2, '0');
        const fridayStr = `${pad(friday.getDate())}/${pad(friday.getMonth() + 1)}`;
        const sundayStr = `${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}`;
        const timeRangeStr = `TỪ ${fridayStr} ĐẾN ${sundayStr}`;

        header = ['CODE', 'SẢN PHẨM', 'GIÁ NIÊM YẾT', 'GIÁ GIẢM', 'THỜI GIAN ÁP DỤNG', 'SỐ LƯỢNG SUẤT', 'SỐ BẢN IN'];
        sampleData = [
            ['ABC123', 'Quạt điều hoà Daikiosan DMI03', '5490000', '3490000', timeRangeStr, '5 SUẤT/NGÀY', '1'],
            ['DEF456', 'Tủ lạnh Samsung RT29K5012S8', '8990000', '6990000', timeRangeStr, '5 SUẤT/NGÀY', '2'],
        ];
        filename = 'Sticker_Template_Gio_Vang.xlsx';
        cols = [
            { wch: 15 }, { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 12 }
        ];
    }

    const ws = XLSX.utils.aoa_to_sheet([header, ...sampleData]);
    ws['!cols'] = cols;
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, filename);
}

const parsePrice = (val: unknown): number => {
    if (val == null) return 0;
    const str = String(val).replace(/[^0-9]/g, '');
    return str ? Number(str) : 0;
};

interface TemplateParseContext {
    stickerType: 'gia_soc' | 'gio_vang' | 'draw';
    bgImage: string;
    headerTextContent: string;
    subHeaderTextContent: string;
    footerTextContent: string;
    discountThreshold: string;
}

interface TemplateParseResult {
    pages: StickerPage[];
    headerTextContent: string;
    subHeaderTextContent: string;
    footerTextContent: string;
    // Khác rỗng nếu parse thất bại — tránh discriminated union { ok: true|false } vì
    // dự án không bật strictNullChecks nên TS không thu hẹp kiểu đúng bên trong try/catch.
    error?: string;
}

// any: dữ liệu Excel thô, mỗi ô có thể là string/number/Date/null tùy nội dung file
export function parseTemplateExcelData(
    data: any[][],
    { stickerType, bgImage, headerTextContent, subHeaderTextContent, footerTextContent, discountThreshold }: TemplateParseContext
): TemplateParseResult {
    if (!data || data.length < 2) {
        return { pages: [], headerTextContent, subHeaderTextContent, footerTextContent, error: 'File không chứa đủ dữ liệu' };
    }

    // Detect column headers from first row
    const headers = (data[0] || []).map(h => String(h).trim().toUpperCase());

    let codeIndex = -1;
    let nameIndex = -1;
    let retailPriceIndex = -1;
    let salePriceIndex = -1;
    let thoiGianIndex = -1;
    let soLuongIndex = -1;
    let khuyenMaiIndex = -1;
    // Cột số bản in (thêm từ bản có số lượng in): không có thì mỗi sản phẩm in 1 bản. Khác cột SỐ LƯỢNG SUẤT của Giờ Vàng.
    let quantityIndex = headers.findIndex(h => h === 'SỐ BẢN IN' || h === 'SỐ LƯỢNG IN');

    if (stickerType === 'gia_soc') {
        codeIndex = headers.findIndex(h => h === 'CODE' || h === 'CODE:');
        nameIndex = headers.findIndex(h => h === 'TÊN SẢN PHẨM' || h === 'SẢN PHẨM');
        retailPriceIndex = headers.findIndex(h => h === 'GIÁ GỐC' || h === 'GIÁ NIÊM YẾT');
        salePriceIndex = headers.indexOf('GIÁ GIẢM');
        thoiGianIndex = headers.findIndex(h => h === 'TIÊU ĐỀ' || h === 'THỜI GIAN ÁP DỤNG');
        khuyenMaiIndex = headers.indexOf('KHUYẾN MÃI');

        // If header match failed, assume the new order of columns:
        // 1. TIÊU ĐỀ, 2. CODE, 3. TÊN SẢN PHẨM, 4. GIÁ GỐC, 5. GIÁ GIẢM, 6. KHUYẾN MÃI
        if (codeIndex === -1 && nameIndex === -1 && retailPriceIndex === -1) {
            thoiGianIndex = 0;
            codeIndex = 1;
            nameIndex = 2;
            retailPriceIndex = 3;
            salePriceIndex = 4;
            khuyenMaiIndex = 5;
            quantityIndex = 6;
        }
    } else {
        // gio_vang
        codeIndex = headers.findIndex(h => h === 'CODE' || h === 'CODE:');
        nameIndex = headers.findIndex(h => h === 'SẢN PHẨM' || h === 'TÊN SẢN PHẨM');
        retailPriceIndex = headers.findIndex(h => h === 'GIÁ NIÊM YẾT' || h === 'GIÁ GỐC');
        salePriceIndex = headers.indexOf('GIÁ GIẢM');
        thoiGianIndex = headers.findIndex(h => h === 'THỜI GIAN ÁP DỤNG' || h === 'TIÊU ĐỀ');
        soLuongIndex = headers.indexOf('SỐ LƯỢNG SUẤT');

        // If header match failed, assume the old order of columns:
        // CODE, SẢN PHẨM, GIÁ NIÊM YẾT, GIÁ GIẢM, THỜI GIAN ÁP DỤNG, SỐ LƯỢNG SUẤT
        if (codeIndex === -1 && nameIndex === -1 && retailPriceIndex === -1) {
            codeIndex = 0;
            nameIndex = 1;
            retailPriceIndex = 2;
            salePriceIndex = 3;
            thoiGianIndex = 4;
            soLuongIndex = 5;
            quantityIndex = 6;
        }
    }

    // Read header/subheader/footer text content from first data row if available to sync editor preview
    let resultHeaderTextContent = headerTextContent;
    let resultSubHeaderTextContent = subHeaderTextContent;
    let resultFooterTextContent = footerTextContent;
    const firstRow = data[1];
    if (firstRow) {
        let thoiGian = headerTextContent;
        let soLuong = subHeaderTextContent;
        let khuyenMai = footerTextContent;

        if (thoiGianIndex !== -1 && firstRow[thoiGianIndex] != null) {
            const t = String(firstRow[thoiGianIndex]).trim();
            if (t) thoiGian = t;
        }
        if (soLuongIndex !== -1 && firstRow[soLuongIndex] != null) {
            const s = String(firstRow[soLuongIndex]).trim();
            if (s) soLuong = s;
        }
        if (khuyenMaiIndex !== -1 && firstRow[khuyenMaiIndex] != null) {
            const k = String(firstRow[khuyenMaiIndex]).trim();
            if (k) khuyenMai = k;
        }

        resultHeaderTextContent = thoiGian;
        resultSubHeaderTextContent = soLuong;
        resultFooterTextContent = khuyenMai;
    }

    const newPages: StickerPage[] = [];
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length < 2) continue;

        const code = codeIndex !== -1 && row[codeIndex] != null ? String(row[codeIndex]).trim() : '';
        const name = nameIndex !== -1 && row[nameIndex] != null ? String(row[nameIndex]).trim() : '';
        if (!name) continue;

        const retailPrice = retailPriceIndex !== -1 ? parsePrice(row[retailPriceIndex]) : 0;
        let salePrice = salePriceIndex !== -1 ? parsePrice(row[salePriceIndex]) : 0;
        // BUG FIX: chuẩn hoá đơn vị giá bán trước khi dùng — file Excel nhập tay đôi khi
        // thiếu 3 số 0 (VD "1500" thay vì "1500000"), y hệt lỗi normalizeStickerPriceUnit
        // đã xử lý ở luồng khác trong cùng file (parseErpPriceExcelData qua formatPriceChangePercent).
        // Thiếu bước này khiến cả giá hiển thị trên tem lẫn % giảm giá tự động chọn ngưỡng
        // (isSelected bên dưới) đều sai lệch nặng.
        if (retailPrice > 0 && salePrice > 0) {
            salePrice = normalizeStickerPriceUnit(retailPrice, salePrice);
        }

        const oldPrice = retailPrice ? retailPrice.toLocaleString('vi-VN') : '';
        const newPrice = salePrice ? Number(Math.floor(salePrice / 1000)).toLocaleString('vi-VN') : '';

        let percent = '';
        if (retailPrice > 0 && salePrice > 0) {
            const ratio = Math.round((salePrice / retailPrice - 1) * 100);
            percent = `${ratio}%`;
        }

        // Row-specific header
        let rowHeader = headerTextContent;
        if (thoiGianIndex !== -1 && row[thoiGianIndex] != null) {
            const val = String(row[thoiGianIndex]).trim();
            if (val) rowHeader = val;
        }

        // Row-specific subheader
        let rowSubHeader = subHeaderTextContent;
        if (soLuongIndex !== -1 && row[soLuongIndex] != null) {
            const val = String(row[soLuongIndex]).trim();
            if (val) rowSubHeader = val;
        }

        // Row-specific footer
        let rowFooter = footerTextContent;
        if (khuyenMaiIndex !== -1 && row[khuyenMaiIndex] != null) {
            const val = String(row[khuyenMaiIndex]).trim();
            if (val) rowFooter = val;
        }

        // Build sticker HTML using actual pre-rendered image data URL for barcode
        let barcodeHtml = '';
        if (code) {
            try {
                const url = generateBarcodeDataUrl(code);
                barcodeHtml = `<div class="barcode"><img src="${url}" style="image-rendering:pixelated;width:100%;height:100%;object-fit:fill" alt="${code}" /></div>`;
            } catch (e) {
                console.error('Error generating barcode for template item:', e);
            }
        }

        const subHeaderHtml = stickerType === 'gio_vang'
            ? `<div class="sub-header">${rowSubHeader}</div>` : '';

        let priceHtml = '';
        if (stickerType === 'gio_vang') {
            priceHtml = `<div class="extra2" style="display:flex;align-items:baseline;justify-content:center"><span>${newPrice}</span><span class="small-zeros">.000</span></div>`;
        } else {
            priceHtml = `<div class="extra2">${newPrice}</div>`;
        }

        const html = `<div class="sticker-container" data-type="${stickerType}" style="background-image:url('${bgImage}');background-size:100% 100%;background-repeat:no-repeat;background-position:center;width:100%;aspect-ratio:197/285;position:relative;overflow:hidden;container-type:inline-size;font-family:Arial,sans-serif;">
                        ${barcodeHtml}
                        <div class="header-text">${rowHeader}</div>
                        ${subHeaderHtml}
                        <div class="extra1">${percent}</div>
                        <div class="old">${oldPrice}</div>
                        <div class="name">${name}</div>
                        ${priceHtml}
                        <div class="footer-text">${rowFooter}</div>
                    </div>`;

        const cleanInput = discountThreshold.replace(/[^0-9]/g, '');
        const limit = parseInt(cleanInput, 10);
        const isSelected = isNaN(limit) ? true : parsePercentValue(percent) >= limit;

        newPages.push({
            id: `tpl_${i}_${Date.now()}`,
            html,
            label: name.substring(0, 50),
            oldPrice,
            newPrice,
            percent,
            timestamp: Date.now(),
            code: code,
            selected: isSelected,
            header: rowHeader,
            subHeader: rowSubHeader,
            footer: rowFooter,
            quantity: quantityIndex !== -1 && row[quantityIndex] != null && String(row[quantityIndex]).trim() !== ''
                ? normalizeTagQuantity(row[quantityIndex]) : 1,
        });
    }

    if (newPages.length === 0) {
        return { pages: [], headerTextContent: resultHeaderTextContent, subHeaderTextContent: resultSubHeaderTextContent, footerTextContent: resultFooterTextContent, error: 'Không tìm thấy dữ liệu hợp lệ trong file.' };
    }

    return {
        pages: newPages,
        headerTextContent: resultHeaderTextContent,
        subHeaderTextContent: resultSubHeaderTextContent,
        footerTextContent: resultFooterTextContent,
    };
}

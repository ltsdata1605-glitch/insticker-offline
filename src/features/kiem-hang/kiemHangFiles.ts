import { parseSheetRows } from './kiemHangData';
import type { ParsedFile } from './kiemHangData';

/** Đọc các file Excel người dùng chọn hoặc kéo thả. File hỏng hay không phải Excel thì báo không đọc được, không dừng cả lượt. */
export const readExcelFiles = async (files: File[]): Promise<ParsedFile[]> => {
    const XLSX = await import('xlsx');
    return Promise.all(files.map(async (file): Promise<ParsedFile> => {
        if (!/\.(xlsx|xls|xlsm|csv)$/i.test(file.name)) return { kind: 'invalid', fileName: file.name, reason: 'không phải file Excel' };
        try {
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            if (!sheet) return { kind: 'invalid', fileName: file.name, reason: 'file trống' };
            const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
            return parseSheetRows(file.name, rows);
        } catch (error) {
            console.error('[Kiểm hàng] Không đọc được', file.name, error);
            return { kind: 'invalid', fileName: file.name, reason: 'không mở được file' };
        }
    }));
};

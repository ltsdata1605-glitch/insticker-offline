import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, encodeBackup, parseBackup } from '../../src/platform/backupFormat';

describe('File sao lưu', () => {
  it('giữ nguyên dữ liệu và mốc thời gian sau khi ghi rồi đọc lại', () => {
    const uploadTimestamp = new Date('2026-11-04T08:00:00.000Z');
    const text = encodeBackup(
      {
        appData: { products: [{ msp: '123' }], fileInfo: { fileName: 'gia.xlsx', uploadTimestamp }, inventoryUploadTimestamp: uploadTimestamp },
        settings: { printSettings: { tagsPerPage: 4 } },
      },
      new Date('2026-11-04T09:00:00.000Z'),
    );
    const data = parseBackup(text);
    expect(data.createdAt).toBe('2026-11-04T09:00:00.000Z');
    expect(data.appData.products).toEqual([{ msp: '123' }]);
    expect((data.appData.fileInfo as { uploadTimestamp: Date }).uploadTimestamp).toEqual(uploadTimestamp);
    expect(data.appData.inventoryUploadTimestamp).toEqual(uploadTimestamp);
    expect(data.settings.printSettings).toEqual({ tagsPerPage: 4 });
  });

  it('bỏ qua khoá lạ trong file', () => {
    const data = parseBackup(JSON.stringify({
      format: BACKUP_FORMAT, version: 1, appData: { products: [], khoaLa: 1 }, settings: { globalFont: 'Inter', khoaLa: 2 },
    }));
    expect(Object.keys(data.appData)).toEqual(['products']);
    expect(Object.keys(data.settings)).toEqual(['globalFont']);
  });

  it('từ chối file không đúng', () => {
    expect(() => parseBackup('không phải json')).toThrow(/không đọc được/);
    expect(() => parseBackup(JSON.stringify({ format: 'khac', version: 1 }))).toThrow(/không phải file sao lưu/);
    expect(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }))).toThrow(/phiên bản mới hơn/);
  });
});

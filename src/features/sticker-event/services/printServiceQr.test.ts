import { describe, it, expect, vi } from 'vitest';
import QRCode from 'qrcode';

vi.mock('../../../components/shared/ui/toast', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { qrSvgDataUrl } from './printService';

/** Đọc lại ảnh QR: mỗi đoạn `M x y h n v1 h-n z` là một dải ô đen trên một hàng. */
const readModules = (dataUrl: string) => {
    const svg = decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
    const size = Number(svg.match(/viewBox="0 0 (\d+) \1"/)?.[1]);
    const path = svg.match(/<path d="([^"]*)" fill="#000"/)?.[1] ?? '';
    const grid = Array.from({ length: size }, () => Array<number>(size).fill(0));
    for (const [, x, y, run, back] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
        expect(back).toBe(run);
        for (let i = 0; i < Number(run); i++) grid[Number(y)][Number(x) + i] = 1;
    }
    return { svg, size, path, grid };
};

/**
 * Ảnh QR trên tem (2026-11-26): SVG tô kín (hàm qrSvg của Tạo mã) thay cho ảnh PNG 150px nhoè khi thu nhỏ. Không dùng SVG của
 * thư viện qrcode: thư viện vẽ bằng nét, bản PDF của Chromium vẽ nét mảnh hơn 1pt (16, 24 tem mỗi trang) thành sợi tóc nên QR
 * in ra thành các vạch kẻ, không quét được.
 */
describe('ảnh mã QR trên tem', () => {
    for (const code of ['1751099000213', '3001002', 'A1', 'SP-0001/ĐỎ']) {
        it(`${code}: đúng từng ô của mã QR, có viền trắng 1 ô`, () => {
            const { modules } = QRCode.create(code, { errorCorrectionLevel: 'M' });
            const { size, grid } = readModules(qrSvgDataUrl(code));
            expect(size).toBe(modules.size + 2);
            for (let row = 0; row < size; row++) {
                for (let col = 0; col < size; col++) {
                    const inside = row > 0 && col > 0 && row <= modules.size && col <= modules.size;
                    const expected = inside && modules.get(row - 1, col - 1) ? 1 : 0;
                    expect(grid[row][col], `ô ${row},${col}`).toBe(expected);
                }
            }
        });
    }

    it('chỉ tô kín, không có nét vẽ; giữ cỡ gốc 150px và ô vuông sắc nét', () => {
        const { svg, path } = readModules(qrSvgDataUrl('1751099000213'));
        expect(svg).not.toContain('stroke');
        expect(svg).toContain('width="150" height="150"');
        expect(svg).toContain('shape-rendering="crispEdges"');
        // Cả mã là một hình duy nhất, không có khe mờ giữa các hình chồng mép nhau
        expect(svg.match(/<path /g)).toHaveLength(1);
        expect(path.length).toBeGreaterThan(0);
    });
});

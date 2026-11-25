/**
 * Cầu nối Google Sheet giả cho bài kiểm thử: chạy đúng phần "Lõi" của scripts/google-sheet/cau-noi-nhac-viec.gs (script quản lý
 * dán vào file) trên bảng giữ trong bộ nhớ, trả lời app qua http://127.0.0.1 như ứng dụng web của Google.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/google-sheet/cau-noi-nhac-viec.gs');

export type Cell = string | { ngay?: string; luc?: number };
export interface Memory {
  lay(ref: string): string | null;
  dat(ref: string, id: string): void;
}
export interface Data {
  viec: { tieuDe: string[]; dong: string[][] };
  nhatKy: { dong: Cell[][] };
  baoCao: { dong: Cell[][] };
  checklist: { tieuDe: string[]; dong: string[][] } | null;
}
export interface Outcome {
  ghi: { trang: string; dong: number; cot: number; giaTri: Cell | boolean }[];
  them: { trang: string; giaTri: Cell[] }[];
  ketQua: { ref: string; id: string; loi?: string }[];
}
export interface BridgeCore {
  cnXuLy_(du: Data, ops: unknown[], by: string, now: number, nho: Memory): Outcome;
  cnLanXong_(rows: Cell[][], from: number): { id: string; occ: number; by: string }[];
  cnSuKien_(rows: Cell[][], from: number): { id: string; occ: number; loai: string; by: string; at: number; note: string; anh: string[] }[];
  cnGonBang_(rows: string[][], keyColumn: number): string[][];
  cnCot_(header: string[], name: string): number;
  cnHienThi_(value: Cell | boolean): string;
  cnDongTuForm_(form: Record<string, string>): Record<string, Cell>;
}

/** Nạp phần Lõi của script cầu nối (không gọi dịch vụ nào của Google) */
export const loadBridgeCore = (): BridgeCore =>
  vm.runInNewContext(`${fs.readFileSync(SCRIPT, 'utf8')}\n;({ cnXuLy_, cnLanXong_, cnSuKien_, cnGonBang_, cnCot_, cnHienThi_, cnDongTuForm_ })`, {}) as BridgeCore;

export const TASK_HEADER = ['Mã việc', 'Tiêu đề', 'Nội dung', 'Ngày hạn', 'Giờ hạn', 'Người xử lý', 'Mức độ', 'Nhắc trước', 'Lặp lại', 'Âm thanh', 'Câu đọc', 'Checklist', 'Trạng thái', 'Người giao', 'Người xong', 'Xong lúc',
  'Bộ phận', 'Khi xong cần', 'Đã nhận', 'Cần hỗ trợ'];
export const CHECKLIST_HEADER = ['Tên checklist', 'Việc', 'Hướng dẫn', 'Bắt buộc', 'Cần ảnh', 'Cần ghi chú', 'Lịch làm', 'Giờ bắt đầu', 'Giờ hạn', 'Người làm', 'Trạng thái', 'Bộ phận'];

export class FakeBridge {
  readonly core = loadBridgeCore();
  key = 'khoaThuNghiem0123456789abcdef';
  viec: string[][];
  checklist: string[][] = [CHECKLIST_HEADER];
  nhatKy: string[][] = [];
  baoCao: string[][] = [];
  staff = ['Ngọc - 11443', 'Linh'];
  assigners = ['QL Sơn'];
  /** Các lần app gửi thay đổi */
  posts: { by: string; ops: { op: string; ref: string; id?: string }[] }[] = [];
  /** Mất mạng: cắt kết nối mọi yêu cầu */
  down = false;
  /** Phiên bản script trong file: 1 là bản cũ (chưa có Đã nhận, Cần hỗ trợ, checklist từ app) */
  scriptVersion = 2;
  /** Ảnh app gửi kèm (như lưu vào Drive) */
  photos: { name: string; bytes: number }[] = [];
  link = '';
  private readonly memory = new Map<string, string>();
  private server?: http.Server;

  constructor(rows = 10) {
    this.viec = [TASK_HEADER, ...Array.from({ length: rows }, (_, i) => [`CV${String(i + 1).padStart(3, '0')}`, ...TASK_HEADER.slice(1).map(() => '')])];
  }

  /** Quản lý ghi việc trong file (tên cột → giá trị) */
  setTask(id: string, values: Record<string, string>): void {
    let row = this.viec.find(item => item[0] === id);
    if (!row) {
      row = [id, ...TASK_HEADER.slice(1).map(() => '')];
      this.viec.push(row);
    }
    for (const [name, value] of Object.entries(values)) row[this.core.cnCot_(TASK_HEADER, name)] = value;
  }

  task(id: string): Record<string, string> {
    const row = this.viec.find(item => item[0] === id) ?? [];
    return Object.fromEntries(TASK_HEADER.map((name, i) => [name, row[i] ?? '']));
  }

  taskByTitle(title: string): Record<string, string> | null {
    const row = this.viec.find(item => item[1] === title);
    return row ? this.task(row[0]) : null;
  }

  doc() {
    return {
      title: 'Nhắc việc cửa hàng',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
      tables: [
        { name: 'Nhắc việc', rows: this.core.cnGonBang_(this.viec, 1) },
        { name: 'Checklist', rows: this.core.cnGonBang_(this.checklist, 0) },
      ],
      doneLog: this.core.cnLanXong_(this.nhatKy, Date.now() - 40 * 86_400_000),
      ...(this.scriptVersion >= 2 ? { events: this.core.cnSuKien_(this.nhatKy, Date.now() - 40 * 86_400_000) } : {}),
      staff: this.staff,
      assigners: this.assigners,
    };
  }

  get(params: URLSearchParams): object {
    if (params.get('k') !== this.key) return { ok: false, error: 'key', message: 'Link kết nối không đúng hoặc đã đổi mã.' };
    const doc = this.doc();
    const version = crypto.createHash('md5').update(JSON.stringify([this.scriptVersion, doc.tables, doc.doneLog, doc.events ?? [], doc.staff, doc.assigners])).digest('hex');
    if (params.get('since') === version) return { ok: true, v: this.scriptVersion, unchanged: true, version };
    return { ok: true, v: this.scriptVersion, version, ...doc };
  }

  /** Như doPost của script: áp thay đổi bằng phần Lõi rồi ghi vào bảng (như trang tính hiện giá trị) */
  apply(ops: unknown[], by: string, now = Date.now()): Outcome {
    const data: Data = {
      viec: { tieuDe: this.viec[0], dong: this.viec.slice(1).map(row => [...row]) },
      nhatKy: { dong: this.nhatKy.map(row => [...row]) },
      baoCao: { dong: this.baoCao.map(row => [...row]) },
      checklist: { tieuDe: this.checklist[0], dong: this.checklist.slice(1).map(row => [...row]) },
    };
    // Như doPost: ảnh lưu vào Drive, thao tác giữ link ảnh
    for (const op of ops as { photos?: { name: string; data: string }[]; anh?: string[] }[]) {
      if (!op.photos?.length) continue;
      op.anh = op.photos.map((photo, n) => {
        this.photos.push({ name: photo.name, bytes: Buffer.from(photo.data, 'base64').length });
        return `https://drive.google.com/file/d/anh${this.photos.length}${n}/view`;
      });
      delete op.photos;
    }
    const outcome = this.core.cnXuLy_(data, ops, by, now, {
      lay: ref => this.memory.get(ref) ?? null,
      dat: (ref, id) => void this.memory.set(ref, id),
    });
    for (const write of outcome.ghi) {
      const table = write.trang === 'checklist' ? this.checklist : this.viec;
      const header = write.trang === 'checklist' ? CHECKLIST_HEADER : TASK_HEADER;
      while (table.length < write.dong) table.push(header.map(() => ''));
      table[write.dong - 1][write.cot - 1] = this.core.cnHienThi_(write.giaTri);
    }
    for (const row of outcome.them) {
      const values = row.giaTri.map(value => this.core.cnHienThi_(value));
      (row.trang === 'nhatKy' ? this.nhatKy : this.baoCao).push(values);
    }
    return outcome;
  }

  post(params: URLSearchParams, body: { by?: string; ops?: { op: string; ref: string; id?: string }[] }): object {
    if (params.get('k') !== this.key) return { ok: false, error: 'key', message: 'Link kết nối không đúng hoặc đã đổi mã.' };
    const by = String(body.by ?? '').trim() || 'Máy chưa đặt tên';
    this.posts.push({ by, ops: body.ops ?? [] });
    return { ok: true, v: this.scriptVersion, results: this.apply(body.ops ?? [], by).ketQua };
  }

  async listen(): Promise<string> {
    this.server = http.createServer((req, res) => {
      if (this.down) {
        req.socket.destroy();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const reply = (data: object) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      };
      if (!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === 'GET') {
        reply(this.get(url.searchParams));
        return;
      }
      let text = '';
      req.on('data', chunk => { text += chunk; });
      req.on('end', () => reply(this.post(url.searchParams, JSON.parse(text || '{}'))));
    });
    await new Promise<void>(resolve => this.server!.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as { port: number };
    this.link = `http://127.0.0.1:${port}/macros/s/AKfycbTESTDEPLOYMENT0123456789/exec?k=${this.key}`;
    return this.link;
  }

  async close(): Promise<void> {
    await new Promise<void>(resolve => (this.server ? this.server.close(() => resolve()) : resolve()));
  }
}

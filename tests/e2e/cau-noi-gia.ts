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
}
export interface Outcome {
  ghi: { trang: string; dong: number; cot: number; giaTri: Cell }[];
  them: { trang: string; giaTri: Cell[] }[];
  ketQua: { ref: string; id: string; loi?: string }[];
}
export interface BridgeCore {
  cnXuLy_(du: Data, ops: unknown[], by: string, now: number, nho: Memory): Outcome;
  cnLanXong_(rows: Cell[][], from: number): { id: string; occ: number; by: string }[];
  cnGonBang_(rows: string[][], keyColumn: number): string[][];
  cnCot_(header: string[], name: string): number;
  cnHienThi_(value: Cell): string;
  cnDongTuForm_(form: Record<string, string>): Record<string, Cell>;
}

/** Nạp phần Lõi của script cầu nối (không gọi dịch vụ nào của Google) */
export const loadBridgeCore = (): BridgeCore =>
  vm.runInNewContext(`${fs.readFileSync(SCRIPT, 'utf8')}\n;({ cnXuLy_, cnLanXong_, cnGonBang_, cnCot_, cnHienThi_, cnDongTuForm_ })`, {}) as BridgeCore;

export const TASK_HEADER = ['Mã việc', 'Tiêu đề', 'Nội dung', 'Ngày hạn', 'Giờ hạn', 'Người xử lý', 'Mức độ', 'Nhắc trước', 'Lặp lại', 'Âm thanh', 'Câu đọc', 'Checklist', 'Trạng thái', 'Người giao', 'Người xong', 'Xong lúc'];
export const CHECKLIST_HEADER = ['Tên checklist', 'Việc', 'Hướng dẫn', 'Bắt buộc', 'Cần ảnh', 'Cần ghi chú', 'Lịch làm', 'Giờ bắt đầu', 'Giờ hạn', 'Người làm', 'Trạng thái'];

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
      staff: this.staff,
      assigners: this.assigners,
    };
  }

  get(params: URLSearchParams): object {
    if (params.get('k') !== this.key) return { ok: false, error: 'key', message: 'Link kết nối không đúng hoặc đã đổi mã.' };
    const doc = this.doc();
    const version = crypto.createHash('md5').update(JSON.stringify([doc.tables, doc.doneLog, doc.staff, doc.assigners])).digest('hex');
    if (params.get('since') === version) return { ok: true, v: 1, unchanged: true, version };
    return { ok: true, v: 1, version, ...doc };
  }

  /** Như doPost của script: áp thay đổi bằng phần Lõi rồi ghi vào bảng (như trang tính hiện giá trị) */
  apply(ops: unknown[], by: string, now = Date.now()): Outcome {
    const data: Data = {
      viec: { tieuDe: this.viec[0], dong: this.viec.slice(1).map(row => [...row]) },
      nhatKy: { dong: this.nhatKy.map(row => [...row]) },
      baoCao: { dong: this.baoCao.map(row => [...row]) },
    };
    const outcome = this.core.cnXuLy_(data, ops, by, now, {
      lay: ref => this.memory.get(ref) ?? null,
      dat: (ref, id) => void this.memory.set(ref, id),
    });
    for (const write of outcome.ghi) {
      while (this.viec.length < write.dong) this.viec.push(TASK_HEADER.map(() => ''));
      this.viec[write.dong - 1][write.cot - 1] = this.core.cnHienThi_(write.giaTri);
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
    return { ok: true, v: 1, results: this.apply(body.ops ?? [], by).ketQua };
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

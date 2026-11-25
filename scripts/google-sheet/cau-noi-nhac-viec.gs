/**
 * CẦU NỐI NHẮC VIỆC: đồng bộ hai chiều giữa file Google Sheet và app Tools (trước đây tên In Sticker)
 *
 * Dán vào FILE MẪU một lần (mọi bản sao tạo từ file mẫu tự có sẵn):
 *   1. Mở file mẫu, menu Tiện ích mở rộng → Apps Script.
 *   2. Xoá nội dung có sẵn trong Mã.gs, dán toàn bộ file này, bấm Lưu (biểu tượng đĩa).
 *   3. Tải lại trang file: thanh menu có thêm mục "Nhắc việc".
 * File đã tạo từ mẫu cũ (trước khi dán script) thì dán thêm vào file đó theo đúng 3 bước trên.
 *
 * Quản lý bật đồng bộ (mỗi file làm một lần): menu Nhắc việc → Bật đồng bộ hai chiều, làm theo khung hướng dẫn bên phải. Xong sẽ
 * có Link kết nối để gửi cho các máy. Ai có link mới đọc và ghi được file qua app, file không cần chia sẻ công khai.
 *
 * Sửa script này sau khi đã triển khai (hoặc app báo script trong file là bản cũ): dán đè toàn bộ, Lưu, tải lại trang file, menu
 * Nhắc việc → Cập nhật file cho app mới (thêm cột, trang Tổng quan, cho phép lưu ảnh vào Drive), rồi Triển khai → Quản lý bản triển
 * khai → bút chì → Phiên bản: Phiên bản mới → Triển khai. Link kết nối giữ nguyên.
 *
 * Phần "Lõi" không gọi dịch vụ nào của Google: app Tools dùng chính phần này để kiểm thử, đừng sửa riêng ở đây.
 */

/** 2: bộ phận, Khi xong cần, Đã nhận, Cần hỗ trợ, ghi chú và ảnh khi xong, checklist từ app, trang Tổng quan */
const CN_PHIEN_BAN = 2;
const CN_TRANG = { viec: 'Nhắc việc', checklist: 'Checklist', danhMuc: 'Danh mục', nhatKy: 'Nhật ký', baoCao: 'Báo cáo checklist', tongQuan: 'Tổng quan' };
const CN_BO_PHAN = ['Kho', 'Thu ngân', 'Quản lý'];
const CN_KHI_XONG = ['Ghi chú', 'Ảnh', 'Ảnh + ghi chú'];
const CN_COT_THEM = [
  { ten: 'Người xong', rong: 150, ghiChu: 'App ghi tên người bấm Đã xong.' },
  { ten: 'Xong lúc', rong: 130, ghiChu: 'App ghi giờ bấm Đã xong. Việc lặp lại: lần xong gần nhất, các lần trước xem ở trang Nhật ký.' },
  { ten: 'Bộ phận', rong: 110, chon: CN_BO_PHAN, ghiChu: 'Bộ phận nhận việc (Kho, Thu ngân, Quản lý…): chỉ máy của bộ phận đó nhắc. Để trống là việc chung, máy nào cũng nhắc.' },
  { ten: 'Khi xong cần', rong: 120, chon: CN_KHI_XONG, ghiChu: 'Bấm Đã xong phải kèm ghi chú, ảnh hay cả hai. Để trống là bấm Đã xong là xong.' },
  { ten: 'Đã nhận', rong: 170, ghiChu: 'App ghi người bấm Đã nhận và giờ nhận (lần gần nhất). Các lần trước xem ở trang Nhật ký.' },
  { ten: 'Cần hỗ trợ', rong: 240, ghiChu: 'App ghi khi nhân viên bấm Cần hỗ trợ: người, giờ, lý do. Bấm Đã xong thì ô này tự xoá.' },
];
const CN_NHAT_KY = ['Lúc', 'Mã việc', 'Tiêu đề', 'Lần hạn', 'Người', 'Mốc lần hạn (app dùng)', 'Loại', 'Ghi chú', 'Ảnh', 'Bộ phận'];
const CN_LOAI = { xong: 'Xong', nhan: 'Đã nhận', hoTro: 'Cần hỗ trợ' };
/** Ảnh gửi kèm mỗi lần tối đa */
const CN_ANH_TOI_DA = 5;
const CN_BAO_CAO = ['Lúc hoàn tất', 'Checklist', 'Ngày', 'Người làm', 'Kết quả', 'Có vấn đề', 'Chưa làm', 'Ghi chú chung', 'Chi tiết', 'Mã lượt (app dùng)'];
/** App chỉ cần các lần xong gần đây để biết lần nào của việc lặp lại đã xong */
const CN_NHAT_KY_NGAY = 40;
const CN_MUC_DO = ['Thường', 'Quan trọng', 'Khẩn'];
const CN_NHAC_TRUOC = ['15 phút + đúng hạn', 'Đúng hạn', '5 phút trước', '15 phút trước', '30 phút trước', '1 giờ trước', '1 giờ + 15 phút + đúng hạn', '1 ngày + 1 giờ + đúng hạn'];
const CN_LAP_LAI = ['Không lặp', 'Mỗi ngày', 'T2 - T6', 'T2 - T7', 'Mỗi tuần', 'Mỗi tháng'];
const CN_AM_THANH = ['Chuông reo', 'Còi báo', 'Bíp dồn dập', 'Chuông cửa', 'Nhạc nhẹ', 'Đọc chữ'];

// ==================== Lõi ====================

function boDau_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Vị trí cột theo tên cột (bỏ dấu, không phân biệt hoa thường), -1 nếu không có */
function cnCot_(tieuDe, ten) {
  const khoa = boDau_(ten);
  for (let i = 0; i < tieuDe.length; i++) if (boDau_(tieuDe[i]) === khoa) return i;
  return -1;
}

function cnChu_(v) {
  return v == null ? '' : String(v).trim();
}

/** Dòng chưa dùng: có Mã việc điền sẵn, các ô khác trống */
function cnDongChuaDung_(dong) {
  if (!cnChu_(dong[0])) return false;
  for (let i = 1; i < dong.length; i++) if (cnChu_(dong[i])) return false;
  return true;
}

/** Mã việc kế tiếp sau mã lớn nhất dạng CV001 */
function cnMaKeTiep_(viec) {
  let lon = 0;
  viec.dong.forEach(dong => {
    const m = cnChu_(dong[0]).match(/^CV(\d+)$/i);
    if (m) lon = Math.max(lon, Number(m[1]));
  });
  return 'CV' + ('00' + (lon + 1)).slice(-Math.max(3, String(lon + 1).length));
}

/**
 * Chỗ cho một việc mới: dòng chưa dùng đầu tiên (mã điền sẵn), hết thì thêm dòng cuối với mã kế tiếp.
 * Trả về chỉ số trong viec.dong (dòng trên trang = chỉ số + 2) và mã việc.
 */
function cnChoViecMoi_(viec, ghi) {
  for (let i = 0; i < viec.dong.length; i++) {
    if (cnDongChuaDung_(viec.dong[i])) return { i: i, id: cnChu_(viec.dong[i][0]) };
  }
  const id = cnMaKeTiep_(viec);
  const dong = viec.tieuDe.map(() => '');
  dong[0] = id;
  viec.dong.push(dong);
  ghi.push({ trang: 'viec', dong: viec.dong.length + 1, cot: 1, giaTri: id });
  return { i: viec.dong.length - 1, id: id };
}

function cnTimViec_(viec, id) {
  if (!id) return -1;
  const khoa = String(id).trim().toUpperCase();
  for (let i = 0; i < viec.dong.length; i++) if (cnChu_(viec.dong[i][0]).toUpperCase() === khoa) return i;
  return -1;
}

/** Ghi một ô của trang Nhắc việc (giữ bản trong bộ nhớ khớp với trang để các thao tác sau cùng lượt thấy) */
function cnGhiO_(viec, i, ten, giaTri, ghi) {
  cnGhiOTrang_('viec', viec, i, ten, giaTri, ghi);
}

/** Ghi một ô theo tên cột ở trang `trang`; giá trị đúng/sai (ô tick) giữ kiểu đúng/sai */
function cnGhiOTrang_(trang, bang, i, ten, giaTri, ghi) {
  const cot = cnCot_(bang.tieuDe, ten);
  if (cot < 0) return;
  const hienTai = bang.dong[i][cot];
  const moi = typeof giaTri === 'boolean' || (giaTri && typeof giaTri === 'object') ? giaTri : cnChu_(giaTri);
  if (cnChu_(hienTai) === cnHienThi_(moi)) return;
  bang.dong[i][cot] = cnHienThi_(moi);
  ghi.push({ trang: trang, dong: i + 2, cot: cot + 1, giaTri: moi });
}

function hai_(n) {
  return ('0' + n).slice(-2);
}

/** Cách trang hiện giá trị đặc biệt: {ngay: 'yyyy-mm-dd'} → dd/mm/yyyy, {luc: ms} → dd/mm/yyyy hh:mm */
function cnHienThi_(v) {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v && v.ngay) {
    const p = String(v.ngay).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  if (v && v.luc) {
    const d = new Date(v.luc);
    return hai_(d.getDate()) + '/' + hai_(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + hai_(d.getHours()) + ':' + hai_(d.getMinutes());
  }
  return cnChu_(v);
}

/**
 * Áp các thay đổi app gửi lên. `du`: { viec: { tieuDe, dong }, nhatKy: { dong }, baoCao: { dong } } (dòng dữ liệu, chưa gồm
 * dòng tiêu đề). `nho`: nhớ mã việc theo mã của app, để app gửi lại (mất mạng giữa chừng) không tạo trùng việc.
 * Trả về các ô cần ghi, các dòng cần thêm và kết quả từng thao tác.
 */
function cnXuLy_(du, thaoTac, nguoi, bayGio, nho) {
  const ghi = [];
  const them = [];
  const ketQua = [];
  const viec = du.viec;
  const maTheoRef = {};
  const timMa = op => op.id || maTheoRef[op.ref] || (op.ref ? nho.lay(op.ref) : null);

  thaoTac.forEach(op => {
    try {
      if (op.op === 'upsert') {
        let id = timMa(op);
        let i = cnTimViec_(viec, id);
        if (id && i < 0) {
          ketQua.push({ ref: op.ref, id: id, loi: 'khong-thay' });
          return;
        }
        const moi = i < 0;
        if (moi) {
          const cho = cnChoViecMoi_(viec, ghi);
          i = cho.i;
          id = cho.id;
        }
        const dong = op.row || {};
        Object.keys(dong).forEach(ten => {
          if (boDau_(ten) !== 'ma viec') cnGhiO_(viec, i, ten, dong[ten], ghi);
        });
        if (moi) {
          if (!dong['Trạng thái']) cnGhiO_(viec, i, 'Trạng thái', 'Đang giao', ghi);
          if (!dong['Người giao']) cnGhiO_(viec, i, 'Người giao', nguoi, ghi);
        }
        if (op.ref) {
          maTheoRef[op.ref] = id;
          nho.dat(op.ref, id);
        }
        ketQua.push({ ref: op.ref, id: id });
      } else if (op.op === 'cancel') {
        const id = timMa(op);
        const i = cnTimViec_(viec, id);
        if (i >= 0) cnGhiO_(viec, i, 'Trạng thái', 'Huỷ', ghi);
        ketQua.push({ ref: op.ref, id: id || '' });
      } else if (op.op === 'done') {
        const id = timMa(op);
        const i = cnTimViec_(viec, id);
        if (i < 0) {
          ketQua.push({ ref: op.ref, id: id || '', loi: 'khong-thay' });
          return;
        }
        const luc = Number(op.at) || bayGio;
        if (!op.repeat) cnGhiO_(viec, i, 'Trạng thái', 'Xong', ghi);
        cnGhiO_(viec, i, 'Người xong', nguoi, ghi);
        cnGhiO_(viec, i, 'Xong lúc', { luc: luc }, ghi);
        cnGhiO_(viec, i, 'Cần hỗ trợ', '', ghi);
        cnGhiNhatKy_(du, them, viec, i, id, op, CN_LOAI.xong, nguoi, luc);
        ketQua.push({ ref: op.ref, id: id });
      } else if (op.op === 'ack' || op.op === 'help') {
        // Đã nhận, Cần hỗ trợ: ô trên trang Nhắc việc ghi lần gần nhất, trang Nhật ký ghi từng lần
        const id = timMa(op);
        const i = cnTimViec_(viec, id);
        if (i < 0) {
          ketQua.push({ ref: op.ref, id: id || '', loi: 'khong-thay' });
          return;
        }
        const luc = Number(op.at) || bayGio;
        const ghiChu = cnChu_(op.note);
        if (op.op === 'ack') cnGhiO_(viec, i, 'Đã nhận', nguoi + ' · ' + cnHienThi_({ luc: luc }), ghi);
        else cnGhiO_(viec, i, 'Cần hỗ trợ', nguoi + ' · ' + cnHienThi_({ luc: luc }) + (ghiChu ? ': ' + ghiChu : ''), ghi);
        cnGhiNhatKy_(du, them, viec, i, id, op, op.op === 'ack' ? CN_LOAI.nhan : CN_LOAI.hoTro, nguoi, luc);
        ketQua.push({ ref: op.ref, id: id });
      } else if (op.op === 'checklist' || op.op === 'checklist-stop') {
        cnXuLyChecklist_(du, op, ghi);
        ketQua.push({ ref: op.ref, id: '' });
      } else if (op.op === 'report') {
        const r = op.report || {};
        const ref = String(op.ref || '');
        const daCo = ref && du.baoCao.dong.some(d => cnChu_(d[9]) === ref);
        if (!daCo) {
          const dongMoi = [{ luc: Number(r.finishedAt) || bayGio }, cnChu_(r.checklist), cnChu_(r.date), cnChu_(r.performer) || nguoi,
            cnChu_(r.result), cnChu_(r.issues), cnChu_(r.todo), cnChu_(r.note), cnChu_(r.detail), ref];
          du.baoCao.dong.push(dongMoi);
          them.push({ trang: 'baoCao', giaTri: dongMoi });
        }
        ketQua.push({ ref: ref, id: '' });
      } else {
        ketQua.push({ ref: op.ref, id: '', loi: 'khong-ro' });
      }
    } catch (loi) {
      ketQua.push({ ref: op.ref, id: '', loi: String(loi && loi.message || loi) });
    }
  });
  return { ghi: ghi, them: them, ketQua: ketQua };
}

/** Loại dòng Nhật ký: dòng ghi trước khi có cột Loại là lần xong */
function cnLoaiDong_(d) {
  return cnChu_(d[6]) || CN_LOAI.xong;
}

/**
 * Một dòng Nhật ký cho lần hạn `op.occ` của việc dòng `i`: Xong, Đã nhận, Cần hỗ trợ (kèm ghi chú, link ảnh). App gửi lại thì
 * không ghi trùng: Xong mỗi lần hạn một dòng, Đã nhận mỗi người một dòng, Cần hỗ trợ trùng người và lý do thì bỏ.
 */
function cnGhiNhatKy_(du, them, viec, i, id, op, loai, nguoi, luc) {
  const occ = String(Number(op.occ) || 0);
  const ghiChu = cnChu_(op.note);
  const daCo = du.nhatKy.dong.some(d => cnChu_(d[1]).toUpperCase() === id.toUpperCase() && cnChu_(d[5]) === occ && cnLoaiDong_(d) === loai
    && (loai === CN_LOAI.xong || (cnChu_(d[4]) === nguoi && (loai === CN_LOAI.nhan || cnChu_(d[7]) === ghiChu))));
  if (daCo) return;
  const cot = ten => {
    const c = cnCot_(viec.tieuDe, ten);
    return c < 0 ? '' : cnChu_(viec.dong[i][c]);
  };
  const dongMoi = [{ luc: luc }, id, cot('Tiêu đề'), { luc: Number(occ) }, nguoi, occ, loai, ghiChu, (op.anh || []).join('\n'), cot('Bộ phận')];
  du.nhatKy.dong.push(dongMoi);
  them.push({ trang: 'nhatKy', giaTri: dongMoi });
}

/**
 * Checklist tạo hay sửa trong app: ghi đè các dòng của checklist đó (tìm theo tên cũ `op.from` khi đổi tên), thiếu thì dùng dòng
 * trống hoặc thêm dòng cuối, thừa thì xoá trắng. `checklist-stop`: ghi Ngưng ở mọi dòng của checklist.
 */
function cnXuLyChecklist_(du, op, ghi) {
  const ck = du.checklist;
  if (!ck || !ck.tieuDe.length) throw new Error('Không thấy trang ' + CN_TRANG.checklist);
  const cotTen = cnCot_(ck.tieuDe, 'Tên checklist');
  const ten = cnChu_(op.name);
  if (cotTen < 0 || !ten) throw new Error('Thiếu tên checklist');
  const khoa = boDau_(op.from || ten);
  const cua = [];
  ck.dong.forEach((d, i) => {
    if (boDau_(d[cotTen]) === khoa) cua.push(i);
  });
  if (op.op === 'checklist-stop') {
    cua.forEach(i => cnGhiOTrang_('checklist', ck, i, 'Trạng thái', 'Ngưng', ghi));
    return;
  }
  // Dòng trống dùng lại được phải nằm sau các dòng của checklist, để đọc về các việc vẫn đúng thứ tự
  const sau = cua.length ? cua[cua.length - 1] : -1;
  const trong = [];
  ck.dong.forEach((d, i) => {
    if (i > sau && d.every(o => !cnChu_(o))) trong.push(i);
  });
  (op.rows || []).forEach((dong, n) => {
    let i = n < cua.length ? cua[n] : trong.shift();
    if (i === undefined) {
      ck.dong.push(ck.tieuDe.map(() => ''));
      i = ck.dong.length - 1;
    }
    // Chỉ ghi các cột app gửi; cột quản lý tự thêm thì giữ nguyên
    Object.keys(dong).forEach(tenCot => cnGhiOTrang_('checklist', ck, i, tenCot, dong[tenCot], ghi));
  });
  cua.slice((op.rows || []).length).forEach(i => {
    ck.tieuDe.forEach(tenCot => cnGhiOTrang_('checklist', ck, i, tenCot, '', ghi));
  });
}

/** Các lần xong gần đây ở trang Nhật ký: app dùng để biết lần nào của việc lặp lại đã xong ở máy khác */
function cnLanXong_(dongNhatKy, tu) {
  const out = [];
  dongNhatKy.forEach(d => {
    const occ = Number(cnChu_(d[5]));
    const id = cnChu_(d[1]);
    if (id && occ && occ >= tu && cnLoaiDong_(d) === CN_LOAI.xong) out.push({ id: id, occ: occ, by: cnChu_(d[4]) });
  });
  return out;
}

/** Ô ngày giờ của trang (giá trị ngày, hoặc chữ dd/mm/yyyy hh:mm) → ms */
function cnLuc_(v) {
  if (v && typeof v.getTime === 'function') return v.getTime();
  const m = cnChu_(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime() : 0;
}

/** Mọi dòng Nhật ký gần đây (Xong, Đã nhận, Cần hỗ trợ) kèm ghi chú và link ảnh, để máy quản lý thấy ai đã nhận, ai cần hỗ trợ */
function cnSuKien_(dongNhatKy, tu) {
  const out = [];
  const LOAI = {};
  LOAI[CN_LOAI.xong] = 'xong';
  LOAI[CN_LOAI.nhan] = 'nhan';
  LOAI[CN_LOAI.hoTro] = 'hotro';
  dongNhatKy.forEach(d => {
    const occ = Number(cnChu_(d[5]));
    const id = cnChu_(d[1]);
    const loai = LOAI[cnLoaiDong_(d)];
    if (!id || !occ || occ < tu || !loai) return;
    const anh = cnChu_(d[8]).split(/\s*\n\s*/).filter(x => /^https?:\/\//.test(x));
    out.push({ id: id, occ: occ, loai: loai, by: cnChu_(d[4]), at: cnLuc_(d[0]), note: cnChu_(d[7]), anh: anh });
  });
  return out;
}

/** Bảng gửi về app: bỏ các dòng chưa ghi gì (giữ chỗ để số dòng báo lỗi vẫn đúng) và các dòng trống ở cuối */
function cnGonBang_(dong, cotKhoa) {
  let cuoi = 0;
  const out = dong.map((d, i) => {
    const coChu = i === 0 || cnChu_(d[cotKhoa]) !== '';
    if (coChu) cuoi = i + 1;
    return coChu ? d.map(cnChu_) : [];
  });
  return out.slice(0, Math.max(cuoi, 1));
}

/** Giao việc nhanh: ô trong khung nhập → dòng của trang Nhắc việc */
function cnDongTuForm_(f) {
  const ngay = cnChu_(f.ngay);
  return {
    'Tiêu đề': cnChu_(f.tieuDe),
    'Nội dung': cnChu_(f.noiDung),
    'Ngày hạn': /^\d{4}-\d{2}-\d{2}$/.test(ngay) ? { ngay: ngay } : '',
    'Giờ hạn': cnChu_(f.gio),
    'Người xử lý': cnChu_(f.nguoiXuLy),
    'Mức độ': cnChu_(f.mucDo),
    'Nhắc trước': cnChu_(f.nhacTruoc),
    'Lặp lại': cnChu_(f.lapLai),
    'Âm thanh': cnChu_(f.amThanh),
    'Câu đọc': cnChu_(f.cauDoc),
    'Checklist': cnChu_(f.checklist),
    'Người giao': cnChu_(f.nguoiGiao),
    'Bộ phận': cnChu_(f.boPhan),
    'Khi xong cần': cnChu_(f.khiXong),
  };
}

// ==================== Đọc, ghi trang ====================

function cnLoi_(ma, thongBao) {
  const e = new Error(thongBao || ma);
  e.ma = ma;
  return e;
}

function cnJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cnBaoVe_(viec) {
  try {
    return viec();
  } catch (e) {
    return { ok: false, error: e && e.ma ? e.ma : 'loi', message: String(e && e.message || e) };
  }
}

/** Mã bí mật trong Link kết nối. Tạo mới khi chưa có hoặc file là bản sao của file khác (bản sao không dùng chung mã). */
function cnKhoa_() {
  const props = PropertiesService.getScriptProperties();
  const fileId = SpreadsheetApp.getActiveSpreadsheet().getId();
  let khoa = props.getProperty('khoa');
  if (!khoa || props.getProperty('khoaChoFile') !== fileId) {
    khoa = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperties({ khoa: khoa, khoaChoFile: fileId });
  }
  return khoa;
}

function cnKiemKhoa_(k) {
  if (!k || String(k) !== cnKhoa_()) throw cnLoi_('key', 'Link kết nối không đúng hoặc đã đổi mã.');
}

function cnNho_() {
  const cache = CacheService.getScriptCache();
  return {
    lay: ref => cache.get('ref:' + ref),
    dat: (ref, id) => cache.put('ref:' + ref, id, 21600),
  };
}

function cnTrang_(ss, khoa) {
  const sheet = ss.getSheetByName(CN_TRANG[khoa]);
  if (!sheet) throw cnLoi_('mau', 'Không thấy trang ' + CN_TRANG[khoa] + '. Đừng đổi tên các trang của file mẫu.');
  return sheet;
}

/**
 * Thêm cột còn thiếu (Người xong, Xong lúc, Bộ phận, Khi xong cần, Đã nhận, Cần hỗ trợ), các trang Nhật ký, Báo cáo checklist,
 * Tổng quan nếu file chưa có (file tạo từ mẫu cũ). Chạy mỗi lần app ghi, đã đủ thì không làm gì.
 */
function cnDamBaoCauTruc_(ss) {
  const viec = cnTrang_(ss, 'viec');
  const tieuDe = viec.getRange(1, 1, 1, viec.getLastColumn()).getDisplayValues()[0];
  CN_COT_THEM.forEach(c => {
    if (cnCot_(tieuDe, c.ten) >= 0) return;
    const cot = tieuDe.length + 1;
    if (viec.getMaxColumns() < cot) viec.insertColumnsAfter(viec.getMaxColumns(), cot - viec.getMaxColumns());
    viec.getRange(1, 1).copyTo(viec.getRange(1, cot), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    viec.getRange(1, cot).setValue(c.ten).setNote(c.ghiChu);
    viec.setColumnWidth(cot, c.rong);
    const vung = viec.getRange(2, cot, Math.max(viec.getMaxRows() - 1, 1), 1);
    vung.setNumberFormat(c.ten === 'Xong lúc' ? 'dd/mm/yyyy hh:mm' : '@').setHorizontalAlignment(c.rong > 160 ? 'left' : 'center');
    // Danh sách chọn, vẫn cho gõ tên khác (bộ phận riêng của cửa hàng)
    if (c.chon) vung.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(c.chon, true).setAllowInvalid(true).build());
    tieuDe.push(c.ten);
  });
  cnTaoTrang_(ss, 'nhatKy', CN_NHAT_KY, [150, 80, 300, 150, 150, 120, 110, 280, 260, 100], '#7c3aed', 'Mỗi lần ai đó bấm Đã xong, Đã nhận hay Cần hỗ trợ trong app, app ghi một dòng ở đây.');
  cnThemCotNhatKy_(ss);
  cnTaoTrang_(ss, 'baoCao', CN_BAO_CAO, [150, 180, 95, 140, 85, 85, 85, 260, 420, 120], '#047857', 'Mỗi lượt checklist hoàn tất trong app, app ghi một dòng báo cáo ở đây.');
  const checklist = ss.getSheetByName(CN_TRANG.checklist);
  if (checklist && checklist.getLastColumn() > 0) {
    const cotCk = checklist.getRange(1, 1, 1, checklist.getLastColumn()).getDisplayValues()[0];
    if (cnCot_(cotCk, 'Bộ phận') < 0) {
      const cot = cotCk.length + 1;
      if (checklist.getMaxColumns() < cot) checklist.insertColumnsAfter(checklist.getMaxColumns(), cot - checklist.getMaxColumns());
      checklist.getRange(1, 1).copyTo(checklist.getRange(1, cot), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      checklist.getRange(1, cot).setValue('Bộ phận').setNote('Bộ phận làm checklist này. Để trống là máy nào cũng nhắc.');
      checklist.setColumnWidth(cot, 110);
      checklist.getRange(2, cot, Math.max(checklist.getMaxRows() - 1, 1), 1)
        .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CN_BO_PHAN, true).setAllowInvalid(true).build());
    }
  }
  cnTaoTongQuan_(ss, tieuDe);
}

/** Nhật ký của file cũ: đổi tên cột Lúc xong, Người xong; thêm cột Loại, Ghi chú, Ảnh, Bộ phận */
function cnThemCotNhatKy_(ss) {
  const sheet = ss.getSheetByName(CN_TRANG.nhatKy);
  if (!sheet) return;
  if (sheet.getMaxColumns() < CN_NHAT_KY.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), CN_NHAT_KY.length - sheet.getMaxColumns());
  const hien = sheet.getRange(1, 1, 1, CN_NHAT_KY.length).getDisplayValues()[0];
  if (cnChu_(hien[6]) === CN_NHAT_KY[6]) return;
  if (boDau_(hien[0]) === 'luc xong') sheet.getRange(1, 1).setValue(CN_NHAT_KY[0]);
  if (boDau_(hien[4]) === 'nguoi xong') sheet.getRange(1, 5).setValue(CN_NHAT_KY[4]);
  sheet.getRange(1, 2).copyTo(sheet.getRange(1, 7, 1, 4), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sheet.getRange(1, 7, 1, 4).setValues([CN_NHAT_KY.slice(6)]);
  sheet.getRange(2, 7, Math.max(sheet.getMaxRows() - 1, 1), 4).setNumberFormat('@');
  [110, 280, 260, 100].forEach((r, n) => sheet.setColumnWidth(7 + n, r));
  sheet.getRange(1, 1).setNote('Mỗi lần ai đó bấm Đã xong, Đã nhận hay Cần hỗ trợ trong app, app ghi một dòng ở đây.');
}

/** Chữ cột của trang tính: 1 → A, 27 → AA */
function cnChuCot_(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Trang Tổng quan (quản lý xem trên điện thoại, không cần app): theo người hôm nay và 30 ngày qua (đã nhận, đã xong, xong trễ, cần
 * hỗ trợ), các lần cần hỗ trợ 7 ngày qua, việc một lần đang quá hạn. Toàn công thức, tự tính lại khi mở file. Trang Nhắc việc: dòng
 * quá hạn tô đỏ, dòng đang cần hỗ trợ tô vàng.
 */
function cnTaoTongQuan_(ss, tieuDe) {
  if (ss.getSheetByName(CN_TRANG.tongQuan)) return;
  const sheet = ss.insertSheet(CN_TRANG.tongQuan, 0);
  const nk = "'" + CN_TRANG.nhatKy + "'!";
  const nv = "'" + CN_TRANG.viec + "'!";
  sheet.getRange('A1').setValue('TỔNG QUAN NHẮC VIỆC').setFontSize(16).setFontWeight('bold').setFontColor('#0f172a');
  sheet.getRange('A2').setValue('Tự tính lại khi mở file. Số liệu lấy ở trang Nhắc việc và Nhật ký; Người là tên đặt trong app ở máy bấm.')
    .setFontColor('#64748b');
  const khoi = (cot, ten, tieuDeCot, mau) => {
    sheet.getRange(4, cot).setValue(ten).setFontWeight('bold').setFontColor(mau);
    sheet.getRange(5, cot, 1, tieuDeCot.length).setValues([tieuDeCot]).setBackground(mau).setFontColor('#ffffff').setFontWeight('bold')
      .setWrap(true).setHorizontalAlignment('center');
  };
  // Theo người: Đã nhận, Đã xong, Xong trễ, Cần hỗ trợ (dòng cũ chưa có cột Loại là lần xong)
  const theoNguoi = (cot, ten, tu) => {
    khoi(cot, ten, ['Người', 'Đã nhận', 'Đã xong', 'Xong trễ', 'Cần hỗ trợ'], '#0369a1');
    const c = cnChuCot_(cot);
    const dk = nk + 'E2:E, p, ' + nk + 'A2:A, ">="&(' + tu + ')';
    const xong = 'COUNTIFS(' + dk + ', ' + nk + 'G2:G, "Xong") + COUNTIFS(' + dk + ', ' + nk + 'G2:G, "")';
    const tre = 'SUMPRODUCT((' + nk + 'E2:E=p)*(' + nk + 'A2:A>=' + tu + ')*((' + nk + 'G2:G="Xong")+(' + nk + 'G2:G=""))*(' + nk + 'D2:D<>"")*(' + nk + 'A2:A>' + nk + 'D2:D))';
    const moi = f => '=MAP(' + c + '6:' + c + '60, LAMBDA(p, IF(OR(p="", p="Chưa có"), "", ' + f + ')))';
    sheet.getRange(6, cot).setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + nk + 'E2:E, ' + nk + 'E2:E<>"", ' + nk + 'A2:A>=' + tu + '))), "Chưa có")');
    sheet.getRange(6, cot + 1).setFormula(moi('COUNTIFS(' + dk + ', ' + nk + 'G2:G, "Đã nhận")'));
    sheet.getRange(6, cot + 2).setFormula(moi(xong));
    sheet.getRange(6, cot + 3).setFormula(moi(tre));
    sheet.getRange(6, cot + 4).setFormula(moi('COUNTIFS(' + dk + ', ' + nk + 'G2:G, "Cần hỗ trợ")'));
    sheet.setColumnWidth(cot, 150);
    [1, 2, 3, 4].forEach(n => sheet.setColumnWidth(cot + n, 80));
  };
  theoNguoi(1, 'HÔM NAY', 'TODAY()');
  theoNguoi(7, '30 NGÀY QUA', 'TODAY()-29');
  khoi(13, 'CẦN HỖ TRỢ · 7 NGÀY QUA', ['Lúc', 'Mã việc', 'Việc', 'Người', 'Lý do', 'Ảnh'], '#b45309');
  sheet.getRange(6, 13).setFormula('=IFERROR(SORT(FILTER(CHOOSECOLS(' + nk + 'A2:I, 1, 2, 3, 5, 8, 9), ' + nk + 'G2:G="Cần hỗ trợ", '
    + nk + 'A2:A>=TODAY()-6), 1, FALSE), "Không có")');
  sheet.getRange(6, 13, 200, 1).setNumberFormat('dd/mm hh:mm');
  [95, 70, 220, 130, 260, 200].forEach((r, n) => sheet.setColumnWidth(13 + n, r));
  khoi(20, 'VIỆC MỘT LẦN ĐANG QUÁ HẠN', ['Mã việc', 'Tiêu đề', 'Bộ phận', 'Người xử lý', 'Hạn', 'Đã nhận'], '#be123c');
  const cot = ten => cnCot_(tieuDe, ten) + 1;
  const canCo = ['Mã việc', 'Tiêu đề', 'Ngày hạn', 'Giờ hạn', 'Trạng thái', 'Lặp lại', 'Người xử lý', 'Bộ phận', 'Đã nhận', 'Cần hỗ trợ'];
  if (canCo.every(ten => cot(ten) > 0)) {
    const r = ten => nv + cnChuCot_(cot(ten)) + '2:' + cnChuCot_(cot(ten));
    const han = r('Ngày hạn') + '+IFERROR(TIMEVALUE(TO_TEXT(' + r('Giờ hạn') + ')), 17/24)';
    sheet.getRange(6, 20).setFormula('=ARRAYFORMULA(IFERROR(SORT(FILTER(HSTACK(' + [r('Mã việc'), r('Tiêu đề'), r('Bộ phận'), r('Người xử lý')].join(', ')
      + ', ' + han + ', ' + r('Đã nhận') + '), ' + r('Tiêu đề') + '<>"", ' + r('Trạng thái') + '="Đang giao", (' + r('Lặp lại') + '="Không lặp")+(' + r('Lặp lại')
      + '=""), ' + r('Ngày hạn') + '<>"", ' + han + '<NOW()), 5, TRUE), "Không có"))');
    sheet.getRange(6, 24, 200, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    // Trang Nhắc việc: dòng quá hạn tô đỏ, dòng đang cần hỗ trợ tô vàng
    const o = ten => '$' + cnChuCot_(cot(ten)) + '2';
    const viec = cnTrang_(ss, 'viec');
    const vung = viec.getRange(2, 1, Math.max(viec.getMaxRows() - 1, 1), tieuDe.length);
    const quaHan = '=AND(' + o('Tiêu đề') + '<>"", ' + o('Trạng thái') + '="Đang giao", OR(' + o('Lặp lại') + '="Không lặp", ' + o('Lặp lại') + '=""), '
      + o('Ngày hạn') + '<>"", ' + o('Ngày hạn') + '+IFERROR(TIMEVALUE(TO_TEXT(' + o('Giờ hạn') + ')), 17/24)<NOW())';
    const hoTro = '=AND(' + o('Tiêu đề') + '<>"", ' + o('Trạng thái') + '="Đang giao", ' + o('Cần hỗ trợ') + '<>"")';
    const quyTac = viec.getConditionalFormatRules();
    quyTac.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(quaHan).setBackground('#fee2e2').setRanges([vung]).build());
    quyTac.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(hoTro).setBackground('#fef3c7').setRanges([vung]).build());
    viec.setConditionalFormatRules(quyTac);
  } else {
    sheet.getRange(6, 20).setValue('File mẫu cũ chưa có đủ cột ' + canCo.filter(ten => cot(ten) <= 0).join(', '));
  }
  [80, 240, 100, 140, 125, 170].forEach((r, n) => sheet.setColumnWidth(20 + n, r));
  sheet.setFrozenRows(5);
  sheet.setTabColor('#0369a1');
}

function cnTaoTrang_(ss, khoa, cot, rong, mau, ghiChu) {
  if (ss.getSheetByName(CN_TRANG[khoa])) return;
  const sheet = ss.insertSheet(CN_TRANG[khoa]);
  sheet.getRange(1, 1, 1, cot.length).setValues([cot]).setBackground(mau).setFontColor('#ffffff').setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  sheet.getRange(1, 1).setNote(ghiChu);
  sheet.setRowHeight(1, 40);
  rong.forEach((r, i) => sheet.setColumnWidth(i + 1, r));
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sheet.getRange(2, 2, sheet.getMaxRows() - 1, cot.length - 1).setNumberFormat('@');
  if (khoa === 'nhatKy') sheet.getRange(2, 4, sheet.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  if (khoa === 'baoCao') sheet.getRange(2, 1, sheet.getMaxRows() - 1, cot.length).setWrap(true).setVerticalAlignment('top');
  // Cột cuối app dùng để nhận ra dòng đã ghi, ẩn đi cho gọn
  sheet.hideColumns(cot.length);
  sheet.setTabColor(mau);
}

function cnDuLieu_(ss) {
  const viec = cnTrang_(ss, 'viec');
  const bang = viec.getDataRange().getDisplayValues();
  const docGiaTri = khoa => {
    const sheet = ss.getSheetByName(CN_TRANG[khoa]);
    return sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  };
  const checklistSheet = ss.getSheetByName(CN_TRANG.checklist);
  const checklist = checklistSheet && checklistSheet.getLastColumn() > 0 ? checklistSheet.getDataRange().getDisplayValues() : [];
  return {
    viec: { tieuDe: bang[0], dong: bang.slice(1) },
    nhatKy: { dong: docGiaTri('nhatKy') },
    baoCao: { dong: docGiaTri('baoCao') },
    checklist: checklist.length ? { tieuDe: checklist[0], dong: checklist.slice(1) } : null,
  };
}

function cnGiaTriO_(v, tz) {
  if (v && v.ngay) return Utilities.parseDate(v.ngay, tz, 'yyyy-MM-dd');
  if (v && v.luc) return new Date(v.luc);
  return v == null ? '' : v;
}

function cnGhiTrang_(ss, kq) {
  const tz = ss.getSpreadsheetTimeZone();
  kq.ghi.forEach(o => {
    const sheet = cnTrang_(ss, o.trang);
    if (sheet.getMaxRows() < o.dong) sheet.insertRowsAfter(sheet.getMaxRows(), o.dong - sheet.getMaxRows());
    sheet.getRange(o.dong, o.cot).setValue(cnGiaTriO_(o.giaTri, tz));
  });
  kq.them.forEach(o => {
    cnTrang_(ss, o.trang).appendRow(o.giaTri.map(v => cnGiaTriO_(v, tz)));
  });
}

/** Thay đổi dữ liệu: khoá để hai máy gửi cùng lúc không ghi đè nhau */
function cnThayDoi_(lam) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    cnDamBaoCauTruc_(ss);
    const kq = lam(ss, cnDuLieu_(ss));
    cnGhiTrang_(ss, kq);
    SpreadsheetApp.flush();
    return kq;
  } finally {
    lock.releaseLock();
  }
}

function cnBam_(chu) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, chu, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function cnDanhSach_(sheet, cot) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const out = [];
  sheet.getRange(2, cot, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(d => {
    const ten = cnChu_(d[0]);
    if (ten && out.indexOf(ten) < 0) out.push(ten);
  });
  return out;
}

/** Toàn bộ dữ liệu app cần, kèm dấu phiên bản để app hỏi "có gì đổi không" mà không phải tải lại cả file */
function cnDoc_(ss) {
  const viec = cnTrang_(ss, 'viec').getDataRange().getDisplayValues();
  const checklistSheet = ss.getSheetByName(CN_TRANG.checklist);
  const checklist = checklistSheet ? checklistSheet.getDataRange().getDisplayValues() : [];
  const nhatKySheet = ss.getSheetByName(CN_TRANG.nhatKy);
  const nhatKy = nhatKySheet && nhatKySheet.getLastRow() > 1
    ? nhatKySheet.getRange(2, 1, nhatKySheet.getLastRow() - 1, Math.min(CN_NHAT_KY.length, nhatKySheet.getMaxColumns())).getValues() : [];
  const tu = Date.now() - CN_NHAT_KY_NGAY * 86400000;
  const danhMuc = ss.getSheetByName(CN_TRANG.danhMuc);
  const tables = [{ name: CN_TRANG.viec, rows: cnGonBang_(viec, Math.max(cnCot_(viec[0] || [], 'Tiêu đề'), 0)) }];
  if (checklist.length) tables.push({ name: CN_TRANG.checklist, rows: cnGonBang_(checklist, 0) });
  return {
    title: ss.getName(),
    sheetUrl: ss.getUrl(),
    tables: tables,
    doneLog: cnLanXong_(nhatKy, tu),
    events: cnSuKien_(nhatKy, tu),
    staff: cnDanhSach_(danhMuc, 1),
    assigners: cnDanhSach_(danhMuc, 2),
  };
}

/** Thư mục Drive chứa ảnh nhân viên gửi kèm (cạnh file, tạo lần đầu) */
function cnThuMucAnh_(ss) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('thuMucAnh');
  if (id && props.getProperty('thuMucAnhChoFile') === ss.getId()) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // Thư mục đã xoá: tạo lại
    }
  }
  const cha = DriveApp.getFileById(ss.getId()).getParents();
  const folder = (cha.hasNext() ? cha.next() : DriveApp.getRootFolder()).createFolder('Ảnh nhắc việc - ' + ss.getName());
  props.setProperties({ thuMucAnh: folder.getId(), thuMucAnhChoFile: ss.getId() });
  return folder;
}

/** Ảnh app gửi kèm (JPEG base64) → file trong Drive; thao tác giữ link ảnh ở `anh` để ghi Nhật ký */
function cnLuuAnh_(ss, ops) {
  ops.forEach(op => {
    if (!op || !Array.isArray(op.photos) || !op.photos.length) return;
    const links = [];
    try {
      const thuMuc = cnThuMucAnh_(ss);
      op.photos.slice(0, CN_ANH_TOI_DA).forEach((anh, n) => {
        const ten = cnChu_(anh && anh.name) || ('anh-' + (n + 1) + '.jpg');
        const file = thuMuc.createFile(Utilities.newBlob(Utilities.base64Decode(String(anh && anh.data || '')), 'image/jpeg', ten));
        links.push(file.getUrl());
      });
    } catch (e) {
      links.push('Chưa lưu được ảnh: ' + String(e && e.message || e) + '. Quản lý mở file, menu Nhắc việc → Cập nhật file cho app mới.');
    }
    op.anh = links;
    delete op.photos;
  });
}

// ==================== App gọi vào ====================

/** App đọc dữ liệu: ?k=mã&since=dấu phiên bản lần trước */
function doGet(e) {
  return cnJson_(cnBaoVe_(() => {
    const p = (e && e.parameter) || {};
    cnKiemKhoa_(p.k);
    const doc = cnDoc_(SpreadsheetApp.getActiveSpreadsheet());
    const version = cnBam_(JSON.stringify([CN_PHIEN_BAN, doc.tables, doc.events, doc.staff, doc.assigners]));
    if (p.since && p.since === version) return { ok: true, v: CN_PHIEN_BAN, unchanged: true, version: version };
    doc.ok = true;
    doc.v = CN_PHIEN_BAN;
    doc.version = version;
    return doc;
  }));
}

/** App gửi thay đổi lên Link kết nối (?k=mã): { by, ops: [...] } */
function doPost(e) {
  return cnJson_(cnBaoVe_(() => {
    const yeuCau = JSON.parse(e.postData.contents);
    cnKiemKhoa_((e.parameter && e.parameter.k) || yeuCau.k);
    const nguoi = cnChu_(yeuCau.by) || 'Máy chưa đặt tên';
    const ops = Array.isArray(yeuCau.ops) ? yeuCau.ops : [];
    // Ảnh lưu vào Drive trước (ngoài khoá, để máy khác không phải chờ), Nhật ký ghi link ảnh
    cnLuuAnh_(SpreadsheetApp.getActiveSpreadsheet(), ops);
    const kq = cnThayDoi_((ss, du) => cnXuLy_(du, ops, nguoi, Date.now(), cnNho_()));
    return { ok: true, v: CN_PHIEN_BAN, results: kq.ketQua };
  }));
}

// ==================== Menu cho quản lý ====================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Nhắc việc')
    .addItem('Giao việc nhanh…', 'moGiaoViecNhanh')
    .addItem('Nhân bản dòng đang chọn', 'nhanBanDongDangChon')
    .addItem('Đánh dấu xong dòng đang chọn', 'danhDauXongDongDangChon')
    .addSeparator()
    .addItem('Bật đồng bộ hai chiều…', 'moBatDongBo')
    .addItem('Cập nhật file cho app mới', 'capNhatFileChoAppMoi')
    .addToUi();
}

/**
 * Sau khi dán script mới: thêm cột, trang còn thiếu (Tổng quan…) và hỏi quyền lưu ảnh vào Drive một lần. Rồi Triển khai → Quản lý
 * bản triển khai → bút chì → Phiên bản mới → Triển khai, Link kết nối giữ nguyên.
 */
function capNhatFileChoAppMoi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  cnDamBaoCauTruc_(ss);
  const thuMuc = cnThuMucAnh_(ss);
  SpreadsheetApp.getUi().alert('Đã cập nhật file: có cột Bộ phận, Khi xong cần, Đã nhận, Cần hỗ trợ và trang Tổng quan. Ảnh nhân viên gửi lưu ở thư mục "'
    + thuMuc.getName() + '" cạnh file.\n\nBước cuối: Tiện ích mở rộng → Apps Script → Triển khai → Quản lý bản triển khai → bút chì → Phiên bản: Phiên bản mới → Triển khai.');
}

function cnDongDangChon_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== CN_TRANG.viec) {
    SpreadsheetApp.getUi().alert('Chọn một hoặc nhiều dòng ở trang ' + CN_TRANG.viec + ' rồi bấm lại.');
    return null;
  }
  const dong = [];
  (sheet.getActiveRangeList() ? sheet.getActiveRangeList().getRanges() : [sheet.getActiveRange()]).forEach(r => {
    for (let i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) if (i >= 2 && dong.indexOf(i) < 0) dong.push(i);
  });
  return { ss: ss, sheet: sheet, dong: dong.sort((a, b) => a - b) };
}

function nhanBanDongDangChon() {
  const chon = cnDongDangChon_();
  if (!chon) return;
  const daTao = [];
  cnThayDoi_((ss, du) => {
    const viec = du.viec;
    const cotTieuDe = cnCot_(viec.tieuDe, 'Tiêu đề');
    const giaTri = chon.sheet.getRange(1, 1, chon.sheet.getLastRow(), viec.tieuDe.length).getValues();
    const ghi = [];
    chon.dong.forEach(soDong => {
      const goc = giaTri[soDong - 1];
      if (!goc || !cnChu_(goc[cotTieuDe])) return;
      const cho = cnChoViecMoi_(viec, ghi);
      viec.tieuDe.forEach((ten, c) => {
        const k = boDau_(ten);
        if (k === 'ma viec') return;
        let v = goc[c];
        if (k === 'trang thai') v = 'Đang giao';
        if (k === 'nguoi xong' || k === 'xong luc') v = '';
        if (v === '' || v == null) return;
        viec.dong[cho.i][c] = v instanceof Date ? 'x' : cnChu_(v);
        ghi.push({ trang: 'viec', dong: cho.i + 2, cot: c + 1, giaTri: v });
      });
      daTao.push(cho.id);
    });
    return { ghi: ghi, them: [], ketQua: [] };
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(daTao.length
    ? 'Đã nhân bản ' + daTao.length + ' việc: ' + daTao.join(', ') + '. Sửa ngày hạn, người xử lý nếu cần.'
    : 'Dòng đang chọn chưa có tiêu đề.', 'Nhắc việc', 6);
}

function danhDauXongDongDangChon() {
  const chon = cnDongDangChon_();
  if (!chon) return;
  let soViec = 0;
  cnThayDoi_((ss, du) => {
    const ghi = [];
    chon.dong.forEach(soDong => {
      const i = soDong - 2;
      if (!du.viec.dong[i] || !cnChu_(du.viec.dong[i][cnCot_(du.viec.tieuDe, 'Tiêu đề')])) return;
      cnGhiO_(du.viec, i, 'Trạng thái', 'Xong', ghi);
      cnGhiO_(du.viec, i, 'Người xong', 'Quản lý', ghi);
      cnGhiO_(du.viec, i, 'Xong lúc', { luc: Date.now() }, ghi);
      soViec++;
    });
    return { ghi: ghi, them: [], ketQua: [] };
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('Đã đánh dấu xong ' + soViec + ' việc.', 'Nhắc việc', 4);
}

// ---------- Giao việc nhanh ----------

function cnLuaChon_(ds, chon) {
  return ds.map(v => '<option' + (v === chon ? ' selected' : '') + '>' + cnHtml_(v) + '</option>').join('');
}

function cnHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CN_KIEU = '<style>'
  + 'body{font-family:Roboto,Arial,sans-serif;font-size:13px;color:#0f172a;margin:0;padding:12px}'
  + 'label{display:block;font-weight:600;color:#475569;margin:10px 0 4px}'
  + 'input,select,textarea{width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}'
  + 'textarea{resize:vertical}'
  + '.hai{display:flex;gap:8px}.hai>div{flex:1}'
  + 'button{margin-top:14px;width:100%;padding:10px;border:0;border-radius:8px;background:#0369a1;color:#fff;font-weight:700;font-size:14px;cursor:pointer}'
  + 'button.phu{background:#e2e8f0;color:#0f172a}'
  + '.bao{margin-top:10px;padding:8px 10px;border-radius:8px;background:#ecfdf5;color:#047857;display:none}'
  + '.loi{background:#fee2e2;color:#b91c1c}'
  + 'ol{padding-left:18px;margin:6px 0}li{margin:6px 0;line-height:1.45}'
  + '.link{font-family:monospace;font-size:12px;word-break:break-all;background:#f1f5f9;border-radius:8px;padding:8px}'
  + '.nho{color:#64748b;font-size:12px}'
  + '</style>';

function moGiaoViecNhanh() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const danhMuc = ss.getSheetByName(CN_TRANG.danhMuc);
  const nhanVien = cnDanhSach_(danhMuc, 1);
  const nguoiGiao = cnDanhSach_(danhMuc, 2);
  const checklist = cnDanhSach_(ss.getSheetByName(CN_TRANG.checklist), 1);
  const homNay = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const html = CN_KIEU
    + '<form id="f" onsubmit="giao(event)">'
    + '<label>Tiêu đề *</label><input name="tieuDe" required autofocus>'
    + '<label>Nội dung</label><textarea name="noiDung" rows="3"></textarea>'
    + '<div class="hai"><div><label>Ngày hạn *</label><input type="date" name="ngay" value="' + homNay + '" required></div>'
    + '<div><label>Giờ hạn</label><input type="time" name="gio" value="17:00"></div></div>'
    + '<div class="hai"><div><label>Bộ phận</label><select name="boPhan"><option value="">Chung</option>' + cnLuaChon_(CN_BO_PHAN, '') + '</select></div>'
    + '<div><label>Người xử lý</label><select name="nguoiXuLy"><option value="">Việc chung</option>' + cnLuaChon_(nhanVien, '') + '</select></div></div>'
    + '<div class="hai"><div><label>Mức độ</label><select name="mucDo">' + cnLuaChon_(CN_MUC_DO, 'Thường') + '</select></div>'
    + '<div><label>Lặp lại</label><select name="lapLai">' + cnLuaChon_(CN_LAP_LAI, 'Không lặp') + '</select></div></div>'
    + '<label>Nhắc trước</label><select name="nhacTruoc">' + cnLuaChon_(CN_NHAC_TRUOC, '15 phút + đúng hạn') + '</select>'
    + '<div class="hai"><div><label>Âm thanh</label><select name="amThanh">' + cnLuaChon_(CN_AM_THANH, 'Chuông reo') + '</select></div>'
    + '<div><label>Checklist</label><select name="checklist"><option value="">Không</option>' + cnLuaChon_(checklist, '') + '</select></div></div>'
    + '<label>Câu đọc (khi Âm thanh là Đọc chữ)</label><input name="cauDoc">'
    + '<label>Khi xong cần</label><select name="khiXong"><option value="">Không cần gì</option>' + cnLuaChon_(CN_KHI_XONG, '') + '</select>'
    + '<label>Người giao</label><select name="nguoiGiao"><option value="">-</option>' + cnLuaChon_(nguoiGiao, nguoiGiao[0] || '') + '</select>'
    + '<button id="nut">Giao việc</button>'
    + '<div id="bao" class="bao"></div>'
    + '<p class="nho">Giao xong, khung giữ nguyên người, giờ, mức độ để giao tiếp việc khác cho nhanh. Các máy nhận việc trong khoảng 1 phút.</p>'
    + '</form>'
    + '<script>'
    + 'function giao(e){e.preventDefault();var f=document.getElementById("f"),d={};'
    + 'Array.prototype.forEach.call(f.elements,function(x){if(x.name)d[x.name]=x.value;});'
    + 'var nut=document.getElementById("nut"),bao=document.getElementById("bao");nut.disabled=true;nut.textContent="Đang giao…";'
    + 'google.script.run.withSuccessHandler(function(id){nut.disabled=false;nut.textContent="Giao việc";bao.className="bao";bao.style.display="block";'
    + 'bao.textContent="Đã giao "+id+": "+d.tieuDe;f.tieuDe.value="";f.noiDung.value="";f.cauDoc.value="";f.tieuDe.focus();})'
    + '.withFailureHandler(function(err){nut.disabled=false;nut.textContent="Giao việc";bao.className="bao loi";bao.style.display="block";bao.textContent=err.message;})'
    + '.giaoViecTuForm(d);}'
    + '</script>';
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle('Giao việc nhanh'));
}

/** Khung Giao việc nhanh gọi vào: ghi việc vào dòng trống đầu tiên, trả về mã việc */
function giaoViecTuForm(f) {
  if (!cnChu_(f && f.tieuDe)) throw new Error('Nhập tiêu đề.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cnChu_(f.ngay))) throw new Error('Chọn ngày hạn.');
  const kq = cnThayDoi_((ss, du) => cnXuLy_(du, [{ op: 'upsert', row: cnDongTuForm_(f) }], cnChu_(f.nguoiGiao) || 'Quản lý', Date.now(), { lay: () => null, dat: () => null }));
  const id = kq.ketQua[0] && kq.ketQua[0].id;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CN_TRANG.viec);
  const i = cnTimViec_({ dong: sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues() }, id);
  if (i >= 0) sheet.getRange(i + 2, 2).activate();
  return id;
}

// ---------- Bật đồng bộ hai chiều ----------

/**
 * URL ứng dụng web quản lý đã dán cho chính file này. Không đoán bằng ScriptApp.getService().getUrl(): hàm đó có lúc trả về mã
 * triển khai không có thật, máy dán link vào thì báo không tìm thấy cầu nối. Bản sao của file khác không mang URL theo.
 */
function cnUrlUngDung_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('urlUngDung');
  return url && props.getProperty('urlChoFile') === SpreadsheetApp.getActiveSpreadsheet().getId() ? url : '';
}

/** Khung bên phải gọi vào: tình trạng đồng bộ và Link kết nối */
function layThongTinDongBo() {
  const url = cnUrlUngDung_();
  return { url: url, link: url ? url + '?k=' + cnKhoa_() : '' };
}

/** Lưu URL ứng dụng web quản lý vừa sao chép sau khi triển khai */
function luuUrlUngDung(url) {
  const u = cnChu_(url);
  if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(u)) {
    throw new Error('Đây chưa phải URL ứng dụng web. URL đúng bắt đầu bằng https://script.google.com/macros/s/ và kết thúc bằng /exec.');
  }
  PropertiesService.getScriptProperties().setProperties({ urlUngDung: u, urlChoFile: SpreadsheetApp.getActiveSpreadsheet().getId() });
  return layThongTinDongBo();
}

/** Đổi mã: Link kết nối cũ hết dùng được (khi lỡ gửi nhầm người) */
function doiMaKetNoi() {
  PropertiesService.getScriptProperties().deleteProperty('khoa');
  return layThongTinDongBo();
}

function moBatDongBo() {
  cnDamBaoCauTruc_(SpreadsheetApp.getActiveSpreadsheet());
  const html = CN_KIEU
    + '<div id="chua" style="display:none">'
    + '<p><b>Làm một lần, khoảng 2 phút:</b></p>'
    + '<ol>'
    + '<li>Menu <b>Tiện ích mở rộng → Apps Script</b>.</li>'
    + '<li>Góc trên bên phải bấm <b>Triển khai (Deploy) → Tùy chọn triển khai mới (New deployment)</b>.</li>'
    + '<li>Bấm biểu tượng bánh răng cạnh <b>Chọn loại</b>, chọn <b>Ứng dụng web (Web app)</b>.</li>'
    + '<li><b>Thực thi bằng: Tôi</b>. <b>Người có quyền truy cập: Bất kỳ ai (Anyone)</b>.</li>'
    + '<li>Bấm <b>Triển khai</b>. Google hỏi quyền: <b>Cấp quyền truy cập</b>, chọn tài khoản, <b>Nâng cao</b>, <b>Chuyển tới … (không an toàn)</b>, <b>Cho phép</b>. Đây là script của chính bạn trong file này.</li>'
    + '<li>Bấm <b>Sao chép</b> ở dòng <b>URL ứng dụng web</b>, dán vào ô dưới rồi bấm Lưu.</li>'
    + '</ol>'
    + '<p class="nho">Đã triển khai rồi thì không cần triển khai thêm: trong Apps Script bấm <b>Triển khai → Quản lý bản triển khai</b>, bấm <b>Sao chép</b> ở dòng URL rồi dán vào ô dưới.</p>'
    + '<input id="url" placeholder="https://script.google.com/macros/s/…/exec">'
    + '<button onclick="luu()">Lưu</button>'
    + '<button class="phu" id="thoi" style="display:none" onclick="google.script.run.withSuccessHandler(hien).layThongTinDongBo()">Giữ URL cũ</button>'
    + '</div>'
    + '<div id="co" style="display:none">'
    + '<p><b>Đã bật đồng bộ hai chiều.</b> Gửi Link kết nối này qua Zalo cho từng máy:</p>'
    + '<div id="link" class="link"></div>'
    + '<button onclick="chep()">Sao chép Link kết nối</button>'
    + '<ol>'
    + '<li>Ở máy cần nhận việc: sao chép link.</li>'
    + '<li>Mở app Tools → <b>Nhắc việc → Cài đặt → Dán link đã sao chép</b>.</li>'
    + '</ol>'
    + '<p class="nho">Ai có link đều đọc và ghi được file qua app, chỉ gửi cho người trong cửa hàng. File không cần chia sẻ công khai nữa. Lỡ gửi nhầm: bấm Đổi mã, rồi gửi lại link mới cho các máy.</p>'
    + '<button class="phu" onclick="doiMa()">Đổi mã kết nối</button>'
    + '<p class="nho">Máy dán link mà báo không tìm thấy cầu nối: URL ứng dụng web đã lưu không đúng. Bấm nút dưới, dán lại URL lấy ở Triển khai → Quản lý bản triển khai.</p>'
    + '<button class="phu" onclick="doiUrl()">Dán lại URL ứng dụng web</button>'
    + '</div>'
    + '<div id="bao" class="bao"></div>'
    + '<script>'
    + 'function hien(t){document.getElementById("chua").style.display=t.link?"none":"block";document.getElementById("co").style.display=t.link?"block":"none";document.getElementById("link").textContent=t.link;document.getElementById("thoi").style.display="none";}'
    + 'function doiUrl(){document.getElementById("co").style.display="none";document.getElementById("chua").style.display="block";document.getElementById("thoi").style.display="block";document.getElementById("url").value="";document.getElementById("bao").style.display="none";document.getElementById("url").focus();}'
    + 'function bao(m,loi){var b=document.getElementById("bao");b.className=loi?"bao loi":"bao";b.style.display="block";b.textContent=m;}'
    + 'function luu(){google.script.run.withSuccessHandler(function(t){hien(t);bao("Đã lưu. Sao chép Link kết nối để gửi cho các máy.");}).withFailureHandler(function(e){bao(e.message,true);}).luuUrlUngDung(document.getElementById("url").value);}'
    + 'function chep(){var t=document.getElementById("link").textContent;var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();'
    + 'var ok=false;try{ok=document.execCommand("copy");}catch(e){}document.body.removeChild(a);'
    + 'if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){bao("Đã sao chép Link kết nối.");},function(){bao(ok?"Đã sao chép Link kết nối.":"Bôi đen link ở trên rồi bấm Ctrl+C.",!ok);});else bao(ok?"Đã sao chép Link kết nối.":"Bôi đen link ở trên rồi bấm Ctrl+C.",!ok);}'
    + 'function doiMa(){if(!confirm("Link cũ sẽ hết dùng được, phải gửi lại link mới cho mọi máy. Đổi mã?"))return;google.script.run.withSuccessHandler(function(t){hien(t);bao("Đã đổi mã. Gửi link mới cho các máy.");}).doiMaKetNoi();}'
    + 'google.script.run.withSuccessHandler(hien).layThongTinDongBo();'
    + '</script>';
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(html).setTitle('Đồng bộ hai chiều với app'));
}

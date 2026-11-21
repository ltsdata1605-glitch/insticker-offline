/**
 * CẦU NỐI NHẮC VIỆC: đồng bộ hai chiều giữa file Google Sheet và app In Sticker
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
 * Sửa script này sau khi đã triển khai: Triển khai → Quản lý bản triển khai → bút chì → Phiên bản: Phiên bản mới → Triển khai.
 * Link kết nối giữ nguyên.
 *
 * Phần "Lõi" không gọi dịch vụ nào của Google: app In Sticker dùng chính phần này để kiểm thử, đừng sửa riêng ở đây.
 */

const CN_PHIEN_BAN = 1;
const CN_TRANG = { viec: 'Nhắc việc', checklist: 'Checklist', danhMuc: 'Danh mục', nhatKy: 'Nhật ký', baoCao: 'Báo cáo checklist' };
const CN_COT_THEM = [
  { ten: 'Người xong', rong: 150, ghiChu: 'App ghi tên người bấm Đã xong.' },
  { ten: 'Xong lúc', rong: 130, ghiChu: 'App ghi giờ bấm Đã xong. Việc lặp lại: lần xong gần nhất, các lần trước xem ở trang Nhật ký.' },
];
const CN_NHAT_KY = ['Lúc xong', 'Mã việc', 'Tiêu đề', 'Lần hạn', 'Người xong', 'Mốc lần hạn (app dùng)'];
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
  const cot = cnCot_(viec.tieuDe, ten);
  if (cot < 0) return;
  const hienTai = viec.dong[i][cot];
  const moi = giaTri && typeof giaTri === 'object' ? giaTri : cnChu_(giaTri);
  if (typeof moi === 'string' && cnChu_(hienTai) === moi) return;
  viec.dong[i][cot] = typeof moi === 'string' ? moi : cnHienThi_(moi);
  ghi.push({ trang: 'viec', dong: i + 2, cot: cot + 1, giaTri: moi });
}

function hai_(n) {
  return ('0' + n).slice(-2);
}

/** Cách trang hiện giá trị đặc biệt: {ngay: 'yyyy-mm-dd'} → dd/mm/yyyy, {luc: ms} → dd/mm/yyyy hh:mm */
function cnHienThi_(v) {
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
        const occ = String(Number(op.occ) || 0);
        const daCo = du.nhatKy.dong.some(d => cnChu_(d[1]).toUpperCase() === id.toUpperCase() && cnChu_(d[5]) === occ);
        if (!daCo) {
          const tieuDe = viec.dong[i][cnCot_(viec.tieuDe, 'Tiêu đề')];
          const dongMoi = [{ luc: luc }, id, cnChu_(tieuDe), { luc: Number(occ) }, nguoi, occ];
          du.nhatKy.dong.push(dongMoi);
          them.push({ trang: 'nhatKy', giaTri: dongMoi });
        }
        ketQua.push({ ref: op.ref, id: id });
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

/** Các lần xong gần đây ở trang Nhật ký: app dùng để biết lần nào của việc lặp lại đã xong ở máy khác */
function cnLanXong_(dongNhatKy, tu) {
  const out = [];
  dongNhatKy.forEach(d => {
    const occ = Number(cnChu_(d[5]));
    const id = cnChu_(d[1]);
    if (id && occ && occ >= tu) out.push({ id: id, occ: occ, by: cnChu_(d[4]) });
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

/** Thêm cột Người xong, Xong lúc và hai trang Nhật ký, Báo cáo checklist nếu file chưa có (file tạo từ mẫu cũ) */
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
    viec.getRange(2, cot, Math.max(viec.getMaxRows() - 1, 1), 1)
      .setNumberFormat(c.ten === 'Xong lúc' ? 'dd/mm/yyyy hh:mm' : '@').setHorizontalAlignment('center');
    tieuDe.push(c.ten);
  });
  cnTaoTrang_(ss, 'nhatKy', CN_NHAT_KY, [150, 80, 300, 150, 150, 120], '#7c3aed', 'Mỗi lần ai đó bấm Đã xong trong app, app ghi một dòng ở đây.');
  cnTaoTrang_(ss, 'baoCao', CN_BAO_CAO, [150, 180, 95, 140, 85, 85, 85, 260, 420, 120], '#047857', 'Mỗi lượt checklist hoàn tất trong app, app ghi một dòng báo cáo ở đây.');
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
  return {
    viec: { tieuDe: bang[0], dong: bang.slice(1) },
    nhatKy: { dong: docGiaTri('nhatKy') },
    baoCao: { dong: docGiaTri('baoCao') },
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
  const nhatKy = nhatKySheet && nhatKySheet.getLastRow() > 1 ? nhatKySheet.getRange(2, 1, nhatKySheet.getLastRow() - 1, CN_NHAT_KY.length).getValues() : [];
  const danhMuc = ss.getSheetByName(CN_TRANG.danhMuc);
  const tables = [{ name: CN_TRANG.viec, rows: cnGonBang_(viec, Math.max(cnCot_(viec[0] || [], 'Tiêu đề'), 0)) }];
  if (checklist.length) tables.push({ name: CN_TRANG.checklist, rows: cnGonBang_(checklist, 0) });
  return {
    title: ss.getName(),
    sheetUrl: ss.getUrl(),
    tables: tables,
    doneLog: cnLanXong_(nhatKy, Date.now() - CN_NHAT_KY_NGAY * 86400000),
    staff: cnDanhSach_(danhMuc, 1),
    assigners: cnDanhSach_(danhMuc, 2),
  };
}

// ==================== App gọi vào ====================

/** App đọc dữ liệu: ?k=mã&since=dấu phiên bản lần trước */
function doGet(e) {
  return cnJson_(cnBaoVe_(() => {
    const p = (e && e.parameter) || {};
    cnKiemKhoa_(p.k);
    const doc = cnDoc_(SpreadsheetApp.getActiveSpreadsheet());
    const version = cnBam_(JSON.stringify([doc.tables, doc.doneLog, doc.staff, doc.assigners]));
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
    const kq = cnThayDoi_((ss, du) => cnXuLy_(du, Array.isArray(yeuCau.ops) ? yeuCau.ops : [], nguoi, Date.now(), cnNho_()));
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
    .addToUi();
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
    + '<label>Người xử lý</label><select name="nguoiXuLy"><option value="">Việc chung</option>' + cnLuaChon_(nhanVien, '') + '</select>'
    + '<div class="hai"><div><label>Mức độ</label><select name="mucDo">' + cnLuaChon_(CN_MUC_DO, 'Thường') + '</select></div>'
    + '<div><label>Lặp lại</label><select name="lapLai">' + cnLuaChon_(CN_LAP_LAI, 'Không lặp') + '</select></div></div>'
    + '<label>Nhắc trước</label><select name="nhacTruoc">' + cnLuaChon_(CN_NHAC_TRUOC, '15 phút + đúng hạn') + '</select>'
    + '<div class="hai"><div><label>Âm thanh</label><select name="amThanh">' + cnLuaChon_(CN_AM_THANH, 'Chuông reo') + '</select></div>'
    + '<div><label>Checklist</label><select name="checklist"><option value="">Không</option>' + cnLuaChon_(checklist, '') + '</select></div></div>'
    + '<label>Câu đọc (khi Âm thanh là Đọc chữ)</label><input name="cauDoc">'
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

function cnUrlUngDung_() {
  const luu = PropertiesService.getScriptProperties().getProperty('urlUngDung');
  if (luu) return luu;
  try {
    const url = ScriptApp.getService().getUrl();
    if (url && /\/exec$/.test(url)) return url;
  } catch (e) {
    // Chưa triển khai
  }
  return '';
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
  PropertiesService.getScriptProperties().setProperty('urlUngDung', u);
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
    + '<input id="url" placeholder="https://script.google.com/macros/s/…/exec">'
    + '<button onclick="luu()">Lưu</button>'
    + '</div>'
    + '<div id="co" style="display:none">'
    + '<p><b>Đã bật đồng bộ hai chiều.</b> Gửi Link kết nối này qua Zalo cho từng máy:</p>'
    + '<div id="link" class="link"></div>'
    + '<button onclick="chep()">Sao chép Link kết nối</button>'
    + '<ol>'
    + '<li>Ở máy cần nhận việc: sao chép link.</li>'
    + '<li>Mở app In Sticker → <b>Nhắc việc → Cài đặt → Dán link đã sao chép</b>.</li>'
    + '</ol>'
    + '<p class="nho">Ai có link đều đọc và ghi được file qua app, chỉ gửi cho người trong cửa hàng. File không cần chia sẻ công khai nữa. Lỡ gửi nhầm: bấm Đổi mã, rồi gửi lại link mới cho các máy.</p>'
    + '<button class="phu" onclick="doiMa()">Đổi mã kết nối</button>'
    + '</div>'
    + '<div id="bao" class="bao"></div>'
    + '<script>'
    + 'function hien(t){document.getElementById("chua").style.display=t.link?"none":"block";document.getElementById("co").style.display=t.link?"block":"none";document.getElementById("link").textContent=t.link;}'
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

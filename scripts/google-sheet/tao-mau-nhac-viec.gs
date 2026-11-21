/**
 * TẠO FILE MẪU NHẮC VIỆC CHO APP IN STICKER
 *
 * Cách chạy (làm một lần, bằng tài khoản Google đang giữ file mẫu):
 *   1. Mở https://script.google.com, bấm Dự án mới.
 *   2. Xoá hết nội dung có sẵn, dán toàn bộ file này vào, bấm Lưu.
 *   3. Chọn hàm taoMauNhacViec ở thanh trên, bấm Chạy. Lần đầu Google hỏi quyền: chọn tài khoản, Nâng cao, Đi tới dự án, Cho phép.
 *   4. Xem Nhật ký thực thi: có link file mẫu. File đã được chia sẻ "Bất kỳ ai có đường liên kết đều xem được".
 *
 * Script dựng lại file mẫu có mã TEMPLATE_ID (app đang dùng file này để tạo bản sao), nên link không đổi và không phải cập nhật
 * app. Không mở được file đó (chạy bằng tài khoản khác) thì script tạo file mới: gửi link file mới để cập nhật vào app.
 * Chạy lại bao nhiêu lần cũng được; mỗi lần chạy xoá hết nội dung cũ của file mẫu và dựng lại từ đầu. Script cầu nối đã dán trong
 * file mẫu (cau-noi-nhac-viec.gs, menu Nhắc việc) vẫn giữ nguyên.
 */

const TEMPLATE_ID = '1DrQV5W-YitTXIvEXjRfmqNStHy5MqC2AFDnWsOnCXyg';
const TEN_FILE = 'Mẫu nhắc việc - In Sticker';
const SO_DONG_VIEC = 500;
const SO_DONG_CHECKLIST = 400;

const MAU = {
  tieuDe: '#0369a1',
  chuTieuDe: '#ffffff',
  soChan: '#f0f9ff',
  batBuoc: '#fef9c3',
  ma: '#94a3b8',
};

const MUC_DO = ['Thường', 'Quan trọng', 'Khẩn'];
const NHAC_TRUOC = ['15 phút + đúng hạn', 'Đúng hạn', '5 phút trước', '15 phút trước', '30 phút trước', '1 giờ trước', '1 giờ + 15 phút + đúng hạn', '1 ngày + 1 giờ + đúng hạn'];
const LAP_LAI = ['Không lặp', 'Mỗi ngày', 'T2 - T6', 'T2 - T7', 'Mỗi tuần', 'Mỗi tháng'];
const AM_THANH = ['Chuông reo', 'Còi báo', 'Bíp dồn dập', 'Chuông cửa', 'Nhạc nhẹ', 'Đọc chữ'];
const TRANG_THAI_VIEC = ['Đang giao', 'Xong', 'Huỷ'];
const LICH_CHECKLIST = ['Không theo lịch', 'Mỗi ngày', 'T2 - T6', 'T2 - T7', 'T7 - CN'];
const TRANG_THAI_CHECKLIST = ['Đang dùng', 'Ngưng'];

/** Giờ 05:00 đến 23:00, cách 15 phút */
function danhSachGio_() {
  const out = [];
  for (let phut = 5 * 60; phut <= 23 * 60; phut += 15) {
    out.push(('0' + Math.floor(phut / 60)).slice(-2) + ':' + ('0' + (phut % 60)).slice(-2));
  }
  return out;
}

function chonTuDanhSach_(list, choPhepKhac, goiY) {
  return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(choPhepKhac).setHelpText(goiY).build();
}

function chonTuVung_(range, goiY) {
  return SpreadsheetApp.newDataValidation().requireValueInRange(range, true).setAllowInvalid(true).setHelpText(goiY).build();
}

/** Dòng tiêu đề: nền xanh, chữ trắng đậm, xuống dòng, ghi chú giải thích ở từng cột (rê chuột vào để xem) */
function dungTieuDe_(sheet, cot) {
  const range = sheet.getRange(1, 1, 1, cot.length);
  range.setValues([cot.map(c => c.ten)])
    .setBackground(MAU.tieuDe).setFontColor(MAU.chuTieuDe).setFontWeight('bold').setFontSize(11)
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  range.setNotes([cot.map(c => c.ghiChu || '')]);
  sheet.setRowHeight(1, 44);
  cot.forEach((c, i) => sheet.setColumnWidth(i + 1, c.rong));
  sheet.setFrozenRows(1);
}

function soDong_(sheet, can) {
  const thua = sheet.getMaxRows() - can;
  if (thua > 0) sheet.deleteRows(can + 1, thua);
  if (thua < 0) sheet.insertRowsAfter(sheet.getMaxRows(), -thua);
}

function soCot_(sheet, can) {
  const thua = sheet.getMaxColumns() - can;
  if (thua > 0) sheet.deleteColumns(can + 1, thua);
  if (thua < 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), -thua);
}

function dungDanhMuc_(sheet) {
  soDong_(sheet, 201);
  soCot_(sheet, 3);
  dungTieuDe_(sheet, [
    { ten: 'Người xử lý (nhân viên)', rong: 240, ghiChu: 'Ghi mỗi dòng một người: tên hoặc tên và mã NV. Cột Người xử lý ở trang Nhắc việc và Người làm ở trang Checklist chọn từ danh sách này.' },
    { ten: 'Người giao (quản lý)', rong: 220, ghiChu: 'Ghi mỗi dòng một người giao việc. Cột Người giao ở trang Nhắc việc chọn từ danh sách này.' },
    { ten: 'Ghi chú', rong: 420 },
  ]);
  sheet.getRange('A2:B201').setBackground(MAU.batBuoc).setNumberFormat('@');
  sheet.getRange('C2').setValue('Ghi danh sách người một lần ở cột A và B, các trang khác chọn từ danh sách, không phải gõ lại.').setWrap(true).setFontColor('#475569');
  sheet.setTabColor('#64748b');
}

function dungNhacViec_(sheet, danhMuc, checklist) {
  const n = SO_DONG_VIEC;
  soDong_(sheet, n + 1);
  const cot = [
    { ten: 'Mã việc', rong: 80, ghiChu: 'Điền sẵn, không sửa. App dựa vào mã để biết việc cũ hay mới.' },
    { ten: 'Tiêu đề', rong: 260, ghiChu: 'Bắt buộc. Dòng chưa có tiêu đề thì app bỏ qua.' },
    { ten: 'Nội dung', rong: 300, ghiChu: 'Mô tả việc cần làm.' },
    { ten: 'Ngày hạn', rong: 110, ghiChu: 'Bắt buộc. Bấm đúp vào ô để chọn ngày trên lịch.' },
    { ten: 'Giờ hạn', rong: 80, ghiChu: 'Chọn giờ. Để trống là 17:00. Gõ giờ khác cũng được, ví dụ 15:40.' },
    { ten: 'Người xử lý', rong: 170, ghiChu: 'Chọn từ trang Danh mục. Để trống là việc chung.' },
    { ten: 'Mức độ', rong: 110, ghiChu: 'Khẩn: quá hạn chưa xong thì app nhắc lại mỗi 10 phút. Để trống là Thường.' },
    { ten: 'Nhắc trước', rong: 190, ghiChu: 'Các mốc nhắc trước hạn. Để trống là 15 phút + đúng hạn.' },
    { ten: 'Lặp lại', rong: 110, ghiChu: 'Mỗi tuần: lặp vào thứ của ngày hạn. Gõ các thứ khác được, ví dụ T2, T4, T6.' },
    { ten: 'Âm thanh', rong: 130, ghiChu: 'Đọc chữ: app đọc Câu đọc (hoặc tiêu đề và hạn) bằng giọng tiếng Việt.' },
    { ten: 'Câu đọc', rong: 260, ghiChu: 'Câu app đọc thành tiếng khi nhắc, nếu Âm thanh là Đọc chữ.' },
    { ten: 'Checklist', rong: 170, ghiChu: 'Gắn checklist ở trang Checklist: cửa sổ nhắc có nút mở thẳng checklist đó.' },
    { ten: 'Trạng thái', rong: 110, ghiChu: 'Huỷ: rút việc khỏi app. Xong: đánh dấu đã xong. Để trống là Đang giao.' },
    { ten: 'Người giao', rong: 150, ghiChu: 'Chọn từ trang Danh mục.' },
    { ten: 'Người xong', rong: 150, ghiChu: 'App ghi tên người bấm Đã xong (khi đã bật đồng bộ hai chiều).' },
    { ten: 'Xong lúc', rong: 130, ghiChu: 'App ghi giờ bấm Đã xong. Việc lặp lại: lần xong gần nhất, các lần trước xem ở trang Nhật ký.' },
  ];
  soCot_(sheet, cot.length);
  dungTieuDe_(sheet, cot);
  sheet.setFrozenColumns(2);

  const ma = [];
  for (let i = 1; i <= n; i++) ma.push(['CV' + ('00' + i).slice(-3)]);
  sheet.getRange(2, 1, n, 1).setValues(ma).setFontColor(MAU.ma).setHorizontalAlignment('center');
  sheet.getRange(2, 2, n, cot.length - 1).setNumberFormat('@').setVerticalAlignment('middle');
  sheet.getRange(2, 3, n, 1).setWrap(true);
  sheet.getRange(2, 4, n, 1).setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Bấm đúp để chọn ngày.').build());
  sheet.getRange(2, 5, n, 1).setHorizontalAlignment('center').setDataValidation(chonTuDanhSach_(danhSachGio_(), true, 'Chọn giờ hạn.'));
  sheet.getRange(2, 6, n, 1).setDataValidation(chonTuVung_(danhMuc.getRange('A2:A201'), 'Chọn người xử lý (ghi danh sách ở trang Danh mục).'));
  sheet.getRange(2, 7, n, 1).setHorizontalAlignment('center').setDataValidation(chonTuDanhSach_(MUC_DO, false, 'Thường, Quan trọng hoặc Khẩn.'));
  sheet.getRange(2, 8, n, 1).setDataValidation(chonTuDanhSach_(NHAC_TRUOC, true, 'Chọn các mốc nhắc.'));
  sheet.getRange(2, 9, n, 1).setDataValidation(chonTuDanhSach_(LAP_LAI, true, 'Chọn cách lặp, hoặc gõ các thứ như T2, T4, T6.'));
  sheet.getRange(2, 10, n, 1).setDataValidation(chonTuDanhSach_(AM_THANH, false, 'Chọn âm thanh khi nhắc.'));
  sheet.getRange(2, 11, n, 1).setWrap(true);
  sheet.getRange(2, 12, n, 1).setDataValidation(chonTuVung_(checklist.getRange('A2:A' + (SO_DONG_CHECKLIST + 1)), 'Chọn checklist ở trang Checklist.'));
  sheet.getRange(2, 13, n, 1).setHorizontalAlignment('center').setDataValidation(chonTuDanhSach_(TRANG_THAI_VIEC, false, 'Đang giao, Xong hoặc Huỷ.'));
  sheet.getRange(2, 14, n, 1).setDataValidation(chonTuVung_(danhMuc.getRange('B2:B201'), 'Chọn người giao (ghi danh sách ở trang Danh mục).'));
  sheet.getRange(2, 15, n, 2).setHorizontalAlignment('center');
  sheet.getRange(2, 16, n, 1).setNumberFormat('dd/mm/yyyy hh:mm');

  const all = sheet.getRange(1, 1, n + 1, cot.length);
  all.applyRowBanding(SpreadsheetApp.BandingTheme.BLUE, true, false)
    .setHeaderRowColor(MAU.tieuDe).setFirstRowColor('#ffffff').setSecondRowColor(MAU.soChan);

  const dong = sheet.getRange(2, 1, n, cot.length);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$M2="Huỷ"').setFontColor('#94a3b8').setStrikethrough(true).setRanges([dong]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$M2="Xong"').setBackground('#ecfdf5').setFontColor('#047857').setRanges([dong]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($B2<>"",$D2<>"",$D2<TODAY())').setBackground('#fee2e2').setFontColor('#b91c1c').setBold(true).setRanges([sheet.getRange(2, 4, n, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Khẩn').setBackground('#fee2e2').setFontColor('#b91c1c').setBold(true).setRanges([sheet.getRange(2, 7, n, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Quan trọng').setBackground('#fef3c7').setFontColor('#92400e').setBold(true).setRanges([sheet.getRange(2, 7, n, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($B2="",COUNTA($C2:$N2)>0)').setBackground(MAU.batBuoc).setRanges([sheet.getRange(2, 2, n, 1)]).build(),
  ];
  sheet.setConditionalFormatRules(rules);
  sheet.getRange(1, 1, 1, cot.length).protect().setDescription('Dòng tiêu đề: app đọc theo tên cột').setWarningOnly(true);
  sheet.setTabColor(MAU.tieuDe);
}

function dungChecklist_(sheet, danhMuc) {
  const n = SO_DONG_CHECKLIST;
  soDong_(sheet, n + 1);
  const cot = [
    { ten: 'Tên checklist', rong: 190, ghiChu: 'Các dòng cùng tên là một checklist, mỗi dòng một việc. Ví dụ 10 dòng "Mở ca sáng" là checklist Mở ca sáng gồm 10 việc.' },
    { ten: 'Việc', rong: 280, ghiChu: 'Bắt buộc. Tên việc cần làm.' },
    { ten: 'Hướng dẫn', rong: 260, ghiChu: 'Cách làm, hiện dưới tên việc trong app.' },
    { ten: 'Bắt buộc', rong: 80, ghiChu: 'Tick: hoàn tất checklist khi chưa làm việc này thì app hỏi lại.' },
    { ten: 'Cần ảnh', rong: 80, ghiChu: 'Tick: việc này phải chụp ảnh.' },
    { ten: 'Cần ghi chú', rong: 90, ghiChu: 'Tick: việc này phải ghi chú.' },
    { ten: 'Lịch làm', rong: 140, ghiChu: 'Ghi ở dòng đầu của checklist. App nhắc lúc bắt đầu, 15 phút trước hạn và lúc hạn nếu chưa hoàn tất.' },
    { ten: 'Giờ bắt đầu', rong: 95, ghiChu: 'Ghi ở dòng đầu của checklist.' },
    { ten: 'Giờ hạn', rong: 85, ghiChu: 'Ghi ở dòng đầu của checklist.' },
    { ten: 'Người làm', rong: 160, ghiChu: 'Chọn từ trang Danh mục. Ghi ở dòng đầu của checklist.' },
    { ten: 'Trạng thái', rong: 110, ghiChu: 'Ngưng: rút checklist khỏi app. Ghi ở dòng đầu của checklist.' },
  ];
  soCot_(sheet, cot.length);
  dungTieuDe_(sheet, cot);
  sheet.setFrozenColumns(2);
  sheet.getRange(2, 1, n, 3).setNumberFormat('@').setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(2, 4, n, 3).insertCheckboxes().setHorizontalAlignment('center');
  sheet.getRange(2, 7, n, 1).setDataValidation(chonTuDanhSach_(LICH_CHECKLIST, false, 'Chọn ngày làm checklist.'));
  sheet.getRange(2, 8, n, 2).setNumberFormat('@').setHorizontalAlignment('center').setDataValidation(chonTuDanhSach_(danhSachGio_(), true, 'Chọn giờ.'));
  sheet.getRange(2, 10, n, 1).setNumberFormat('@').setDataValidation(chonTuVung_(danhMuc.getRange('A2:A201'), 'Chọn người làm (ghi danh sách ở trang Danh mục).'));
  sheet.getRange(2, 11, n, 1).setHorizontalAlignment('center').setDataValidation(chonTuDanhSach_(TRANG_THAI_CHECKLIST, false, 'Đang dùng hoặc Ngưng.'));
  sheet.getRange(1, 1, n + 1, cot.length).applyRowBanding(SpreadsheetApp.BandingTheme.GREEN, true, false)
    .setHeaderRowColor('#047857').setFirstRowColor('#ffffff').setSecondRowColor('#f0fdf4');
  // Dòng đầu mỗi checklist (tên khác dòng trên) in đậm để dễ thấy các nhóm
  const dong = sheet.getRange(2, 1, n, cot.length);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$K2="Ngưng"').setFontColor('#94a3b8').setStrikethrough(true).setRanges([dong]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",$A2<>$A1)').setBold(true).setRanges([sheet.getRange(2, 1, n, 1)]).build(),
  ]);
  sheet.getRange(1, 1, 1, cot.length).protect().setDescription('Dòng tiêu đề: app đọc theo tên cột').setWarningOnly(true);
  sheet.setTabColor('#047857');
}

/** Trang app ghi vào khi bật đồng bộ hai chiều. Cột cuối app dùng để nhận ra dòng đã ghi, ẩn đi cho gọn. */
function dungTrangApp_(sheet, cot, rong, mau, ghiChu, cotNgay) {
  soDong_(sheet, 1000);
  soCot_(sheet, cot.length);
  sheet.getRange(1, 1, 1, cot.length).setValues([cot]).setBackground(mau).setFontColor('#ffffff').setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  sheet.getRange(1, 1).setNote(ghiChu);
  sheet.setRowHeight(1, 40);
  rong.forEach((r, i) => sheet.setColumnWidth(i + 1, r));
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, 999, cot.length).setNumberFormat('@').setVerticalAlignment('top');
  cotNgay.forEach(c => sheet.getRange(2, c, 999, 1).setNumberFormat('dd/mm/yyyy hh:mm'));
  sheet.hideColumns(cot.length);
  sheet.setTabColor(mau);
}

function dungHuongDan_(sheet) {
  soCot_(sheet, 2);
  const dong = [
    ['HƯỚNG DẪN DÙNG FILE NHẮC VIỆC', ''],
    ['', ''],
    ['Giao việc', 'Trang Nhắc việc: mỗi dòng một việc. Ghi Tiêu đề, chọn Ngày hạn (bấm đúp để mở lịch) và Giờ hạn; các cột khác chọn từ danh sách, để trống thì app dùng mặc định.'],
    ['Checklist', 'Trang Checklist: các dòng cùng Tên checklist là một checklist, mỗi dòng một việc. Lịch làm, giờ và người làm ghi ở dòng đầu của checklist. Tick Bắt buộc, Cần ảnh, Cần ghi chú cho từng việc.'],
    ['Danh sách người', 'Trang Danh mục: ghi tên nhân viên và người giao một lần, các trang khác chọn từ danh sách.'],
    ['Huỷ, xong', 'Chọn Huỷ ở cột Trạng thái để rút việc khỏi app, chọn Xong để đánh dấu đã xong. Checklist chọn Ngưng để rút.'],
    ['Kết nối app', 'Menu Nhắc việc → Bật đồng bộ hai chiều, làm theo khung hướng dẫn bên phải (một lần, khoảng 2 phút). Xong bấm Sao chép Link kết nối, gửi qua Zalo cho từng máy; ở máy: Nhắc việc → Cài đặt → Dán link đã sao chép.'],
    ['Đồng bộ hai chiều', 'Việc tạo, sửa, xoá, bấm Đã xong ở bất kỳ máy nào đều ghi vào file (cột Người xong, Xong lúc, trang Nhật ký) và tới các máy khác trong khoảng 1 phút. Lượt checklist hoàn tất ghi vào trang Báo cáo checklist.'],
    ['Menu Nhắc việc', 'Giao việc nhanh: khung nhập có sẵn danh sách để chọn, tự lấy mã việc. Nhân bản dòng đang chọn: chép việc sang dòng mới. Đánh dấu xong dòng đang chọn.'],
    ['Lưu ý', 'Chỉ gửi Link kết nối cho người trong cửa hàng: ai có link đều đọc và ghi được file qua app. Không đổi tên các trang và các cột tiêu đề vì app đọc theo tên. Không sửa Mã việc của việc đã giao.'],
    ['', ''],
    ['VÍ DỤ', ''],
    ['Nhắc việc', 'Tiêu đề: Kiểm hàng chuyển kho HĐ 1079638 · Ngày hạn: 25/11/2026 · Giờ hạn: 15:30 · Người xử lý: Ngọc - 11443 · Mức độ: Khẩn · Nhắc trước: 1 giờ + 15 phút + đúng hạn · Âm thanh: Đọc chữ · Câu đọc: Kiểm tra lệnh chuyển hàng gấp'],
    ['Checklist', 'Mở ca sáng · Bật đèn, máy lạnh, nhạc (Bắt buộc) · Lịch làm: Mỗi ngày · Giờ bắt đầu 08:00 · Giờ hạn 09:00. Dòng tiếp: Mở ca sáng · Kiểm tem giá khu điện thoại (Bắt buộc, Cần ảnh). Dòng tiếp: Mở ca sáng · Đếm tiền quỹ (Bắt buộc, Cần ghi chú).'],
  ];
  soDong_(sheet, dong.length);
  sheet.getRange(1, 1, dong.length, 2).setValues(dong).setWrap(true).setVerticalAlignment('top').setFontSize(11);
  sheet.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor(MAU.tieuDe);
  sheet.getRange('A12').setFontSize(13).setFontWeight('bold').setFontColor(MAU.tieuDe);
  sheet.getRange('A3:A14').setFontWeight('bold').setFontColor('#0f172a');
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 820);
  sheet.setHiddenGridlines(true);
  sheet.setTabColor('#f59e0b');
}

function taoMauNhacViec() {
  let ss;
  try {
    ss = SpreadsheetApp.openById(TEMPLATE_ID);
  } catch (e) {
    ss = SpreadsheetApp.create(TEN_FILE);
    Logger.log('Không mở được file mẫu cũ, đã tạo file mới. Gửi link file mới để cập nhật vào app.');
  }
  ss.rename(TEN_FILE);

  // Dựng lại từ đầu: giữ một trang tạm, xoá các trang cũ
  const tam = ss.insertSheet('__tam__' + Date.now());
  ss.getSheets().forEach(sheet => { if (sheet.getSheetId() !== tam.getSheetId()) ss.deleteSheet(sheet); });
  const nhacViec = ss.insertSheet('Nhắc việc', 0);
  const checklist = ss.insertSheet('Checklist', 1);
  const danhMuc = ss.insertSheet('Danh mục', 2);
  const huongDan = ss.insertSheet('Hướng dẫn', 3);
  const nhatKy = ss.insertSheet('Nhật ký', 4);
  const baoCao = ss.insertSheet('Báo cáo checklist', 5);
  ss.deleteSheet(tam);

  dungDanhMuc_(danhMuc);
  dungChecklist_(checklist, danhMuc);
  dungNhacViec_(nhacViec, danhMuc, checklist);
  dungHuongDan_(huongDan);
  dungTrangApp_(nhatKy, ['Lúc xong', 'Mã việc', 'Tiêu đề', 'Lần hạn', 'Người xong', 'Mốc lần hạn (app dùng)'], [150, 80, 300, 150, 150, 120], '#7c3aed',
    'Mỗi lần ai đó bấm Đã xong trong app, app ghi một dòng ở đây.', [1, 4]);
  dungTrangApp_(baoCao, ['Lúc hoàn tất', 'Checklist', 'Ngày', 'Người làm', 'Kết quả', 'Có vấn đề', 'Chưa làm', 'Ghi chú chung', 'Chi tiết', 'Mã lượt (app dùng)'],
    [150, 180, 95, 140, 85, 85, 85, 260, 420, 120], '#047857', 'Mỗi lượt checklist hoàn tất trong app, app ghi một dòng báo cáo ở đây.', [1]);
  baoCao.getRange(2, 1, 999, 10).setWrap(true);
  ss.setActiveSheet(nhacViec);
  // Đặt ngôn ngữ Việt (ngày dạng ngày/tháng/năm) sau khi đã viết xong công thức tô màu
  ss.setSpreadsheetLocale('vi_VN');
  ss.setSpreadsheetTimeZone('Asia/Ho_Chi_Minh');
  SpreadsheetApp.flush();

  DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log('Đã tạo xong file mẫu: ' + ss.getUrl());
  Logger.log('Link tạo bản sao (app dùng link này): https://docs.google.com/spreadsheets/d/' + ss.getId() + '/copy');
}

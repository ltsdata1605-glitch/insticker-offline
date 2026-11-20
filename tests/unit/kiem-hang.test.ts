import { describe, expect, it } from 'vitest';
import {
  applyScan, createSession, excelDateText, mergeFiles, parseSheetRows, sessionTitle, setReceived, totalsOf, undoLast,
} from '../../src/features/kiem-hang/kiemHangData';
import type { KiemHangSession } from '../../src/features/kiem-hang/kiemHangData';
import { HOA_DON_A, HOA_DON_B, detailRows, summaryRows } from './kiemHangMau';

const loadAB = (): KiemHangSession => mergeFiles(createSession(0), [
  parseSheetRows('2000001(1).xlsx', detailRows(HOA_DON_A.transferId, HOA_DON_A.orderId, HOA_DON_A.items)),
  parseSheetRows('2000002(1).xlsx', detailRows(HOA_DON_B.transferId, HOA_DON_B.orderId, HOA_DON_B.items)),
  parseSheetRows('2000001.xlsx', summaryRows(HOA_DON_A.transferId, HOA_DON_A.invoiceNo)),
  parseSheetRows('2000002.xlsx', summaryRows(HOA_DON_B.transferId, HOA_DON_B.invoiceNo)),
], 0).session;

const scan = (session: KiemHangSession, input: string, options: Parameters<typeof applyScan>[2] = {}) => applyScan(session, input, { now: 1, ...options });

describe('Đọc file phiếu chuyển kho', () => {
  it('file chi tiết: bỏ khoảng trắng thừa ở mã và IMEI, giữ số 0 đầu, đổi ngày Excel, giữ các cột cần thiết', () => {
    const parsed = parseSheetRows('x.xlsx', detailRows(HOA_DON_A.transferId, HOA_DON_A.orderId, HOA_DON_A.items));
    expect(parsed.kind).toBe('detail');
    if (parsed.kind !== 'detail') return;
    expect(parsed.transferIds).toEqual([HOA_DON_A.transferId]);
    expect(parsed.lines).toHaveLength(4);
    const [first, , imei] = parsed.lines;
    expect(first).toMatchObject({
      code: '0160010000745', name: 'Chuột không dây Thử Xanh', imei: '', expected: 2, status: '1 - Mới', group: 'Chuột',
      orderId: HOA_DON_A.orderId, createdAt: '17/11/2026 10:32', user: '10001', userName: 'Nguyễn Văn Thử',
      fromStoreId: '20001', fromStoreName: 'KHO_THU - Kho tổng thử', transferId: HOA_DON_A.transferId,
    });
    expect(imei.imei).toBe('IK20GF-BK022997');
    expect(imei.expected).toBe(1);
  });

  it('file phiếu: lấy số hoá đơn và chứng từ vận chuyển, bỏ dòng tiêu đề lặp', () => {
    const parsed = parseSheetRows('2000001.xlsx', summaryRows(HOA_DON_A.transferId, HOA_DON_A.invoiceNo));
    expect(parsed).toMatchObject({ kind: 'summary', invoices: [{ transferId: HOA_DON_A.transferId, invoiceNo: '2000001', transportVoucher: 'NB-THU-0001' }] });
  });

  it('file khác mẫu thì báo không đọc được', () => {
    expect(parseSheetRows('bang-gia.xlsx', [['Tên', 'Giá'], ['A', 1]]).kind).toBe('invalid');
  });

  it('ngày dạng số Excel', () => {
    expect(excelDateText(46343.4397106481)).toBe('17/11/2026 10:33');
    expect(excelDateText('01/02/2026')).toBe('01/02/2026');
  });
});

describe('Gộp nhiều file', () => {
  it('ghép số hoá đơn từ file phiếu, đặt tên phiên theo chứng từ chung, bỏ file chi tiết trùng', () => {
    const session = loadAB();
    expect(session.invoices.map(invoice => [invoice.invoiceNo, invoice.hasDetail])).toEqual([['2000001', true], ['2000002', true]]);
    expect(session.lines).toHaveLength(6);
    expect(sessionTitle(session)).toBe('Chứng từ NB-THU-0001');

    const again = mergeFiles(session, [parseSheetRows('copy.xlsx', detailRows(HOA_DON_A.transferId, HOA_DON_A.orderId, HOA_DON_A.items))]);
    expect(again.report.duplicates).toEqual(['2000001']);
    expect(again.session.lines).toHaveLength(6);
  });

  it('file phiếu nhập trước file chi tiết vẫn ghép đúng; chỉ có file phiếu thì hoá đơn chưa có dòng nào', () => {
    const { session, report } = mergeFiles(createSession(0), [
      parseSheetRows('2000002.xlsx', summaryRows(HOA_DON_B.transferId, HOA_DON_B.invoiceNo)),
      parseSheetRows('2000001.xlsx', summaryRows(HOA_DON_A.transferId, HOA_DON_A.invoiceNo)),
      parseSheetRows('2000001(1).xlsx', detailRows(HOA_DON_A.transferId, HOA_DON_A.orderId, HOA_DON_A.items)),
    ]);
    expect(report.added).toEqual(['2000001']);
    expect(session.invoices.find(invoice => invoice.invoiceNo === '2000002')?.hasDetail).toBe(false);
    expect(session.invoices.find(invoice => invoice.invoiceNo === '2000001')?.hasDetail).toBe(true);
  });
});

describe('Quét mã', () => {
  it('mã có ở hai hoá đơn: cộng vào hoá đơn đầu đến đủ rồi sang hoá đơn sau, đủ hết thì tính thừa', () => {
    let session = loadAB();
    const kinds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const out = scan(session, ' 0160010000745 ');
      kinds.push(out.kind);
      session = out.session;
    }
    expect(kinds).toEqual(['ok', 'ok', 'ok', 'over']);
    const [a, b] = session.lines.filter(line => line.code === '0160010000745');
    expect(session.received[a.key]).toBe(2);
    expect(session.received[b.key]).toBe(2);
    expect(totalsOf(session.lines, session.received)).toMatchObject({ expected: 12, received: 3, extra: 1, missing: 9 });
  });

  it('nhập số lượng một lần cho hàng nhiều cái', () => {
    const out = scan(loadAB(), '0162791000276', { qty: 4 });
    expect(out.kind).toBe('ok');
    expect(out.codeReceived).toBe(4);
    expect(out.codeExpected).toBe(4);
  });

  it('mã không có trong danh sách: báo mã lạ, không cộng gì, ghi vào danh sách mã lạ', () => {
    const out = scan(loadAB(), '8936012345678');
    expect(out.kind).toBe('unknown');
    expect(out.session.unknown).toEqual([{ value: '8936012345678', type: 'code', count: 1, lastAt: 1 }]);
    expect(totalsOf(out.session.lines, out.session.received).received).toBe(0);
  });

  it('sản phẩm có IMEI: quét mã thì chờ IMEI; IMEI đúng thì nhận, quét lại báo trùng, IMEI sai báo IMEI lạ', () => {
    let session = loadAB();
    const wait = scan(session, '0164779000261');
    expect(wait.kind).toBe('need-imei');
    expect(wait.pendingCode).toBe('0164779000261');
    session = wait.session;

    const wrong = scan(session, 'XX123', { pendingCode: wait.pendingCode });
    expect(wrong.kind).toBe('imei-unknown');
    expect(wrong.session.unknown[0]).toMatchObject({ value: 'XX123', type: 'imei', forCode: '0164779000261' });
    session = wrong.session;

    const ok = scan(session, 'ik20gf-bk022997', { pendingCode: wait.pendingCode });
    expect(ok.kind).toBe('imei-ok');
    expect(ok.codeReceived).toBe(1);
    expect(ok.codeExpected).toBe(2);
    session = ok.session;

    expect(scan(session, 'IK20GF-BK022997').kind).toBe('imei-dup');
    // Quét thẳng IMEI không cần quét mã trước
    expect(scan(session, 'IK20GF-BK022998').kind).toBe('imei-ok');
  });

  it('hoàn tác trả lại đúng số đã cộng, kể cả lần cộng tràn sang hoá đơn khác và mã lạ', () => {
    let session = loadAB();
    session = scan(session, '0160010000745', { qty: 3 }).session;
    session = scan(session, 'LA-001').session;
    const before = totalsOf(session.lines, session.received);
    expect(before.received).toBe(3);
    session = undoLast(session).session;
    expect(session.unknown).toEqual([]);
    session = undoLast(session).session;
    expect(session.received).toEqual({});
    expect(undoLast(session).undone).toBeUndefined();
  });

  it('sửa tay số thực nhận; dòng IMEI chỉ nhận 0 hoặc 1', () => {
    let session = loadAB();
    const adapter = session.lines.find(line => line.code === '0160014000813')!;
    const imeiLine = session.lines.find(line => line.imei)!;
    session = setReceived(session, adapter.key, 5);
    session = setReceived(session, imeiLine.key, 3);
    expect(session.received[adapter.key]).toBe(5);
    expect(session.received[imeiLine.key]).toBe(1);
    expect(totalsOf(session.lines, session.received)).toMatchObject({ received: 4, extra: 2 });
    session = undoLast(session).session;
    expect(session.received[imeiLine.key]).toBeUndefined();
  });
});

describe('Xuất Excel', () => {
  it('đủ 6 trang; chi tiết giữ mã dạng chữ, có SL thực nhận và chênh lệch; tổng hợp có dòng tổng', async () => {
    const { buildExportSheets } = await import('../../src/features/kiem-hang/kiemHangExport');
    let session = loadAB();
    session = scan(session, '0160014000813', { qty: 3 }).session;
    session = scan(session, '0160010000745').session;
    session = scan(session, 'LA-001').session;
    const sheets = buildExportSheets(session);
    expect(sheets.map(sheet => sheet.name)).toEqual(['Báo cáo', 'Tổng hợp', 'Chi tiết', 'Thiếu thừa', 'Mã lạ', 'Nhật ký quét']);
    const [, summary, detail, diff, unknown, log] = sheets;
    expect(summary.rows[1].slice(0, 2)).toEqual(['2000001', HOA_DON_A.transferId]);
    expect(summary.rows.at(-1)).toEqual(['Tổng', '', '', '', '', '', '', 12, 4, 8, 0, 'Thiếu 8']);
    expect(detail.rows[1].slice(0, 8)).toEqual(['2000001', '0160010000745', 'Chuột không dây Thử Xanh', '', 2, 1, -1, 'Thiếu']);
    expect(detail.rows).toHaveLength(7);
    // Adapter đã đủ nên không có trong trang thiếu thừa
    expect(diff.rows.some(row => row[1] === '0160014000813')).toBe(false);
    expect(unknown.rows[1].slice(0, 4)).toEqual(['LA-001', 'Mã lạ', '', 1]);
    expect(log.rows.map(row => row[2]).slice(1)).toEqual(['Đã cộng', 'Đã cộng', 'Mã không có trong danh sách']);
  });
});

describe('Báo cáo', () => {
  it('theo MYC: đủ hay chưa, thiếu bao nhiêu sản phẩm thuộc bao nhiêu nhóm; kho, người chuyển; đoạn chữ để gửi', async () => {
    const { buildReport, reportText, reportSummary, reportSheetRows } = await import('../../src/features/kiem-hang/kiemHangReport');
    let session = loadAB();
    // Hoá đơn B đủ: chuột 1 (sau khi A đủ 2), quạt 4
    session = scan(session, '0160010000745', { qty: 3 }).session;
    session = scan(session, '0162791000276', { qty: 4 }).session;
    // Hoá đơn A: adapter nhận 1/3, loa IMEI nhận 1/2, thừa 0
    session = scan(session, '0160014000813').session;
    session = scan(session, 'IK20GF-BK022997').session;
    session = scan(session, 'LA-001').session;
    const report = buildReport(session, new Date(2026, 10, 20, 9, 5).getTime());

    expect(report.invoices.map(item => [item.invoice.invoiceNo, item.complete, item.totals.missing, item.missingGroups])).toEqual([
      ['2000001', false, 3, 2],
      ['2000002', true, 0, 0],
    ]);
    expect(report.completeCount).toBe(1);
    expect(report.missingGroups).toBe(2);
    expect(report.fromStores).toEqual(['20001 - KHO_THU - Kho tổng thử']);
    expect(report.toStores).toEqual(['900 - CH_THU - Cửa hàng thử']);
    expect(report.senders).toEqual(['10001 - Nguyễn Văn Thử']);
    expect(reportSummary(report)).toBe('1/2 MYC đủ hàng, thiếu 3 sản phẩm thuộc 2 nhóm, 1 mã không có trong phiếu.');

    const text = reportText(report);
    expect(text).toContain('BÁO CÁO KIỂM HÀNG NHẬN - 20/11/2026 09:05');
    expect(text).toContain('Kho chuyển: 20001 - KHO_THU - Kho tổng thử');
    expect(text).toContain('Người chuyển: 10001 - Nguyễn Văn Thử');
    expect(text).toContain('[CHƯA ĐỦ] MYC CO0000000001 (HĐ 2000001, phiếu SC0000000001): nhận 4/7, thiếu 3 SP, 2 nhóm');
    expect(text).toContain('  - 0160014000813 Adapter sạc Thử 20W: thiếu 2 (nhận 1/3)');
    expect(text).toContain('  - 0164779000261 Loa Bluetooth Thử Đen - Imei (IMEI IK20GF-BK022998): thiếu 1 (nhận 0/1)');
    expect(text).toContain('[ĐỦ] MYC CO0000000002 (HĐ 2000002, phiếu SC0000000002): 5/5');
    expect(text).toContain('  - LA-001');
    // Chỉ gửi phần chưa đủ
    expect(reportText(report, { onlyProblems: true })).not.toContain('[ĐỦ]');

    const rows = reportSheetRows(report);
    expect(rows.find(row => row[0] === 'CO0000000001')?.slice(0, 12)).toEqual([
      'CO0000000001', '2000001', 'SC0000000001', '17/11/2026 10:32', '10001 - Nguyễn Văn Thử', 7, 4, 3, 0, 2, 'Sạc/ Adapter (2), Loa di động (1)', 'Chưa đủ',
    ]);
    expect(rows.filter(row => row[3] === '0160014000813')).toEqual([['CO0000000001', '2000001', 'Sạc/ Adapter', '0160014000813', 'Adapter sạc Thử 20W', '', 3, 1, 2, 0]]);
  });

  it('chưa nhập file phiếu thì tên phiên theo kho chuyển', async () => {
    const { session } = mergeFiles(createSession(0), [
      parseSheetRows('a.xlsx', detailRows(HOA_DON_A.transferId, HOA_DON_A.orderId, HOA_DON_A.items)),
      parseSheetRows('b.xlsx', detailRows(HOA_DON_B.transferId, HOA_DON_B.orderId, HOA_DON_B.items)),
      parseSheetRows('c.xlsx', detailRows('SC0000000003', 'CO0000000003', HOA_DON_B.items)),
    ]);
    expect(sessionTitle(session)).toBe('3 phiếu chuyển từ KHO_THU - Kho tổng thử');
    expect(session.invoices[0].toStoreName).toBe('900 - CH_THU - Cửa hàng thử');
  });
});

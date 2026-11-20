// Dữ liệu giả, cùng cấu trúc với file xuất từ phiếu chuyển kho: cột trống đầu, mã sản phẩm và IMEI có khoảng trắng thừa ở cuối,
// ngày là số kiểu Excel, file phiếu lặp lại dòng tiêu đề. Tên người và kho là tên giả.

export const DETAIL_HEADER = [
  '', 'Chọn', 'Mã sản phẩm', 'Tên sản phẩm', 'IMEI', 'Ghi chú phụ kiện kèm theo', 'Đơn vị tính', 'Hạn bảo hành', 'Số lượng',
  'Có BH', 'Số thùng', 'INVENTORYSTATUSNAME', 'Tổng trọng lượng (kg)', 'Tổng thể tích (m³)', 'SUBGROUPID', 'SUBGROUPNAME',
  'PRODUCTLENGTH', 'PRODUCTWIDTH', 'PRODUCTHEIGHT', 'TRANSPORTTYPEID', 'ISAPPLYEXCHANGEWEIGHT', 'PACKINGTYPE', 'ISNOINVOICEPRD',
  'STORECHANGEORDERID', 'DATECREATE', 'ISRECEIVE', 'DATERECEIVE', 'STORECHANGEUSER', 'FULLNAME', 'CONTENT', 'FROMSTOREID',
  'FROMSTORENAME', 'TOSTOREID', 'TOSTORENAME', 'STORECHANGEID', 'USERRECEIVE', 'FULLNAMEUSERRECEIVE', 'TRANSPORTVOUCHERID',
  'QUANTITYUNITID',
];

export const SUMMARY_HEADER = [
  'Chọn', 'Mã phiếu chuyển', 'Số hóa đơn', 'Số hóa đơn thay thế', 'Kho xuất', 'Kho nhập', 'Ngày chuyển kho', 'Đã chuyển', 'Ngày gửi',
  'Đã nhận', 'Thời gian đi đường', 'Số thùng', 'Yêu cầu nhập chứng từ', 'Ghi chú', 'Trạng thái sản phẩm', 'Tổng trọng lượng (kg)',
  'Tổng thể tích (m³)', 'Chi phí vận chuyển tạm tính', 'Chứng từ vận chuyển', 'Mã chứng từ đối tác',
];

export interface MauDong {
  code: string;
  name: string;
  qty: number;
  imei?: string;
  group?: string;
}

const pad = (value: string, width: number) => value.padEnd(width, ' ');

/** File chi tiết của một phiếu chuyển */
export const detailRows = (transferId: string, orderId: string, items: MauDong[]): unknown[][] => [
  DETAIL_HEADER,
  ...items.map(item => [
    '', 1, pad(item.code, 20), item.name, item.imei ? pad(item.imei, 50) : '', '', 'Cái', '', item.qty, 0, 0, '1 - Mới', 1, 0.001,
    10, item.group ?? 'Phụ kiện', 0.1, 0.1, 0.1, 0, -1, -1, 0, pad(orderId, 20), 46343.4395717593, 0, '', '10001', 'Nguyễn Văn Thử', '',
    20001, 'KHO_THU - Kho tổng thử', 900, 'CH_THU - Cửa hàng thử', pad(transferId, 20), '', '', '', 1,
  ]),
];

/** File phiếu của một phiếu chuyển */
export const summaryRows = (transferId: string, invoiceNo: string, voucher = 'NB-THU-0001'): unknown[][] => [
  SUMMARY_HEADER,
  ['', ...SUMMARY_HEADER.slice(1)],
  [0, transferId, invoiceNo, '', '20001 - KHO_THU - Kho tổng thử', '900 - CH_THU - Cửa hàng thử', 46343.4395, 0, '', 0, '', 0, 0, '',
    '1 - Mới', 1.2, 0.01, 0, voucher, voucher],
];

/** Hai hoá đơn chung một chứng từ vận chuyển. Mã 0160010000745 có ở cả hai hoá đơn. */
export const HOA_DON_A = {
  transferId: 'SC0000000001',
  orderId: 'CO0000000001',
  invoiceNo: '2000001',
  items: [
    { code: '0160010000745', name: 'Chuột không dây Thử Xanh', qty: 2, group: 'Chuột' },
    { code: '0160014000813', name: 'Adapter sạc Thử 20W', qty: 3, group: 'Sạc/ Adapter' },
    { code: '0164779000261', name: 'Loa Bluetooth Thử Đen - Imei', qty: 1, imei: 'IK20GF-BK022997', group: 'Loa di động' },
    { code: '0164779000261', name: 'Loa Bluetooth Thử Đen - Imei', qty: 1, imei: 'IK20GF-BK022998', group: 'Loa di động' },
  ] as MauDong[],
};

export const HOA_DON_B = {
  transferId: 'SC0000000002',
  orderId: 'CO0000000002',
  invoiceNo: '2000002',
  items: [
    { code: '0160010000745', name: 'Chuột không dây Thử Xanh', qty: 1, group: 'Chuột' },
    { code: '0162791000276', name: 'Quạt cầm tay Thử Trắng', qty: 4, group: 'Quạt cầm tay' },
  ] as MauDong[],
};

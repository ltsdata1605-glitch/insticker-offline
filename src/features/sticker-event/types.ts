export interface Product {
  msp: string; // AK
  sanPham: string; // A + B
  thuongERP: number; // Parsed from AJ
  thuongNong: number; // Parsed from AJ
  tongThuong: number; // Calculated
  giaGoc: string; // E
  giaGiam: string; // F
  khuyenMai: string; // H
  ngayIn: string; // AI
  selected: boolean;
  quantity: number;
  tonKho?: number | string;
}

// Khi lưu danh sách, chỉ lưu msp+quantity để tiết kiệm dung lượng Firestore (xem
// onConfirmSaveList trong StickerEventApp.tsx); các field Product khác có thể có
// mặt với danh sách cũ (định dạng trước đây lưu full Product) nên để optional.
export type SavedListItem = Partial<Product> & { msp: string };

/** Sản phẩm nhập tay, lưu trên máy (services/fileParser.ts). */
export interface ManualProductDoc {
  id: string;
  sanPham: string;
  msp: string;
  giaGoc: string;
  giaGiam: string;
  thuongERP: number;
  thuongNong: number;
  tongThuong: number;
  khuyenMai: string;
  ngayIn: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedList {
  id: string;
  name: string;
  createdAt: string;
  items: SavedListItem[];
  totalItems: number;
}

export interface InventoryFilters {
  maSieuThi: string[];
  nganhHang: string[];
  nhomHang: string[];
  keyword: string;
}

export interface InventoryItem {
  maSieuThi: string;
  tenSieuThi: string;
  thuongHieu: string;
  nhaSanXuat?: string;
  nganhHang: string;
  nhomHang: string;
  maSanPham: string;
  tenSanPham: string;
  trangThaiKinhDoanh: string;
  trangThaiSanPham: string;
  tongSoLuong: number;
  soLuongDiDuong: number;
  soLuongThucTe: number;
  soLuongDaDat: number;
  soLuongCoTheBan: number;
  sucBan: string;
  saleAverage: number;
  saleEstimate: number;
}

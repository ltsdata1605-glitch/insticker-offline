import React from 'react';
import { AppIcon } from '../../components/shared/ui/icon/AppIcon';
import { Button } from '../../components/shared/ui/Button';
import { Modal } from '../../components/shared/ui/Modal';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEATURES = [
  'Tìm kiếm sản phẩm theo mã hoặc tên.',
  'Quét mã vạch bằng camera để chọn nhanh.',
  'Sắp xếp theo giá, % giảm, thưởng hoặc tên sản phẩm.',
  'Tùy chỉnh số lượng sticker cần in.',
  'Lưu danh sách in để dùng lại sau này.',
  'Nhập danh sách bằng file Excel hoặc dán từ bảng tính: một cột mã, một cột số lượng.',
  'Bố cục 1, 2, 4, 8, 16, 24 sticker/trang hoặc máy in bill K80.',
];

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Mở In bảng giá trên ERP',
    body: (
      <>
        Vào <span className="font-medium">ERP &gt; In bảng giá</span>. Chọn ngành hàng (<span className="font-medium">ĐGD, DCNB, Phụ kiện</span>), nhóm hàng chọn <span className="font-medium">Tất cả</span>, vị trí trưng bày chọn <span className="font-medium">2 - Kệ trưng bày</span>.
      </>
    ),
  },
  {
    title: 'Xuất file giá',
    body: (
      <>
        Chọn mẫu in <span className="font-bold">81</span> &gt; In &gt; xuất định dạng <span className="font-medium">"Excel Workbook Data-only (*.xlsx)"</span>. Mỗi lần chỉ xuất được một ngành hàng, nên làm lần lượt cho từng ngành.
      </>
    ),
  },
  {
    title: 'Nạp vào app',
    body: <>Bấm ô <span className="font-bold text-emerald-600">"Bảng Giá"</span> và chọn tất cả các file vừa xuất. App gộp lại thành một bảng giá.</>,
  },
  {
    title: 'Chọn sản phẩm và in',
    body: <>Tìm theo mã, tên hoặc quét mã để thêm sản phẩm vào danh sách, chỉnh số tem rồi bấm <span className="font-medium">In đã chọn</span> hoặc <span className="font-medium">In tất cả</span>.</>,
  },
];

const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={
      <span className="flex items-center gap-3">
        <span className="p-2 bg-sky-50 rounded-control">
          <AppIcon name="guide" size="lg" className="text-sky-600" />
        </span>
        Hướng dẫn sử dụng
      </span>
    }
    titleColorClass="text-slate-900"
    subTitle="In Sticker offline"
    maxWidth="lg"
    footer={
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>Đã hiểu</Button>
      </div>
    }
  >
    <div className="modal-bleed p-6 space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-4">
          <AppIcon name="refresh" size="lg" className="text-sky-500" />
          <h3 className="text-base font-bold text-slate-800">1. Nguyên lý hoạt động</h3>
        </div>
        <div className="bg-slate-50 rounded-popup p-4 border border-slate-100">
          <p className="text-sm text-slate-600 leading-relaxed">
            App chạy không cần mạng và không cần đăng nhập. Bảng giá, danh sách đã lưu và sản phẩm nhập tay đều nằm trên máy này.
            Muốn chuyển dữ liệu sang máy khác, dùng nút <span className="font-semibold">Sao lưu</span> ở thanh trên cùng để tạo file, rồi khôi phục từ file đó ở máy kia.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <AppIcon name="user" size="lg" className="text-sky-500" />
          <h3 className="text-base font-bold text-slate-800">2. Chức năng chính</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FEATURES.map((item) => (
            <div key={item} className="flex items-start gap-3 p-3 bg-white border border-slate-100 rounded-control shadow-sm">
              <AppIcon name="success" size="md" className="text-emerald-500 mt-0.5" />
              <span className="text-sm text-slate-600">{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <AppIcon name="database" size="lg" className="text-emerald-500" />
          <h3 className="text-base font-bold text-slate-800">3. Quy trình nạp dữ liệu</h3>
        </div>
        <div className="relative pl-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 space-y-6">
          {STEPS.map((step, index) => (
            <div key={step.title} className="relative">
              <div className="absolute -left-8 top-0 w-6 h-6 bg-sky-600 text-white rounded-full flex items-center justify-center text-xs font-bold">{index + 1}</div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">{step.title}</h4>
              <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  </Modal>
);

export default UserGuideModal;

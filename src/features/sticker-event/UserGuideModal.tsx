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
  'Lọc sản phẩm theo ngành hàng, nhóm hàng.',
  'Tùy chỉnh số lượng sticker cần in.',
  'Lưu danh sách in để dùng lại sau này.',
  'Bố cục 1, 2, 4, 8, 16, 24 sticker/trang hoặc máy in bill K80.',
];

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Lấy dữ liệu từ Report',
    body: (
      <>
        Bấm <a href="https://report.mwgroup.vn/home/dashboard/4286" target="_blank" rel="noopener noreferrer" className="text-rose-600 font-bold underline hover:text-rose-800">"Lấy File Tồn Kho"</a> (cần mạng công ty, mở bằng trình duyệt của máy).
        Chọn các nhóm cần in giá: <span className="font-medium">ĐGD, DCNB, Phụ Kiện</span>. Chọn siêu thị và trạng thái <span className="font-medium">MỚI</span>. Xem báo cáo và tải file về máy.
      </>
    ),
  },
  {
    title: 'Nạp tồn kho',
    body: <>Chọn file vừa tải ở bước 1 tại ô <span className="font-bold text-sky-600">"Tồn Kho"</span>.</>,
  },
  {
    title: 'Nhận file mẫu',
    body: <>Chờ trong giây lát. <span className="font-medium text-emerald-600">File mẫu in giá theo từng ngành hàng sẽ tự lưu vào thư mục Tải về của máy.</span></>,
  },
  {
    title: 'Xuất file giá từ ERP và nạp vào app',
    body: (
      <>
        Vào ERP &gt; In giá. Chọn lần lượt từng ngành hàng (<span className="font-medium">ĐGD, DCNB, Phụ kiện</span>), nhóm hàng chọn <span className="font-medium">Tất cả</span>.
        Chọn <span className="font-medium">"Thêm sản phẩm"</span> &gt; <span className="font-medium">"Nhập Excel"</span> &gt; chọn file mẫu ở bước 3.
        Chọn mẫu in <span className="font-bold">81</span> &gt; In bảng giá &gt; Xuất file định dạng <span className="font-medium">"Data-only(*.xlsx)"</span>.
        Làm lần lượt cho từng ngành hàng, cuối cùng chọn tất cả các file giá vừa xuất tại ô <span className="font-bold text-emerald-600">"Bảng Giá"</span>.
      </>
    ),
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
            App chạy không cần mạng và không cần đăng nhập. Bảng giá, tồn kho, danh sách đã lưu và sản phẩm nhập tay đều nằm trên máy này.
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

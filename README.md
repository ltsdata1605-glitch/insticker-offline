# In Sticker offline

App in sticker cho macOS và Windows, dùng và in không cần mạng (chỉ vào mạng để cập nhật). Giao diện và mẫu tem lấy từ chức năng In Sticker của dự án dashboard.

## Yêu cầu

- Máy chạy app: macOS Ventura trở lên hoặc Windows 10/11 64-bit.
- Máy phát triển: Node 22.12 trở lên. Với Node 22.11, bước cài Electron sẽ lỗi; khi đó tải Electron bằng lệnh:
  `NODE_OPTIONS=--experimental-require-module node node_modules/electron/install.js`

## Lệnh thường dùng

| Lệnh | Việc làm |
|---|---|
| `npm start` | Build rồi chạy app |
| `npm test` | Chạy test đơn vị |
| `npm run typecheck` | Kiểm tra kiểu |
| `npm run pack:mac` | Tạo app Mac tại `release/mac-arm64/` |
| `npm run pack:mac:zip` | Tạo tệp zip Mac cho chip Apple và Intel |
| `npm run pack:win` | Tạo tệp zip Windows trong `release/` |
| `npm run test:e2e` | Chạy toàn bộ test trên app Electron thật |
| `npm run test:cap-nhat` | Thử cập nhật thật từ bản cũ lên bản mới |
| `npm run test:lo-lon` | Kiểm tra app không đơ khi dựng 4.000 phiếu |
| `npm run test:parity` | In từng chế độ ra PDF và so với bản web (macOS) |
| `node scripts/kiem-tra-dong-goi.mjs "<tệp chạy>"` | Chạy thử bản đã đóng gói (macOS) |

## Cấu trúc

- `electron/`: cửa sổ app, địa chỉ nội bộ `app://sticker`, chặn mạng, luồng in (`printJobs.ts`).
- `src/features/sticker-event/`, `src/components/shared/`: code chép từ dashboard, sửa ít nhất có thể.
- `src/platform/`: phần riêng của app, gồm tài liệu in và màn xem trước.
- `public/`: ảnh nền tem và phông chữ. Phông Google chép bằng `npm run fonts`.
- `tests/baseline/`: ảnh bản in của web, tạo từ Google Chrome thật bằng `npm run baseline:web` (cần dev server dashboard chạy ở cổng 5173).

## Nguồn code và những chỗ khác bản web

Chép từ dashboard tại commit `37ee99b`. Khi web có bản sửa mới, so với commit này rồi chuyển phần cần sang đây.

Những file đã thay hoặc sửa:

- Viết lại gọn: `contexts/LayoutContext.tsx`, `utils/dataUtils.ts`, `utils/localDbScope.ts`, `services/dbService.ts`, `components/layout/HeaderSystemGroup.tsx`, `components/shared/ui/googleFonts.ts`.
- `features/sticker-event/hooks/useStickerPrinterData.ts`: bỏ Firebase, in qua `openPrintPreview`, mã vạch trên tem trong hàng đợi đi theo nút bật tắt (web luôn in).
- `features/sticker-event/services/printService.ts`: bỏ nhánh điện thoại và iframe, in qua `openPrintPreview`, dùng phông trong app.
- `features/sticker-event/stickerprinter/pageHtmlUtils.ts`: sửa lệch ô số tiền giảm giữa xem trước và bản in.
- `features/sticker-event/stickerprinter/StickerPrintControls.tsx`: đổi hướng dẫn in.
- `features/sticker-event/StickerPrinterView.tsx`: bỏ đăng nhập app gốc, nạp tab Sticker trực tiếp.
- `features/sticker-event/StickerEventApp.tsx`, `hooks/useStickerEventDb.ts`, `hooks/useStickerEventFile.ts`, `hooks/useStickerEventState.ts`, `hooks/useStickerEventPrint.ts`, `services/fileParser.ts`, `SavedListsModal.tsx`, `ManualInputModal.tsx`, `ControlPanel.tsx`, `UserGuideModal.tsx`: bỏ Firebase, đăng nhập và phân quyền, lưu trên máy.
- Bỏ theo yêu cầu: nạp tồn kho, link lấy file tồn, file mẫu theo ngành hàng, bộ lọc ngành/nhóm hàng, số tem và sắp xếp theo tồn. `InventoryToolbar.tsx` đổi thành `ProductToolbar.tsx`, `FilterModal.tsx` chỉ còn sắp xếp.
- Mới: `services/localDataService.ts`, thư mục `platform/` (xem trước bản in, sao lưu, thông báo tệp tải về).
- Bảng giá ghép từ nhiều file (`services/priceSources.ts`): mỗi file đã nhập lưu riêng ở khoá `priceSources`, `products` là bản đã ghép, file nhập sau ghi đè giá khi trùng mã. Bản web nhập file mới là thay cả bảng. Lịch sử nhập ở khoá `priceImportHistory`. Màn mới: `PriceSourcesModal.tsx`, `PriceImportHistoryModal.tsx`.
- `SearchBar.tsx`: chọn gợi ý bằng phím mũi tên, Enter để thêm, con trỏ về lại ô tìm kiếm sau khi thêm; mã khớp đúng đứng đầu gợi ý.
- Không chép: `Login.tsx`, `UserManagementModal.tsx`, `SuperAdminModal.tsx`, `ChangePasswordModal.tsx`, `PdfPreviewModal.tsx`, `firebase.ts`, `services/firebaseService.ts`, `services/sessionService.ts`, `services/adminUserService.ts`, `services/sessionSyncPolicy.ts`, `hooks/useStickerEventAuth.ts`.

## Cập nhật và phát hành

- `electron/updater.ts`: kiểm tra, tải, xác minh SHA-512 rồi cài. Windows chạy bộ cài NSIS im lặng; Mac thay app rồi mở lại, không dùng `electron-updater` vì cơ chế của nó từ chối app chưa có Apple Developer ID. Từng bước được ghi vào `cap-nhat.log` trong thư mục dữ liệu của app, xem tệp này đầu tiên khi cập nhật lỗi.
- Nguồn tải là repo công khai `insticker-offline-releases`, chỉ chứa tệp cài. Mã nguồn vẫn ở repo riêng tư.
- Bản phát hành đến thẳng mọi máy và **khoá app tới khi cập nhật**, nên chỉ phát hành khi build đã xanh: `npm run phat-hanh -- <thư mục bản Mac> <thư mục bản Windows>`. Script này kiểm tra đủ tệp và đúng phiên bản trước khi tạo release.
- Ai có quyền đưa file lên repo phát hành là có thể đưa code tới mọi máy, vì bản Mac và Windows chưa ký số. Hãy bật xác thực hai lớp cho tài khoản GitHub.

## Kiểm thử

- `npm run typecheck`, `npm test`: kiểu và test đơn vị.
- `npm run test:e2e`: chạy app Electron thật cho từng chức năng, dữ liệu tạm, không gửi gì ra máy in.
- `npm run test:lo-lon`: dựng 4.000 phiếu với đồng hồ đặt trong app, không gắn Playwright vì gắn vào sẽ làm app chậm đi nhiều trên máy yếu. Lỗi nếu màn chờ hiện sau 2 giây hoặc app đứng quá 5 giây.
- `npm run test:parity`: in từng chế độ ra PDF và so với bản Chrome thật trong `tests/baseline/` (cần macOS vì dùng `sips`).
- `npm run test:cap-nhat`: đóng gói hai phiên bản, chạy bản cũ rồi để app tự tải và tự thay sang bản mới từ máy chủ cục bộ. Lỗi thỉnh thoảng mới xuất hiện thì lặp nhiều vòng: `LAP=12 CHO_GIAY=150 npm run test:cap-nhat`; vòng nào lỗi sẽ in nhật ký của app, tiến trình và chụp màn hình.
- `.github/workflows/build.yml`: chạy test và đóng gói trên máy thật. Chạy tay chỉ Windows (`gh workflow run build.yml`), đẩy tag `v*` thì cả Windows và Mac. Tệp cài nằm ở mục Artifacts của lượt chạy.

Hướng dẫn cho người dùng ở `HUONG_DAN_SU_DUNG.md`.

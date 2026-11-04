# In Sticker offline

App in sticker cho macOS và Windows, chạy không cần mạng. Giao diện và mẫu tem lấy từ chức năng In Sticker của dự án dashboard.

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
- Mới: `services/localDataService.ts`, thư mục `platform/` (xem trước bản in, sao lưu, thông báo tệp tải về).
- Không chép: `Login.tsx`, `UserManagementModal.tsx`, `SuperAdminModal.tsx`, `ChangePasswordModal.tsx`, `PdfPreviewModal.tsx`, `firebase.ts`, `services/firebaseService.ts`, `services/sessionService.ts`, `services/adminUserService.ts`, `services/sessionSyncPolicy.ts`, `hooks/useStickerEventAuth.ts`.

## Kiểm thử

- `npm run typecheck`, `npm test`: kiểu và test đơn vị.
- `npm run test:e2e`: chạy app Electron thật cho từng chức năng, dữ liệu tạm, không gửi gì ra máy in.
- `npm run test:parity`: in từng chế độ ra PDF và so với bản Chrome thật trong `tests/baseline/` (cần macOS vì dùng `sips`).
- `.github/workflows/build.yml`: chạy test và đóng gói trên máy thật. Chạy tay chỉ Windows (`gh workflow run build.yml`), đẩy tag `v*` thì cả Windows và Mac. Tệp cài nằm ở mục Artifacts của lượt chạy.

Hướng dẫn cho người dùng ở `HUONG_DAN_SU_DUNG.md`.

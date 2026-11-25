# Tools (In Sticker offline)

App Tools (tên cũ In Sticker, đổi tên ở 1.6.0) cho macOS và Windows: In Sticker, Kiểm hàng, Kiểm quỹ, Nhắc việc, Tạo mã, dùng và in không cần mạng (chỉ vào mạng để cập nhật). Giao diện và mẫu tem lấy từ chức năng In Sticker của dự án dashboard.

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
| `npm run test:parity` | In từng chế độ ra PDF và so với bản web (macOS) |
| `node scripts/kiem-tra-dong-goi.mjs "<tệp chạy>"` | Chạy thử bản đã đóng gói (macOS) |

## Cấu trúc

- `electron/`: cửa sổ app, địa chỉ nội bộ `app://sticker`, chặn mạng (trừ cập nhật, đọc Google Sheet và cầu nối nhắc việc, qua phiên riêng trong main process), luồng in (`printJobs.ts`), nhắc việc chạy nền (`reminders.ts`).
- `src/features/sticker-event/`, `src/components/shared/`: code chép từ dashboard, sửa ít nhất có thể.
- `src/platform/`: phần riêng của app, gồm tài liệu in và màn xem trước.
- `public/`: ảnh nền tem và phông chữ. Phông Google chép bằng `npm run fonts`.
- `tests/baseline/`: ảnh bản in của web, tạo từ Google Chrome thật bằng `npm run baseline:web` (cần dev server dashboard chạy ở cổng 5173).

## Nguồn code và những chỗ khác bản web

Chép từ dashboard tại commit `37ee99b`. Khi web có bản sửa mới, so với commit này rồi chuyển phần cần sang đây.

Những file đã thay hoặc sửa:

- Viết lại gọn: `contexts/LayoutContext.tsx`, `utils/dataUtils.ts`, `utils/localDbScope.ts`, `services/dbService.ts`, `components/layout/HeaderSystemGroup.tsx`, `components/shared/ui/googleFonts.ts`.
- `features/sticker-event/hooks/useStickerPrinterData.ts`: bỏ Firebase, in qua `openPrintPreview`, sticker có mã luôn in mã vạch (đã bỏ nút bật tắt).
- `features/sticker-event/services/printService.ts`: bỏ nhánh điện thoại và iframe, in qua `openPrintPreview`, dùng phông trong app.
- `features/sticker-event/stickerprinter/pageHtmlUtils.ts`: sửa lệch ô số tiền giảm giữa xem trước và bản in.
- `features/sticker-event/stickerprinter/StickerPrintControls.tsx`: đổi hướng dẫn in.
- `features/sticker-event/StickerPrinterView.tsx`: bỏ đăng nhập app gốc, nạp tab Sticker trực tiếp.
- `features/sticker-event/StickerEventApp.tsx`, `hooks/useStickerEventDb.ts`, `hooks/useStickerEventFile.ts`, `hooks/useStickerEventState.ts`, `hooks/useStickerEventPrint.ts`, `services/fileParser.ts`, `SavedListsModal.tsx`, `ManualInputModal.tsx`, `ControlPanel.tsx`, `UserGuideModal.tsx`: bỏ Firebase, đăng nhập và phân quyền, lưu trên máy.
- Bỏ theo yêu cầu: nạp tồn kho, link lấy file tồn, file mẫu theo ngành hàng, bộ lọc ngành/nhóm hàng, số tem và sắp xếp theo tồn. `InventoryToolbar.tsx` đổi thành `ProductToolbar.tsx`, `FilterModal.tsx` chỉ còn sắp xếp.
- Mới: `services/localDataService.ts`, thư mục `platform/` (xem trước bản in, sao lưu, thông báo tệp tải về).
- Bảng giá ghép từ nhiều file (`services/priceSources.ts`): mỗi file đã nhập lưu riêng ở khoá `priceSources`, `products` là bản đã ghép, file nhập sau ghi đè giá khi trùng mã. Bản web nhập file mới là thay cả bảng. Lịch sử nhập ở khoá `priceImportHistory`. Màn mới: `PriceSourcesModal.tsx`, `PriceImportHistoryModal.tsx`.
- Nút xoá bảng giá (bản web là nút "Xóa DL" trong `ControlPanel.tsx`) chuyển lên cụm nút cuối thanh trên, chỉ có biểu tượng thùng rác, chỉ hiện ở tab Event. Màn Event đặt nút vào chỗ trống của cụm qua `platform/HeaderSlot.tsx`.
- Tab Sticker của web đổi tên thành **Event**. Tab **Sticker** mới (chỉ có ở app, nằm giữa Giờ Vàng và Phiếu) dùng danh sách và các nút nhập của Giá Sốc (`stickerMode === 'tag'`, `stickerType` là `gia_soc`). Khung xem trước là `stickerprinter/TagPreviewPanel.tsx`: tem giá dựng bằng chính HTML và CSS bản in (`buildPriceTagPreview` trong `services/printService.ts`, hiện trong shadow DOM qua `stickerprinter/TagRender.tsx`), chọn kiểu tem và sửa nội dung ở các ô. Bấm in thì `stickerprinter/TagPrintDialog.tsx` mở hộp chọn kiểu và bố cục của tab Event rồi in bằng `printPriceTags`; mỗi sticker đổi sang một tem qua `stickerprinter/tagProducts.ts`. Kiểu tem và bố cục lần in trước lưu ở `printSettings`, dùng chung với Event (`stickerprinter/useTagPrintSettings.ts`).
- Chức năng **Kiểm hàng** (chỉ có ở app) nằm ở `src/features/kiem-hang/`: đọc file phiếu chuyển kho và tính toán ở `kiemHangData.ts` (không đụng giao diện, có test ở `tests/unit/kiem-hang.test.ts`), báo cáo theo MYC (nhóm thiếu, kho, người chuyển, đoạn chữ để gửi Zalo) ở `kiemHangReport.ts`, xuất Excel ở `kiemHangExport.ts`, lưu phiên đang kiểm và lịch sử ở khoá `kiemHangCurrent`, `kiemHangHistory` (`kiemHangStore.ts`, có trong file sao lưu). File chi tiết không có số hoá đơn nên ghép với file phiếu theo `STORECHANGEID` = Mã phiếu chuyển. Thanh chức năng bên trái là `components/layout/ModuleRail.tsx`; chức năng đang mở lưu trong `contexts/LayoutContext.tsx`. Chức năng không mở vẫn giữ trong cây nhưng trong suốt và `inert` (`ModuleLayer` trong `App.tsx`).
- **Đổi tên In Sticker → Tools (1.6.0):** `productName` là Tools, tệp cài `Tools-<phiên bản>-…`, icon hộp đồ nghề (`scripts/tao-icon.mjs`; logo chức năng In Sticker trên thanh trên cùng là `public/in-sticker.svg`). Giữ nguyên: `appId` (vn.insticker.offline), thư mục dữ liệu `In Sticker` (đặt cứng trong `electron/main.ts`, không thì mất dữ liệu), mã định dạng file sao lưu. Trình cập nhật nhận cả `Tools.app` lẫn `In Sticker.app`, cả hai tên trình gỡ trên Windows; Windows bỏ mục khởi động cùng máy cũ trỏ tới `In Sticker.exe`. Bản In Sticker 1.5.0 trên Windows tự cập nhật lên Tools (CI thử thật bằng `BAN_CU=1.5.0 node scripts/thu-cap-nhat.mjs`); trên Mac, 1.5.0 chỉ nhận tệp có `In Sticker.app` nên không tự cập nhật được, phải tải Tools về cài tay.
- Chức năng **In nhãn** (tờ nhãn Tomy A5) nằm ở `src/features/in-nhan/`. `nhanModel.ts` (có test ở `tests/unit/in-nhan.test.ts`): mẫu Tomy 117 (tròn Ø23, 8 x 6) và 105 (37 x 24, 5 x 6) trên A5 ngang; không có số đo lề công khai, nên mỗi tem nằm giữa một ô chia đều tờ, người dùng chỉnh lệch bằng Căn chỉnh (dịch, nới khoảng cách; lưu theo mẫu). Tem chữ, QR, mã vạch dùng chung `qrSvg`, `barcodeSvg` của Tạo mã; tạo nhanh FIFO, mã tự tăng, Excel; in bằng khổ giấy `a5` (thêm vào `PrintPaper`). Lưu ở khoá `inNhanState` (có trong file sao lưu).
- Chức năng **Kiểm quỹ** nằm ở `src/features/kiem-quy/`. `kiemQuyModel.ts` (không đụng giao diện, có test ở `tests/unit/kiem-quy.test.ts`): mệnh giá, tổng, chênh lệch với số theo sổ, số tiền bằng chữ, báo cáo dạng chữ. Lần đang đếm ghi vào khoá `kiemQuyCurrent` sau mỗi lần sửa (tắt app vẫn còn), lịch sử ở `kiemQuyHistory` (`kiemQuyStore.ts` ghi lần lượt; cả hai có trong file sao lưu).
- Chức năng **Tạo mã** nằm ở `src/features/tao-ma/`. `maCode.ts` (không đụng giao diện, có test ở `tests/unit/tao-ma.test.ts`): mã vạch Code 128 tự viết (tự chuyển bộ B và C, số kiểm tra), mã QR qua thư viện `qrcode`, cả hai ra SVG; chia lưới A4 theo số mã mỗi trang và loại mã; một hàm dựng HTML trang dùng chung cho xem trước, ảnh theo trang và in (`printDocument`, mỗi trang có lớp `print-page` để màn in đếm trang). Phông Roboto Condensed của trang mã đặt `!important` vì bộ chọn phông của app ép phông lên mọi thẻ div. `maImage.ts`: ảnh từng mã vẽ thẳng lên canvas, ảnh theo trang chụp bằng `exportElementAsImage`. Danh sách và cài đặt lưu ở khoá `taoMaItems`, `taoMaSettings` (có trong file sao lưu).
- Chức năng **Nhắc việc** (chỉ có ở app) nằm ở `src/features/nhac-viec/`. Lịch nhắc tính ở `nhacViecModel.ts` (lặp ngày, tuần, tháng; nhắc trước hạn; hoãn; việc khẩn nhắc lại mỗi 10 phút; nhắc bị lỡ; checklist; thống kê; có test ở `tests/unit/nhac-viec.test.ts`). `NhacViecProvider.tsx` bọc cả app, kiểm tra nhắc mỗi 5 giây kể cả khi cửa sổ ẩn (`backgroundThrottling: false`), lưu ở các khoá `nhacViec*` (có trong file sao lưu). Mọi nhắc nằm chung **một** bảng nhắc: cửa sổ riêng luôn nằm trên cùng (`electron/reminders.ts` giữ danh sách nhắc, đẩy qua `reminder:popup-items`), mở cùng bản dựng với địa chỉ `?popup=nhac-viec` (`ReminderPopup.tsx`, báo chiều cao nội dung để cửa sổ co giãn). Bảng đang kêu thì `electron/volume.ts` bật tiếng và mở to loa (Mac: AppleScript; Windows: Core Audio qua `am-luong.ps1` ghi vào thư mục dữ liệu), im hoặc đóng thì trả mức cũ; bài kiểm thử chỉ ghi lại lệnh ở `__reminderHost.volume.calls`. Đóng cửa sổ chính thì ẩn và chạy nền ở khay hệ thống; `powerSaveBlocker('prevent-app-suspension')` giữ máy không tự ngủ, Mac thêm `NSAppSleepDisabled`. Cài đặt chạy nền, khởi động cùng máy (bật sẵn, mỗi lần mở app đăng ký lại theo đường dẫn hiện tại), giữ máy thức, mở to âm lượng lưu ở `chay-nen.json` trong thư mục dữ liệu, không có trong file sao lưu. Âm thanh ở `sounds.ts`: 5 chuông tự tạo bằng Web Audio, đọc chữ bằng giọng có sẵn trong máy (app chặn mạng), file nhập vào và ghi âm. Bài test dời đồng hồ bằng `window.__nhacViecOffset` rồi gọi `window.__nhacViecTick()`. Giọng đọc: danh sách giọng nạp chậm lúc cửa sổ mới mở, `loadVoices()` chờ đến khi có giọng tiếng Việt (tối đa 8 giây), nếu không máy đọc bằng giọng mặc định tiếng Anh.
- Nhận việc từ Google Sheet (`sheetTasks.ts`, có test ở `tests/unit/nhac-viec-sheet.test.ts`): file mẫu công khai `TEMPLATE_SHEET_ID` nằm trong Drive của chủ dự án, dựng bằng Google Apps Script `scripts/google-sheet/tao-mau-nhac-viec.gs` (dán vào script.google.com, chạy `taoMauNhacViec`; script dựng lại đúng file có mã đó nên link không đổi). Nút Tạo file nhắc việc mở trang `/copy` của file mẫu. App tải cả file người dùng dạng .xlsx (`/export?format=xlsx`) qua phiên mạng riêng trong main process (`fetchSheetFile` trong `electron/reminders.ts`), chỉ tới docs.google.com; giao diện vẫn bị chặn mạng. Đọc trang Nhắc việc (cột theo tên, vẫn đọc được file mẫu cũ một cột Hạn hoàn tất) và trang Checklist (các dòng cùng tên là một checklist, mã `gs-cl-<tên>`). File phải chia sẻ cho người có link. Chỉ đọc, không ghi ngược. Việc từ file có `source.taskId` = cột Mã việc; xoá dòng hoặc ghi Huỷ thì bỏ khỏi app. Nút Dán link đã sao chép đọc clipboard qua main process, chỉ trả về khi là link Google Sheet. Bài test đặt `STICKER_SHEET_MOCK` là tệp .xlsx để không ra mạng.
- Đồng bộ hai chiều (`sheetBridge.ts`, test ở `tests/unit/nhac-viec-cau-noi.test.ts` và `tests/e2e/nhac-viec-dong-bo.spec.ts`): script cầu nối `scripts/google-sheet/cau-noi-nhac-viec.gs` dán trong file mẫu (Tiện ích mở rộng → Apps Script; bản sao của file mẫu tự có), thêm menu Nhắc việc (Giao việc nhanh, Nhân bản dòng, Đánh dấu xong, Bật đồng bộ hai chiều). Quản lý triển khai script thành ứng dụng web (Thực thi bằng: Tôi, Bất kỳ ai) và gửi Link kết nối `…/exec?k=<mã>` cho các máy. App gọi qua `callBridge` trong `electron/reminders.ts` (chỉ tới script.google.com và googleusercontent.com): GET `&a=doc&since=<dấu phiên bản>` trả các trang (giá trị hiển thị), các lần xong ở trang Nhật ký (40 ngày) và danh sách người; POST `{ by, ops }` với `upsert` (tạo vào dòng chưa dùng đầu tiên hoặc sửa, nhớ mã theo `ref` 6 giờ để gửi lại không tạo trùng), `cancel` (ghi Huỷ), `done` (Người xong, Xong lúc, Xong với việc một lần, một dòng Nhật ký), `report` (trang Báo cáo checklist). Thay đổi trên máy vào hàng chờ `outbox` trong `nhacViecState`, gửi trước rồi mới đọc; trong lúc đọc có thay đổi mới thì bỏ bản đọc đó. Phần "Lõi" của script không gọi dịch vụ Google: test nạp chính file .gs bằng `vm` (`tests/e2e/cau-noi-gia.ts`, cũng là cầu nối giả cho e2e ở 127.0.0.1, main chỉ cho phép khi chạy test). Sửa script thì quản lý phải triển khai phiên bản mới (Quản lý bản triển khai → Phiên bản mới), Link kết nối giữ nguyên. Khung Bật đồng bộ chỉ dùng URL ứng dụng web quản lý dán vào (lưu kèm mã file `urlChoFile`, như mã kết nối `khoaChoFile`, nên bản sao không mang theo), không đoán bằng `ScriptApp.getService().getUrl()`: hàm này có lúc trả mã triển khai không có thật, link báo không tìm thấy cầu nối.
- `SearchBar.tsx`: chọn gợi ý bằng phím mũi tên, Enter để thêm, con trỏ về lại ô tìm kiếm sau khi thêm; mã khớp đúng đứng đầu gợi ý.
- Không chép: `Login.tsx`, `UserManagementModal.tsx`, `SuperAdminModal.tsx`, `ChangePasswordModal.tsx`, `PdfPreviewModal.tsx`, `firebase.ts`, `services/firebaseService.ts`, `services/sessionService.ts`, `services/adminUserService.ts`, `services/sessionSyncPolicy.ts`, `hooks/useStickerEventAuth.ts`.

## Bật tắt tab (dành cho người quản lý)

- Bấm 7 lần liên tiếp vào logo (mỗi lần cách nhau dưới 1,5 giây), nhập mật khẩu để mở bảng bật tắt các tab Giá Sốc, Giờ Vàng, Sticker, Phiếu, Event và các chức năng Kiểm hàng, Nhắc việc (tắt Nhắc việc thì app không nhắc nữa). Tab Event mặc định tắt; luôn phải còn ít nhất một tab. Chỉ còn một chức năng bật thì thanh bên trái ẩn đi. Mật khẩu mặc định `12345`, đổi được ngay trong bảng.
- Mã ở `src/features/sticker-event/tabAccess.ts` và `TabAccessDialog.tsx`. Tab bị tắt và mật khẩu (chỉ lưu dạng băm SHA-256 có muối) nằm trong localStorage, tức thư mục dữ liệu của app. Hai mục này cố ý không có trong file sao lưu, nên khôi phục file sao lưu không mở lại được tab.
- Quên mật khẩu thì không lấy lại được. Chỉ xoá app thôi chưa đủ vì dữ liệu nằm riêng trong hồ sơ người dùng: phải xoá cả thư mục dữ liệu (Mac: `~/Library/Application Support/In Sticker`, Windows: `%APPDATA%\In Sticker`; app đã đổi tên thành Tools nhưng vẫn giữ thư mục này) rồi cài lại. Thao tác này xoá luôn bảng giá, danh sách và lịch sử; khôi phục lại bằng file sao lưu nếu có. Mật khẩu về `12345`, các tab về mặc định (Event tắt).
- Cố ý không ghi vào HUONG_DAN_SU_DUNG.md để nhân viên không biết cách mở.

## Cập nhật và phát hành

- `electron/updater.ts`: kiểm tra, tải, xác minh SHA-512 rồi cài. Windows chạy bộ cài NSIS im lặng; Mac thay app rồi mở lại, không dùng `electron-updater` vì cơ chế của nó từ chối app chưa có Apple Developer ID. Từng bước được ghi vào `cap-nhat.log` trong thư mục dữ liệu của app, xem tệp này đầu tiên khi cập nhật lỗi.
- Nguồn tải là repo công khai `insticker-offline-releases`, chỉ chứa tệp cài. Repo mã nguồn `insticker-offline` cũng để công khai: để riêng tư thì GitHub Actions bị chặn vì tài khoản không có thanh toán, không build được.
- Bản phát hành đến thẳng mọi máy và **khoá app tới khi cập nhật**, nên chỉ phát hành khi build đã xanh: `npm run phat-hanh -- <thư mục bản Mac> <thư mục bản Windows>`. Script này kiểm tra đủ tệp và đúng phiên bản trước khi tạo release.
- Mac còn In Sticker 1.5.x: bộ cập nhật cũ lấy tệp zip đầu tiên đúng chip trong `latest-mac.yml` và chỉ nhận thư mục `In Sticker.app`. CI chạy `scripts/zip-ten-cu.mjs` để thêm bản zip `InSticker-…-mac-….zip` lên đầu danh sách; `phat-hanh` từ chối nếu thiếu. Bộ cập nhật của Tools 1.6.0 tới 1.7.0 cũng lấy tệp zip đầu tiên, nhưng ưu tiên `Tools.app` và đặt tên app theo thư mục trong zip, nên bản zip tên cũ chứa cả `In Sticker.app` và `Tools.app` (cùng một app, chữ ký không đổi khi đổi tên thư mục, zip nặng gấp đôi): máy 1.5.x giữ `In Sticker.app`, máy 1.6.0 tới 1.7.0 giữ `Tools.app`. App từ 1.7.1 chọn bản zip `Tools-…`, và lần cập nhật sau đổi thư mục `In Sticker.app` thành `Tools.app`. CI Mac thử cập nhật thật từ In Sticker 1.5.0 và Tools 1.6.0.
- Mac: mở bản mới hơn trong khi bản cũ (cùng thư mục dữ liệu) đang chạy nền thì bản mới tắt bản cũ rồi tự mở lại, không chỉ đưa cửa sổ bản cũ lên (`electron/takeover.ts`).
- Ai có quyền đưa file lên repo phát hành là có thể đưa code tới mọi máy, vì bản Mac và Windows chưa ký số. Hãy bật xác thực hai lớp cho tài khoản GitHub.

## Kiểm thử

- `npm run typecheck`, `npm test`: kiểu và test đơn vị.
- `npm run test:e2e`: chạy app Electron thật cho từng chức năng, dữ liệu tạm, không gửi gì ra máy in.
- `npm run test:parity`: in từng chế độ ra PDF và so với bản Chrome thật trong `tests/baseline/` (cần macOS vì dùng `sips`).
- `npm run test:cap-nhat`: đóng gói hai phiên bản, chạy bản cũ rồi để app tự tải và tự thay sang bản mới từ máy chủ cục bộ. Lỗi thỉnh thoảng mới xuất hiện thì lặp nhiều vòng: `LAP=12 CHO_GIAY=150 npm run test:cap-nhat`; vòng nào lỗi sẽ in nhật ký của app, tiến trình và chụp màn hình.
- `.github/workflows/build.yml`: chạy test và đóng gói trên máy thật. Chạy tay chỉ Windows (`gh workflow run build.yml`), đẩy tag `v*` thì cả Windows và Mac. Tệp cài nằm ở mục Artifacts của lượt chạy.

Hướng dẫn cho người dùng ở `HUONG_DAN_SU_DUNG.md`.

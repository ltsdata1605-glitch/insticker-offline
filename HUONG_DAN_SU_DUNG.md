# Hướng dẫn sử dụng In Sticker

App chạy không cần mạng và không cần đăng nhập. Dữ liệu nằm trên từng máy.

## Cài đặt

**Mac (macOS Ventura trở lên):** giải nén rồi kéo `In Sticker.app` vào thư mục Applications. Chọn bản đúng chip: `arm64` cho Mac M1 trở lên, `x64` cho Mac Intel. Lần đầu máy sẽ chặn vì app chưa ký số: vào System Settings > Privacy & Security, kéo xuống và bấm **Open Anyway**.

**Windows 10/11 64-bit:** giải nén tệp zip vào một thư mục cố định rồi chạy `In Sticker.exe`. Nếu hiện cảnh báo SmartScreen: bấm **More info**, rồi **Run anyway**. Cập nhật bản mới bằng cách giải nén đè; dữ liệu không mất vì được lưu riêng trong hồ sơ người dùng.

## Bốn chế độ

| Tab | Dùng để | Nguồn dữ liệu |
|---|---|---|
| **Giá Sốc** | Tem A4 giá sốc | File giá ĐSD - TBBM, file mẫu, file ERP mẫu 97 và 99, hoặc gõ trực tiếp trên tem |
| **Giờ Vàng** | Tem A4 giờ vàng, có thời gian và số suất | Như Giá Sốc |
| **Phiếu** | Phiếu rút thăm, 4 phiếu mỗi trang, tự nhảy số | Gõ trực tiếp vào phiếu 1, các phiếu còn lại tự theo |
| **Sticker** | Tem giá 1 đến 24 tem mỗi trang hoặc máy in bill K80 | Bảng giá ERP mẫu 81, nhập tay, quét mã |

## In

Bấm in sẽ mở màn xem trước. App tự đặt khổ giấy, không lề và có in nền, không cần chỉnh như khi in trên Chrome.

- **In ngay:** in thẳng ra máy in đã chọn. App nhớ máy in dùng lần trước.
- **Mở hộp thoại in của hệ thống:** dùng khi cần chỉnh thêm, hoặc khi In ngay ra sai khổ trên một máy in nào đó.
- **Lưu PDF:** lưu đủ tất cả các trang ra tệp PDF.

Lô lớn như 4.000 phiếu cần vài chục giây để dựng. Khung xem trước chỉ hiện 3 trang đầu cho nhanh, còn bản in và PDF vẫn đủ trang.

## Nạp dữ liệu cho tab Sticker

1. Vào ERP > In bảng giá. Chọn ngành hàng, nhóm hàng **Tất cả**, vị trí trưng bày **2 - Kệ trưng bày**.
2. Chọn mẫu in **81**, bấm In rồi xuất **Excel Workbook Data-only (*.xlsx)**. Mỗi lần chỉ xuất được một ngành hàng.
3. Bấm ô **Bảng Giá** trong app và chọn tất cả các file vừa xuất. App gộp lại thành một bảng giá.
4. Tìm theo mã, tên hoặc quét mã để thêm sản phẩm vào danh sách, chỉnh số tem rồi in.

## File tải về

Mọi file app tạo ra (file mẫu Excel, file JSON, ảnh xuất, file sao lưu) tự lưu vào thư mục Tải về của máy, không ghi đè tệp cũ. Thông báo góc màn hình có nút **Mở thư mục**.

## Chuyển dữ liệu sang máy khác

Bấm nút hình trụ ở góc trên bên phải (Sao lưu và khôi phục):

1. Trên máy cũ, bấm **Sao lưu ra file**.
2. Chép file `in-sticker-sao-luu-….json` sang máy mới.
3. Trên máy mới, bấm **Khôi phục từ file**. Thao tác này thay toàn bộ dữ liệu đang có trên máy mới.

File gồm bảng giá, sản phẩm nhập tay, danh sách đã lưu, lịch sử in và cài đặt.

## Quét mã

Bấm nút quét cạnh ô tìm kiếm. Lần đầu máy sẽ hỏi quyền camera; nếu đã từ chối, bật lại trong phần cài đặt quyền riêng tư của máy. Máy quét mã USB hoạt động như bàn phím: bấm vào ô tìm kiếm rồi quét, sau đó chọn sản phẩm trong danh sách gợi ý.

## Khác với bản web

- Không có đăng nhập, phân quyền, kho và đồng bộ Cloud. Danh sách đã lưu không tự sang máy khác, hãy dùng Sao lưu.
- Ai dùng máy cũng nạp được bảng giá và dùng nút **Xóa DL**.
- Không có nạp tồn kho, nên cũng không có bộ lọc ngành hàng, nhóm hàng và số tem theo tồn.
- Không có giao diện điện thoại.

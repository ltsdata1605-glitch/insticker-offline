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
| **Sticker** | Tem giá 1 đến 24 tem mỗi trang hoặc máy in bill K80 | Bảng giá ERP mẫu 81, tồn kho, nhập tay, quét mã |

## In

Bấm in sẽ mở màn xem trước. App tự đặt khổ giấy, không lề và có in nền, không cần chỉnh như khi in trên Chrome.

- **In ngay:** in thẳng ra máy in đã chọn. App nhớ máy in dùng lần trước.
- **Mở hộp thoại in của hệ thống:** dùng khi cần chỉnh thêm, hoặc khi In ngay ra sai khổ trên một máy in nào đó.
- **Lưu PDF:** lưu đủ tất cả các trang ra tệp PDF.

Lô lớn như 4.000 phiếu cần vài chục giây để dựng. Khung xem trước chỉ hiện 3 trang đầu cho nhanh, còn bản in và PDF vẫn đủ trang.

## Nạp dữ liệu cho tab Sticker

Làm theo nút **i** (Hướng dẫn sử dụng) trong tab Sticker: lấy file tồn kho, nạp vào ô **Tồn Kho**, app tự lưu file mẫu theo ngành hàng vào thư mục Tải về; dùng file mẫu đó trên ERP để xuất bảng giá mẫu 81, rồi nạp vào ô **Bảng Giá**. Link **Lấy File Tồn Kho** cần mạng công ty và mở bằng trình duyệt của máy.

## File tải về

Mọi file app tạo ra (file mẫu, file JSON, ảnh xuất, file sao lưu) tự lưu vào thư mục Tải về của máy, không ghi đè tệp cũ. Thông báo góc màn hình có nút **Mở thư mục**.

## Chuyển dữ liệu sang máy khác

Bấm nút hình trụ ở góc trên bên phải (Sao lưu và khôi phục):

1. Trên máy cũ, bấm **Sao lưu ra file**.
2. Chép file `in-sticker-sao-luu-….json` sang máy mới.
3. Trên máy mới, bấm **Khôi phục từ file**. Thao tác này thay toàn bộ dữ liệu đang có trên máy mới.

File gồm bảng giá, tồn kho, sản phẩm nhập tay, danh sách đã lưu, lịch sử in và cài đặt.

## Quét mã

Bấm nút quét cạnh ô tìm kiếm. Lần đầu máy sẽ hỏi quyền camera; nếu đã từ chối, bật lại trong phần cài đặt quyền riêng tư của máy. Máy quét mã USB hoạt động như bàn phím: bấm vào ô tìm kiếm rồi quét, sau đó chọn sản phẩm trong danh sách gợi ý.

## Khác với bản web

- Không có đăng nhập, phân quyền, kho và đồng bộ Cloud. Danh sách đã lưu không tự sang máy khác, hãy dùng Sao lưu.
- Ai dùng máy cũng nạp được bảng giá, tồn kho và dùng nút **Xóa DL**.
- Không có giao diện điện thoại.

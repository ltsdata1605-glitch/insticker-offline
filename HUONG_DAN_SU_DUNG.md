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

## Danh sách sticker ở Giá Sốc và Giờ Vàng

- **Nhập file mẫu** hoặc file ERP: mọi sản phẩm hiện thành ảnh nhỏ bên trái bản xem trước. Bấm vào ảnh để mở sticker đó lên và sửa; thay đổi được lưu ngay và in đúng theo đó.
- **Thêm**: đưa sticker đang hiện trên bản xem trước vào danh sách, sau đó soạn tiếp sticker mới mà không làm đổi sticker vừa thêm. Dòng chữ dưới bản xem trước cho biết bạn đang sửa sticker nào trong danh sách hay đang soạn sticker mới.
- Khi danh sách có sticker, **Bấm để in** in các sticker đang được chọn trong danh sách. Sticker đang soạn chưa bấm Thêm thì không được in.

## Chỉnh cỡ chữ

Ở Giá Sốc, Giờ Vàng và Phiếu, bôi đen chữ trên bản xem trước để hiện thanh định dạng:

- Nút `-` và `+` đổi cỡ chữ, ô số ở giữa là cỡ chữ hiện tại và gõ trực tiếp được. Khoảng dòng chỉnh ở nhóm kế bên.
- Bôi đen hết một ô thì đổi cả ô; bôi đen một phần thì chỉ đổi phần đó.
- Nút khôi phục trên thanh định dạng đưa ô đang chọn về cỡ chữ và khoảng dòng mặc định.
- Nút **Cỡ chữ gốc** ở khung bên phải đưa mọi ô của chế độ đang mở về mặc định. Nội dung giữ nguyên.

## Nhập và xuất danh sách

Ở tab Sticker, mục Thao tác danh sách:

- **Xuất**: tải file Excel gồm 2 cột `CODE` và `SỐ LƯỢNG`. Đang có danh sách thì điền sẵn danh sách đó, danh sách trống thì ra file mẫu chưa có dòng nào.
- **Nhập**: chọn file Excel theo mẫu, hoặc dán từ bảng tính, mỗi dòng gồm mã và số lượng:

  ```
  2714133000100	1
  4844099000052	2
  ```

  Màn nhập cho biết số sản phẩm tìm thấy, các mã không có trong bảng giá và các dòng lỗi trước khi bạn xác nhận. Cần nạp Bảng Giá trước.
- Không ghi số lượng thì tính là 1. Mã trùng nhau được cộng số lượng, tối đa 500 tem mỗi sản phẩm.
- **Thêm vào danh sách**: giữ danh sách đang có; mã đã có thì cộng thêm số lượng. **Thay danh sách**: chỉ còn các sản phẩm vừa nhập.
- Nếu Excel hiện mã dạng `2,71E+12`, hãy đổi cột mã sang dạng Text rồi chép lại. File mẫu đã để sẵn dạng này.

## File tải về

Mọi file app tạo ra (file Excel, ảnh xuất, file sao lưu) tự lưu vào thư mục Tải về của máy, không ghi đè tệp cũ. Thông báo góc màn hình có nút **Mở thư mục**.

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

# Hướng dẫn sử dụng In Sticker

Dùng và in không cần mạng, không cần đăng nhập. App chỉ vào mạng để kiểm tra và tải bản cập nhật. Dữ liệu nằm trên từng máy.

## Cài đặt

**Mac (macOS Ventura trở lên):** giải nén rồi kéo `In Sticker.app` vào thư mục Applications. Chọn bản đúng chip: `arm64` cho Mac M1 trở lên, `x64` cho Mac Intel. Lần đầu máy sẽ chặn vì app chưa ký số: vào System Settings > Privacy & Security, kéo xuống và bấm **Open Anyway**.

**Windows 10/11 64-bit:** giải nén tệp zip vào một thư mục cố định rồi chạy `In Sticker.exe`. Nếu hiện cảnh báo SmartScreen: bấm **More info**, rồi **Run anyway**. Cập nhật bản mới bằng cách giải nén đè; dữ liệu không mất vì được lưu riêng trong hồ sơ người dùng.

## Năm chế độ

| Tab | Dùng để | Nguồn dữ liệu |
|---|---|---|
| **Giá Sốc** | Tem A4 giá sốc | File giá ĐSD - TBBM, file mẫu, file ERP mẫu 97 và 99, hoặc gõ trực tiếp trên tem |
| **Giờ Vàng** | Tem A4 giờ vàng, có thời gian và số suất | Như Giá Sốc |
| **Phiếu** | Phiếu rút thăm, 4 phiếu mỗi trang, tự nhảy số | Gõ trực tiếp vào phiếu 1, các phiếu còn lại tự theo |
| **Sticker** | Tem giá như Event, mỗi sản phẩm một bố cục riêng (1 đến 24 tem mỗi trang) | File mẫu tự điền, nhập tay, quét mã |
| **Event** | Tem giá 1 đến 24 tem mỗi trang hoặc máy in bill K80 (trước bản 1.2.0 tab này tên là Sticker) | Bảng giá ERP mẫu 81, nhập tay, quét mã |

## In

Bấm in sẽ mở màn xem trước. App tự đặt khổ giấy, không lề và có in nền, không cần chỉnh như khi in trên Chrome.

- **In ngay:** in thẳng ra máy in đã chọn. App nhớ máy in dùng lần trước.
- **Mở hộp thoại in của hệ thống:** dùng khi cần chỉnh thêm, hoặc khi In ngay ra sai khổ trên một máy in nào đó.
- **Lưu PDF:** lưu đủ tất cả các trang ra tệp PDF.

Lô lớn như 4.000 phiếu cần vài chục giây để dựng. Khung xem trước chỉ hiện 3 trang đầu cho nhanh, còn bản in và PDF vẫn đủ trang.

## Tab Sticker: in từ file mẫu

Tab Sticker in cùng loại tem giá với tab Event nhưng không cần bảng giá ERP: bạn tự điền sản phẩm cần in vào file mẫu.

1. Bấm **Tải file mẫu** ở khung bên trái. File `Mau_Sticker.xlsx` lưu vào thư mục Tải về, có sẵn vài dòng ví dụ và trang hướng dẫn.
2. Điền mỗi sản phẩm một dòng: **Mã SP**, **Tên sản phẩm**, **Giá gốc** (để trống thì tem không có giá gạch), **Giá bán**, **Khuyến mãi**, **Số lượng tem** (trống là 1) và **Bố cục**: số sticker trên một trang A4, chọn 1, 2, 4, 8, 16 hoặc 24 (trống là 4).
3. Bấm **Nhập file mẫu**. Sản phẩm vào thẳng danh sách. Dòng thiếu mã, tên, giá bán hoặc bố cục không hợp lệ bị bỏ qua và được báo theo số dòng trong Excel. Nhập thêm file sau: mã trùng được cập nhật theo file mới, mã mới thêm vào cuối; nhập lại cùng file không làm tăng số tem.
4. Sửa bố cục từng sản phẩm ở ô **Bố cục** trên danh sách, hoặc trong hộp chọn bố cục khi bấm in.
5. Bấm **In tất cả** hoặc **In đã chọn**, rồi **In theo bố cục từng sản phẩm**. Mỗi bố cục là một lượt in riêng vì khổ giấy khác nhau (1, 4 và 16 tem mỗi trang in A4 ngang; 2, 8 và 24 in A4 dọc). Màn xem trước ghi đang ở lượt mấy; in xong hoặc đóng màn này thì lượt sau tự mở. Muốn in tất cả cùng một bố cục thì chọn ở mục **Hoặc in tất cả theo một bố cục**, kể cả máy in bill 80mm.

Tem ở tab Sticker không in thưởng. Danh sách đang in, danh sách đã lưu và sản phẩm nhập tay của tab Sticker là riêng, không lẫn với tab Event. Tên người in và cài đặt tem dùng chung. Nút thùng rác trên thanh trên cùng (khi đang ở tab Sticker) xoá các sản phẩm đã nhập từ file mẫu và danh sách đang in của tab này.

## Nạp dữ liệu cho tab Event

1. Vào ERP > In bảng giá. Chọn ngành hàng, nhóm hàng **Tất cả**, vị trí trưng bày **2 - Kệ trưng bày**.
2. Chọn mẫu in **81**, bấm In rồi xuất **Excel Workbook Data-only (*.xlsx)**. Mỗi lần chỉ xuất được một ngành hàng.
3. Bấm ô **Bảng Giá** trong app và chọn các file vừa xuất. App gộp vào bảng giá đang có: mã trùng thì cập nhật giá mới, mã chưa có thì thêm vào, giá cũ vẫn giữ. Sản phẩm đang có trong danh sách in cũng được cập nhật giá, giữ nguyên số tem.
4. Tìm theo mã, tên hoặc quét mã để thêm sản phẩm vào danh sách, chỉnh số tem rồi in.

### Lịch sử nhập và quản lý file

Cạnh ô **Bảng Giá** có hai nút:

- **Lịch sử nhập** (hình đồng hồ): mỗi lần nhập gồm những file nào, bao nhiêu sản phẩm mới, cập nhật giá, không đổi. Bấm vào một lần nhập để xem chi tiết sản phẩm thêm mới và giá cũ, giá mới của sản phẩm được cập nhật. App giữ 30 lần nhập gần nhất.
- **Quản lý file** (hình danh sách): mỗi file đã nhập một dòng, kèm số sản phẩm của file. Bấm thùng rác để xoá riêng file đó. Sản phẩm chỉ có trong file đó không còn tìm được; sản phẩm có trong file khác vẫn còn và lấy giá của file nhập gần nhất còn lại. Danh sách đang in không đổi. File mà mọi sản phẩm đã có giá ở file nhập sau có thể dọn một lần bằng nút **Dọn**.

### Tìm sản phẩm bằng bàn phím

Gõ mã hoặc tên vào ô tìm kiếm, dùng phím mũi tên lên, xuống để chọn trong danh sách gợi ý rồi bấm **Enter** để thêm vào danh sách. Gợi ý đầu tiên được chọn sẵn, mã gõ đúng hoàn toàn luôn đứng đầu. Sau khi thêm, con trỏ trở về ô tìm kiếm để tìm tiếp. Bấm **Esc** để xoá ô tìm kiếm.

## Danh sách sticker ở Giá Sốc và Giờ Vàng

- **Nhập file mẫu** hoặc file ERP: mọi sản phẩm hiện thành ảnh nhỏ bên trái bản xem trước. Bấm vào ảnh để mở sticker đó lên và sửa; thay đổi được lưu ngay và in đúng theo đó.
- Nút **x** ở góc trên bên phải mỗi ảnh xoá ngay sticker đó khỏi danh sách.
- **Thêm**: đưa sticker đang hiện trên bản xem trước vào danh sách, sau đó soạn tiếp sticker mới mà không làm đổi sticker vừa thêm. Dòng chữ dưới bản xem trước cho biết bạn đang sửa sticker nào trong danh sách hay đang soạn sticker mới.
- Khi danh sách có sticker, **Bấm để in** in các sticker đang được chọn trong danh sách. Sticker đang soạn chưa bấm Thêm thì không được in.

## Chỉnh cỡ chữ

Ở Giá Sốc, Giờ Vàng và Phiếu, bôi đen chữ trên bản xem trước để hiện thanh định dạng:

- Nút `-` và `+` đổi cỡ chữ, ô số ở giữa là cỡ chữ hiện tại và gõ trực tiếp được. Khoảng dòng chỉnh ở nhóm kế bên.
- Bôi đen hết một ô thì đổi cả ô; bôi đen một phần thì chỉ đổi phần đó.
- Nút khôi phục trên thanh định dạng đưa ô đang chọn về cỡ chữ và khoảng dòng mặc định.
- Nút **Cỡ chữ gốc** ở khung bên phải đưa mọi ô của chế độ đang mở về mặc định. Nội dung giữ nguyên.

## Nhập và xuất danh sách

Ở tab Event và tab Sticker, mục Thao tác danh sách:

- **Xuất**: tải file Excel gồm 2 cột `CODE` và `SỐ LƯỢNG`. Đang có danh sách thì điền sẵn danh sách đó, danh sách trống thì ra file mẫu chưa có dòng nào.
- **Nhập**: chọn file Excel theo mẫu, hoặc dán từ bảng tính, mỗi dòng gồm mã và số lượng:

  ```
  2714133000100	1
  4844099000052	2
  ```

  Màn nhập cho biết số sản phẩm tìm thấy, các mã không có trong bảng giá và các dòng lỗi trước khi bạn xác nhận. Tab Event cần nạp Bảng Giá trước, tab Sticker cần nhập file mẫu trước.
- Không ghi số lượng thì tính là 1. Mã trùng nhau được cộng số lượng, tối đa 500 tem mỗi sản phẩm.
- **Thêm vào danh sách**: giữ danh sách đang có; mã đã có thì cộng thêm số lượng. **Thay danh sách**: chỉ còn các sản phẩm vừa nhập.
- Nếu Excel hiện mã dạng `2,71E+12`, hãy đổi cột mã sang dạng Text rồi chép lại. File mẫu đã để sẵn dạng này.

## File tải về

Mọi file app tạo ra (file Excel, ảnh xuất, file sao lưu) tự lưu vào thư mục Tải về của máy, không ghi đè tệp cũ. Thông báo góc màn hình có nút **Mở thư mục**.

## Cập nhật

Khi có mạng, app tự kiểm tra bản mới lúc mở và 4 giờ một lần.

- **Có bản mới:** phải cập nhật mới dùng tiếp được. App tự tải, tự cài rồi mở lại; bảng giá, danh sách và cài đặt giữ nguyên. Nếu đang mở màn in, app chờ bạn in xong mới khoá.
- **Không có mạng:** app vẫn dùng bình thường.
- **Tải hoặc cài bị lỗi:** có nút **Thử lại** và **Dùng tiếp lần này**, để sự cố cập nhật không chặn việc in. Lần mở sau app nhắc lại.
- **Xem phiên bản và kiểm tra thủ công:** số phiên bản đang dùng (ví dụ **v1.1.2**) hiện ở góc phải thanh trên cùng. Bấm vào đó rồi bấm **Kiểm tra bản mới**; bảng này cũng cho biết lần kiểm tra gần nhất và cho bật tắt **Tự động tải và cài**. Tắt thì app báo có bản mới và chờ bạn bấm **Cập nhật ngay**.
- **Trên Mac:** cần để app trong thư mục Applications, nếu không app sẽ báo cần chuyển vào đó. Sau khi cập nhật, macOS có thể hỏi lại quyền camera.
- **Trên Windows:** chỉ bản cài bằng file `.exe` mới tự cập nhật. Bản giải nén từ file zip phải tải bộ cài về.

## Chuyển dữ liệu sang máy khác

Bấm nút hình trụ ở góc trên bên phải (Sao lưu và khôi phục):

1. Trên máy cũ, bấm **Sao lưu ra file**.
2. Chép file `in-sticker-sao-luu-….json` sang máy mới.
3. Trên máy mới, bấm **Khôi phục từ file**. Thao tác này thay toàn bộ dữ liệu đang có trên máy mới.

File gồm bảng giá và từng file đã nhập, lịch sử nhập, sản phẩm nhập tay, danh sách đã lưu, lịch sử in và cài đặt.

## Quét mã

Bấm nút quét cạnh ô tìm kiếm. Lần đầu máy sẽ hỏi quyền camera; nếu đã từ chối, bật lại trong phần cài đặt quyền riêng tư của máy. Máy quét mã USB hoạt động như bàn phím: bấm vào ô tìm kiếm rồi quét. Máy quét tự bấm Enter sau mã thì sản phẩm có đúng mã đó được thêm ngay; mã không có trong bảng giá thì app hiện gợi ý để chọn.

## Khác với bản web

- Không có đăng nhập, phân quyền, kho và đồng bộ Cloud. Danh sách đã lưu không tự sang máy khác, hãy dùng Sao lưu.
- Ai dùng máy cũng nạp được bảng giá và xoá được bảng giá bằng nút thùng rác trên thanh trên cùng (chỉ hiện ở tab Event).
- Có thêm tab Sticker in từ file mẫu tự điền, mỗi sản phẩm một bố cục.
- Không có nạp tồn kho, nên cũng không có bộ lọc ngành hàng, nhóm hàng và số tem theo tồn.
- Không có giao diện điện thoại.

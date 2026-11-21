# Hướng dẫn sử dụng In Sticker

Dùng và in không cần mạng, không cần đăng nhập. App chỉ vào mạng để kiểm tra và tải bản cập nhật. Dữ liệu nằm trên từng máy.

## Cài đặt

**Mac (macOS Ventura trở lên):** giải nén rồi kéo `In Sticker.app` vào thư mục Applications. Chọn bản đúng chip: `arm64` cho Mac M1 trở lên, `x64` cho Mac Intel. Lần đầu máy sẽ chặn vì app chưa ký số: vào System Settings > Privacy & Security, kéo xuống và bấm **Open Anyway**.

**Windows 10/11 64-bit:** giải nén tệp zip vào một thư mục cố định rồi chạy `In Sticker.exe`. Nếu hiện cảnh báo SmartScreen: bấm **More info**, rồi **Run anyway**. Cập nhật bản mới bằng cách giải nén đè; dữ liệu không mất vì được lưu riêng trong hồ sơ người dùng.

## Năm chức năng

Thanh bên trái, ngay dưới logo, chọn chức năng: **In sticker** (năm chế độ bên dưới), **Kiểm hàng** (đối chiếu hàng nhận với file phiếu chuyển kho), **Kiểm quỹ** (đếm tiền theo mệnh giá, đối chiếu sổ, lưu lịch sử), **Nhắc việc** (nhắc việc có chuông, checklist và báo cáo) và **Tạo mã** (mã QR, mã vạch có tiêu đề, in nhiều mã trên một trang). Tiêu đề và icon trên thanh trên cùng đổi theo chức năng đang mở. Chuyển qua lại không mất việc đang làm dở ở chức năng kia. Số đỏ trên biểu tượng Nhắc việc là số việc đang quá hạn.

## Năm chế độ

| Tab | Dùng để | Nguồn dữ liệu |
|---|---|---|
| **Giá Sốc** | Tem A4 giá sốc | File mẫu, hoặc gõ trực tiếp trên tem |
| **Giờ Vàng** | Tem A4 giờ vàng, có thời gian và số suất | Như Giá Sốc |
| **Sticker** | Tem giá như Event, chọn kiểu tem và bố cục (1 đến 24 tem mỗi trang hoặc máy in bill K80) lúc bấm in | Như Giá Sốc, dùng chung danh sách với Giá Sốc |
| **Phiếu** | Phiếu rút thăm, 4 phiếu mỗi trang, tự nhảy số | Gõ trực tiếp vào phiếu 1, các phiếu còn lại tự theo |
| **Event** | Tem giá 1 đến 24 tem mỗi trang hoặc máy in bill K80 (trước bản 1.2.0 tab này tên là Sticker). Mặc định ẩn; nhờ người quản lý bật nếu cần | Bảng giá ERP mẫu 81, nhập tay, quét mã |

## In

Bấm in sẽ mở màn xem trước. App tự đặt khổ giấy, không lề và có in nền, không cần chỉnh như khi in trên Chrome.

- **In ngay:** in thẳng ra máy in đã chọn. App nhớ máy in dùng lần trước.
- **Mở hộp thoại in của hệ thống:** dùng khi cần chỉnh thêm, hoặc khi In ngay ra sai khổ trên một máy in nào đó.
- **Lưu PDF:** lưu đủ tất cả các trang ra tệp PDF.

Lô lớn như 4.000 phiếu cần vài chục giây để dựng. Khung xem trước chỉ hiện 3 trang đầu cho nhanh, còn bản in và PDF vẫn đủ trang.

## Tab Sticker: tem giá, chọn kiểu và bố cục

Tab Sticker nằm giữa Giờ Vàng và Phiếu. Cách nhập giống tab Giá Sốc: bấm **Thêm**, hoặc nhập file mẫu. Ở tab này nút **Thêm** nằm ngay trên các ô sửa, dưới tem xem trước. Thêm xong thì các ô (tên, mã QR, giá cũ, giá mới, khuyến mãi) để trống và con trỏ về ô tên để soạn sticker tiếp theo; các ô đều trống thì không thêm. Danh sách dùng chung với Giá Sốc, nên sticker thêm ở tab này cũng thấy ở tab Giá Sốc và ngược lại.

Khác Giá Sốc ở khung xem trước và lúc in:

- **Khung xem trước** hiện đúng tem giá sẽ in, không có nền Giá Sốc. Chọn một trong bốn kiểu ở đầu khung. App nhớ kiểu đã chọn (dùng chung với tab Event, tab Event cũng có đủ bốn kiểu).

| Kiểu | Trông thế nào |
|---|---|
| **Kiểu có sẵn**, **Kiểu hiện đại** | Hai kiểu cũ |
| **Kiểu giá to** | Giá mới chiếm gần hết tem; tên, giá gốc và % giảm gọn ở hàng trên |
| **Kiểu phiếu giảm giá** | Viền nét đứt có hình kéo cắt, cuống phiếu ghi % giảm và giá gốc, thân phiếu ghi giá ưu đãi |

Kiểu giá to và Kiểu phiếu giảm giá chỉ dùng chữ và đường viền trên nền trắng, không có nền đen, nên in trắng đen ít tốn mực. Ai đang chọn một mẫu thử đã bỏ ở các bản trước thì app về Kiểu có sẵn.

Trang in (A4, 1 đến 24 tem mỗi trang) có **đường cắt** nét đứt màu xám chạy giữa khe giữa các tem và quanh khối tem; cắt theo đường là tách được từng tem. Trang cuối ít tem thì đường cắt chỉ chạy quanh các tem có in. Máy in bill không có đường cắt. Cả sáu dùng được ở mọi bố cục và máy in bill; không có giá gốc thì tem chỉ in giá bán. Tem hiện theo bố cục lần in trước.
- **Sửa nội dung** ở các ô dưới tem: Tên sản phẩm, Mã QR, Giá cũ, Giá mới (nghìn đồng, như Giá Sốc) và Khuyến mãi. Gõ giá mới đủ số (từ 100.000) thì app tự đổi ra nghìn đồng.
- **Bấm để in** hiện hộp **Chọn Kiểu & Bố Cục In**: gõ **Tên danh sách**, đổi kiểu nếu cần, rồi chọn 1, 2, 4, 8, 16 hoặc 24 sticker mỗi trang A4, hoặc **Máy in bill (80mm)**. Chọn xong là mở màn xem trước bản in. Đóng hộp thì không in.
- Tem luôn có ngày giờ in cạnh mã QR, kèm người in nếu đã nhập.

Mỗi sticker in thành một tem giá như tab Event: tên sản phẩm, giá cũ là giá gạch, giá mới là giá bán, dòng khuyến mãi. Sticker có mã thì tem luôn có mã QR; xoá trống ô Mã QR nếu không muốn in QR. Tem không in thưởng. **Người in** nhập ở ô cạnh Kiểu sticker, riêng với tab Event; để trống thì tem chỉ in giờ in.

Khung xem trước dùng đúng phông và cỡ chữ của bản in nên thấy sao in ra vậy. Ô nào chưa nhập thì phần đó trên tem hiện mờ bằng nội dung mẫu để vẫn thấy bố cục; phần mờ không được in.

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

## Danh sách sticker ở Giá Sốc, Giờ Vàng và Sticker

Ở tab Sticker, ảnh nhỏ là tem giá theo kiểu đang chọn.


- Nhóm **Nhập từ file mẫu** có ba nút: **Nhập file mẫu**, **Tải file mẫu** (file trống để điền) và **Đặt lại** (xoá dữ liệu đã nhập, về mẫu ban đầu).
- **Nhập file mẫu**: mọi sản phẩm hiện thành ảnh nhỏ bên trái bản xem trước. Bấm vào ảnh để mở sticker đó lên và sửa; thay đổi được lưu ngay và in đúng theo đó.
- Nút **x** ở góc trên bên phải mỗi ảnh xoá ngay sticker đó khỏi danh sách.
- **Số bản in:** mỗi sticker có ô số bản ở góc dưới bên phải ảnh nhỏ và ở cuối mỗi dòng tab D.Sách (bấm − / + hoặc gõ số, tối đa 500). Ở tab Sticker còn có ô **Số bản in** cạnh ô Khuyến mãi: đang mở sticker nào thì là số bản của sticker đó, đang soạn sticker mới thì áp dụng khi bấm Thêm. Bấm in thì mỗi sticker in đúng số bản của nó; nút **Bấm để in (n)** đếm tổng số bản. File mẫu có thêm cột **SỐ BẢN IN** (để trống là 1 bản; file mẫu cũ không có cột này vẫn nhập được).
- Ở Giá Sốc và Giờ Vàng, bấm vào dòng mã vạch trên đầu sticker để gõ hoặc sửa mã, Enter để xong, Esc để thôi. Sticker chưa có mã có chỗ "Bấm để nhập mã vạch"; chỗ này không in ra.
- Ở Giá Sốc và Giờ Vàng, sticker có mã luôn hiện và in mã vạch ở đầu sticker, không còn nút bật tắt. Mã lấy từ cột **CODE** của file mẫu.
- **Thêm**: đưa sticker đang hiện trên bản xem trước vào danh sách, sau đó soạn tiếp sticker mới mà không làm đổi sticker vừa thêm. Dòng chữ dưới bản xem trước cho biết bạn đang sửa sticker nào trong danh sách hay đang soạn sticker mới.
- Khi danh sách có sticker, **Bấm để in** in các sticker đang được chọn trong danh sách. Sticker đang soạn chưa bấm Thêm thì không được in.

## In nhiều sticker trên 1 trang A4 (Giá Sốc, Giờ Vàng)

**Bấm để in** hiện hộp **Chọn số sticker trên 1 trang A4**. Gõ **Tên danh sách** trước, rồi chọn số sticker mỗi trang:

| Chọn | Khổ giấy | Cỡ mỗi sticker |
|---|---|---|
| 1 sticker / trang | A4 dọc | 20 x 28,2 cm, như trước nay |
| 2 sticker / trang | A4 ngang | 13,8 x 20 cm |
| 4 sticker / trang | A4 dọc | 9,8 x 14,2 cm |
| 8 sticker / trang | A4 ngang | 6,8 x 9,8 cm |
| 16 sticker / trang | A4 dọc | 4,7 x 6,8 cm |

- Mỗi lựa chọn ghi sẵn số trang sẽ in. Sticker giữ đúng tỉ lệ, chữ thu nhỏ theo sticker.
- Lựa chọn lần in trước được chọn sẵn, bấm Enter là in luôn. Giá Sốc và Giờ Vàng dùng chung lựa chọn này.
- Đóng hộp thì không in. Tab Phiếu vẫn in 4 phiếu mỗi trang như cũ.

## Tên danh sách và Lịch sử in (Giá Sốc, Giờ Vàng, Sticker)

- Mỗi lần in phải gõ **Tên danh sách** trong hộp in; chưa có tên thì chưa chọn được bố cục. Ô tên gợi ý lại các tên đã dùng. Gõ tên xong bấm Enter là in theo bố cục đang chọn sẵn.
- Danh sách vừa in được lưu vào tab **Lịch sử** với tên đó, kèm giờ in, số trang và nơi in (Giá Sốc, Giờ Vàng hay Sticker). Chỉ in sticker đang soạn thì sticker đó cũng được lưu.
- Ô **Tìm theo tên danh sách** ở đầu tab Lịch sử tìm không cần dấu, không phân biệt chữ hoa. Bấm **Khôi phục** để đưa danh sách đã in về lại.
- In lại đúng danh sách cũ với cùng tên thì mục cũ được đưa lên đầu; đặt tên khác thì thành một mục mới.

## Chỉnh cỡ chữ

Ở Giá Sốc, Giờ Vàng và Phiếu, bôi đen chữ trên bản xem trước để hiện thanh định dạng:

- Nút `-` và `+` đổi cỡ chữ, ô số ở giữa là cỡ chữ hiện tại và gõ trực tiếp được. Khoảng dòng chỉnh ở nhóm kế bên.
- Bôi đen hết một ô thì đổi cả ô; bôi đen một phần thì chỉ đổi phần đó.
- Nút khôi phục trên thanh định dạng đưa ô đang chọn về cỡ chữ và khoảng dòng mặc định.
- Nút **Cỡ chữ gốc** ở khung bên phải đưa mọi ô của chế độ đang mở về mặc định. Nội dung giữ nguyên.

## Nhập và xuất danh sách

Ở tab Event, mục Thao tác danh sách:

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

File gồm bảng giá và từng file đã nhập, lịch sử nhập, sản phẩm nhập tay, danh sách đã lưu, lịch sử in, các phiên kiểm hàng, nhắc việc, checklist (kèm ảnh) và cài đặt.

## Kiểm hàng

Dùng khi nhận kiện hàng kèm file Excel phiếu chuyển kho: đối chiếu số thực nhận với số trên file.

1. **Nhập file:** bấm **Chọn file Excel** hoặc kéo thả file vào màn. Chọn được nhiều file cùng lúc, gồm cả file chi tiết sản phẩm lẫn file phiếu (file có Số hóa đơn). App tự nhận loại file và ghép theo mã phiếu chuyển, không cần đặt tên file đúng. Chỉ có file chi tiết thì hoá đơn hiện bằng mã phiếu chuyển; nhập thêm file phiếu sẽ có số hoá đơn. File đã nhập rồi thì bỏ qua, không nhân đôi.
2. **Quét:** bắn mã bằng súng quét, gõ mã rồi bấm Enter, hoặc bấm **Camera**. Súng quét dùng được ngay cả khi con trỏ đang ở chỗ khác trên màn. Viền ô quét màu xanh lá là đang sẵn sàng.
   - **Mã có trong file:** cộng 1, báo xanh kèm tiếng bíp, dòng đó được tô sáng trong danh sách. Mã có ở nhiều hoá đơn thì cộng đủ hoá đơn đầu rồi mới sang hoá đơn sau.
   - **Hàng nhiều cái:** gõ số vào ô **SL** trước khi quét. Ô SL tự về 1 sau mỗi lần.
   - **Sản phẩm có IMEI trong file:** quét mã thì app chờ quét IMEI. Quét thẳng IMEI cũng được. IMEI không có trong hoá đơn thì báo đỏ; IMEI quét rồi thì báo trùng. Bấm Esc để thôi chờ IMEI.
   - **Mã không có trong file:** báo đỏ, quét lại. Mã đó được ghi vào **Mã lạ đã quét** ở cột phải; bấm × để xoá nếu quét nhầm.
   - **Quét quá số lượng:** báo vàng, tính là thừa.
   - **Hoàn tác** (hoặc Ctrl+Z) huỷ lần quét vừa rồi. Có thể sửa tay số thực nhận bằng nút − và + trên từng dòng.
3. **Theo dõi:** các ô Theo file, Đã kiểm, Còn thiếu, Thừa, Mã lạ cập nhật ngay. Lọc danh sách theo Chưa đủ, Đủ, Thừa, Có IMEI, theo **nhóm hàng**, hoặc bấm một hoá đơn ở cột phải để chỉ xem hoá đơn đó. Thẻ hoá đơn ghi đủ MYC, ngày tạo, kho chuyển và người chuyển.
4. **Báo cáo:** bấm **Báo cáo** ở góc ô Đang kiểm. Báo cáo cho biết từng MYC đã đủ hay chưa, thiếu bao nhiêu sản phẩm thuộc bao nhiêu nhóm hàng, danh sách cụ thể theo nhóm, kho chuyển, kho nhận và người chuyển.
   - **Sao chép để gửi:** chép báo cáo thành tin nhắn, dán vào Zalo gửi người chuyển. Mặc định chỉ gồm các MYC chưa đủ; bỏ chọn **Chỉ gửi MYC chưa đủ** để gửi cả MYC đã đủ.
   - **Xuất Excel:** file có trang **Báo cáo** ở đầu, sau đó là Tổng hợp (theo hoá đơn), Chi tiết (đủ các cột của file kèm số thực nhận, chênh lệch, kết quả), Thiếu thừa, Mã lạ và Nhật ký quét.
5. **Kết thúc:** hiện báo cáo để gửi trước, bấm **Kết thúc và lưu** thì phiên vào **Lịch sử**. Trong Lịch sử có thể xem lại báo cáo, xuất Excel, mở lại để kiểm tiếp hoặc xoá.

Kết quả tự lưu sau mỗi lần quét: lỡ đóng app thì mở lại kiểm tiếp được. Dữ liệu kiểm hàng có trong file sao lưu.

## Kiểm quỹ

Đếm tiền trong két theo mệnh giá, đối chiếu với số theo sổ và lưu lại từng lần kiểm.

1. Ghi **Tên lần kiểm** (ví dụ "Ca sáng - Ngọc"). Phải có tên mới lưu được.
2. Gõ **số tờ** từng mệnh giá (500.000 đến 500 đồng), bấm Enter là sang mệnh giá kế tiếp; hoặc bấm **+**, **−** để cộng trừ từng tờ. Thành tiền từng dòng và **Tổng tiền thực tế** (kèm số tờ và số tiền bằng chữ) tự tính. Tiền xu, tiền lẻ ngoài bảng ghi ở **Tiền khác**.
3. Muốn đối chiếu thì gõ **Số tiền theo sổ / hệ thống**: app báo **Khớp sổ**, **Thừa** hoặc **Thiếu** bao nhiêu. Ghi lý do vào **Ghi chú**.
4. **Lưu vào lịch sử.** Lưu xong màn trở về lần kiểm mới trống.
5. **Sao chép để gửi** (dán Zalo) hoặc **Xuất ảnh** biên bản kiểm quỹ, cho lần đang đếm hoặc lần đã lưu.

Lần đang đếm được giữ ngay sau mỗi lần gõ: tắt app hay mất điện giữa chừng, mở lại vẫn còn đủ số đã nhập dù chưa bấm Lưu. Ô trạng thái cạnh tên ghi "Chưa lưu" hay "Đã lưu lúc …".

**Lịch sử kiểm quỹ** ở bên phải: mỗi lần có tên, giờ, tổng tiền và thừa thiếu. Bấm vào để xem biên bản, sao chép, xuất ảnh, **Mở lại để sửa** (lưu lại thì thay đúng lần đó, không thêm dòng mới) hoặc **Xoá**. Lịch sử có trong file sao lưu.

## Nhắc việc

### Tạo nhắc việc

Bấm **Tạo nhắc việc**, điền:

- **Tiêu đề**, **nội dung** và **hạn hoàn tất** (ngày, giờ).
- **Nhắc trước hạn:** chọn được nhiều mốc: đúng hạn, trước 5, 15, 30 phút, 1 giờ, 1 ngày.
- **Lặp lại:** không lặp, mỗi ngày, theo thứ trong tuần, mỗi tháng.
- **Mức độ:** Thường, Quan trọng, Khẩn. Việc khẩn quá hạn mà chưa bấm Đã xong thì nhắc lại mỗi 10 phút, tối đa 3 giờ.
- **Âm thanh:** 5 chuông có sẵn, **đọc chữ thành tiếng** (để trống thì đọc tiêu đề và hạn, hoặc gõ câu riêng), **file âm thanh** (mp3, wav, m4a, tối đa 5 MB) hoặc **ghi âm bằng micro**. Bấm **Nghe thử** trước khi lưu.
- **Checklist liên kết:** nút trên cửa sổ nhắc mở thẳng checklist đó.

**Nhân bản:** việc nào hay lặp lại mà khác chút ít (khác giờ, khác người, khác nội dung), bấm nút **Nhân bản** (hai tờ giấy chồng nhau) trên dòng việc đó. Form mở ra điền sẵn mọi ô; việc đã qua hạn thì hạn tự dời sang cùng giờ hôm nay hoặc ngày mai. Sửa chỗ cần đổi rồi bấm **Tạo nhắc việc**. Việc gốc giữ nguyên.

### Khi đến giờ

- **Bảng nhắc** bật lên ở góc phải màn hình, luôn nằm trên mọi ứng dụng, kèm chuông kêu lặp lại đến khi bấm (tối đa 5 phút, sau đó tắt tiếng nhưng bảng vẫn còn).
- **Nhiều nhắc cùng lúc** (hoặc nhắc mới đến khi bảng đang mở) nằm chung **một bảng**, mỗi việc một thẻ có nút riêng; việc khẩn nằm trên, nhắc vừa đến có nhãn **Mới**. Chỉ một tiếng chuông: của nhắc vừa đến. Bấm hết các thẻ thì bảng đóng; bấm × là đóng cả bảng.
- **Đã xong:** thôi nhắc lần này. **5′, 10′, 30′:** hoãn, nhắc lại sau số phút đó. **Mở trong app:** mở danh sách hoặc checklist liên kết.
- Lúc chuông kêu, loa của máy được **bật tiếng và mở to hết**; bảng đóng hoặc bấm **Tắt tiếng** thì trả lại mức cũ (nếu bạn chưa tự chỉnh trong lúc đó).
- App tắt hoặc máy ngủ lúc đến giờ: lần mở sau, bảng nhắc báo gộp các nhắc việc bị lỡ.

### Chạy nền

Đóng cửa sổ thì app **vẫn chạy nền** để nhắc việc; biểu tượng In Sticker nằm ở khay hệ thống (góc phải thanh tác vụ trên Windows, thanh menu trên Mac). Muốn tắt hẳn: bấm biểu tượng đó, chọn **Thoát hẳn**. Trong **Cài đặt** của Nhắc việc:

- **Chạy nền khi đóng cửa sổ** (bật sẵn).
- **Khởi động cùng máy** (bản đã cài, bật sẵn từ lần mở đầu tiên): bật máy là app tự chạy nền. Dưới công tắc ghi máy đã nhận chưa. Mac báo "đang chờ cho phép" thì bấm **Mở Mục đăng nhập** và bật In Sticker; Windows báo "đang tắt" thì bấm **Mở Ứng dụng khởi động** và bật In Sticker.
- **Giữ máy thức để nhắc đúng giờ** (bật sẵn): máy không tự ngủ khi app đang chạy, màn hình vẫn tắt được. Gập máy xách tay hoặc bấm Ngủ thì máy vẫn ngủ; mở lại, app báo các nhắc bị lỡ. Máy xách tay cần tiết kiệm pin thì tắt.
- **Mở to hết âm lượng khi nhắc** (bật sẵn): tắt nếu không muốn app chỉnh loa.
- Chọn giọng đọc tiếng Việt (máy có nhiều giọng thì chọn được), bấm **Nghe thử giọng** và thử chuông.
- Máy chưa có giọng tiếng Việt: Windows vào Settings > Time & language > Speech > Add voices, chọn Tiếng Việt; Mac vào Cài đặt hệ thống > Trợ năng > Nội dung được đọc > Giọng hệ thống > Quản lý giọng, chọn Tiếng Việt (Linh).

### Đồng bộ với Google Sheet

Việc và checklist trên máy và trên một file Google Sheet là một: quản lý giao việc trong file hoặc ngay trong app, các máy nhận trong khoảng 1 phút; bấm **Đã xong** ở máy nào thì file ghi người xong và giờ xong.

**Quản lý làm một lần cho mỗi file:**

1. Trong **Cài đặt** của Nhắc việc, bấm **Tạo file nhắc việc**. Trình duyệt mở trang của Google, đăng nhập rồi bấm **Tạo bản sao**: file mới nằm trong Google Drive của quản lý.
2. Trong file, menu **Nhắc việc → Bật đồng bộ hai chiều** (chưa thấy menu thì tải lại trang). Khung bên phải hướng dẫn từng bước (khoảng 2 phút): Tiện ích mở rộng → Apps Script → **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**, *Thực thi bằng: Tôi*, *Người có quyền truy cập: Bất kỳ ai*, bấm Triển khai, cho phép quyền, sao chép **URL ứng dụng web** dán vào khung rồi bấm Lưu.
3. Bấm **Sao chép Link kết nối**, gửi qua Zalo cho từng máy.

**Ở mỗi máy:** sao chép Link kết nối, vào **Nhắc việc → Cài đặt**, bấm **Dán link đã sao chép**. Ghi **Tên của bạn** (ví dụ "Ngọc - Quầy 1"): tên này ghi vào cột Người xong và Người giao. Việc đã tạo trên máy từ trước: bấm **Đưa N việc lên Google Sheet**.

Sau khi kết nối:

- **Tạo việc trong app** thì mặc định lên file (ô **Lưu lên Google Sheet** đã tick sẵn, bỏ tick nếu là việc riêng), chọn **Người xử lý** từ danh sách trong file. Việc trên file có nhãn **Google Sheet · CV…** và sửa, nhân bản, xoá được ngay trong app; xoá thì file ghi **Huỷ**, dòng vẫn còn.
- **Bấm Đã xong:** file ghi **Người xong**, **Xong lúc**; việc một lần chuyển **Xong**. Mỗi lần xong ghi một dòng ở trang **Nhật ký**, nên việc lặp lại mỗi ngày bấm xong ở máy này thì máy khác cũng thôi nhắc lần đó.
- **Hoàn tất checklist:** trang **Báo cáo checklist** có một dòng gồm người làm, kết quả, số việc có vấn đề, ghi chú và chi tiết từng việc.
- App hỏi file mỗi phút (chỉ tải khi file có thay đổi), lúc mở app và khi máy thức dậy; bấm **Đồng bộ ngay** để đồng bộ liền. Có việc mới thì bật cửa sổ "Có N công việc mới" kèm chuông.
- **Mất mạng** vẫn dùng bình thường: Cài đặt ghi "Còn N thay đổi chưa gửi", có mạng app tự gửi.
- Âm thanh tự ghi hoặc file âm thanh chỉ phát ở máy tạo việc, máy khác dùng Chuông reo.

**Trong file**, hầu hết các cột chọn từ danh sách, không phải gõ:

- **Danh mục:** ghi tên nhân viên và người giao một lần, các trang khác (và ô Người xử lý trong app) chọn từ danh sách này.
- **Nhắc việc:** mỗi dòng một việc, mã việc điền sẵn. Ghi Tiêu đề, bấm đúp ô Ngày hạn để chọn trên lịch, chọn Giờ hạn (trống là 17:00). Người xử lý, Mức độ, Nhắc trước, Lặp lại, Âm thanh, Checklist, Trạng thái, Người giao đều chọn từ danh sách; để trống thì app dùng mặc định. Việc Khẩn tô đỏ, việc quá hạn tô đỏ ở ngày hạn, việc Xong tô xanh, việc Huỷ gạch ngang.
- **Checklist:** các dòng cùng Tên checklist là một checklist, mỗi dòng một việc. Tick Bắt buộc, Cần ảnh, Cần ghi chú. Lịch làm, giờ bắt đầu, giờ hạn, người làm, trạng thái chọn ở dòng đầu của checklist. Checklist từ file sửa trong file.
- Menu **Nhắc việc**: **Giao việc nhanh** (khung nhập bên phải, chọn người, ngày, giờ, mức độ; giao xong khung giữ nguyên để giao tiếp việc khác), **Nhân bản dòng đang chọn**, **Đánh dấu xong dòng đang chọn**.
- Chọn **Huỷ** ở Trạng thái để rút việc, **Xong** để đánh dấu xong; checklist chọn **Ngưng** để rút.

Lưu ý:

- Ai có Link kết nối đều đọc và ghi được file qua app: chỉ gửi cho người trong cửa hàng. Lỡ gửi nhầm: menu Nhắc việc → Bật đồng bộ hai chiều → **Đổi mã kết nối**, rồi gửi link mới cho các máy. File không cần chia sẻ công khai nữa.
- Dòng ghi sai (thiếu hạn, sai dạng ngày, trùng mã) được liệt kê trong Cài đặt để sửa.
- Link chia sẻ file thường (docs.google.com, file để "Bất kỳ ai có đường liên kết") vẫn kết nối được nhưng **chỉ nhận việc**: bấm Đã xong trong app không ghi ngược lên file. Muốn hai chiều thì bật đồng bộ trong file rồi bấm **Dán Link kết nối** trong Cài đặt.
- **Ngắt kết nối** bỏ các việc và checklist nhận từ file, những gì chỉ có trên máy giữ nguyên.

### Checklist

1. **Tạo mẫu** một lần ở tab **Checklist**, ví dụ "Mở ca sáng" gồm 10 việc. Mỗi việc có hướng dẫn, và đánh dấu được **Bắt buộc**, **Cần ảnh**, **Cần ghi chú**. Bật **Làm theo lịch** để chọn ngày, giờ bắt đầu và hạn: app nhắc lúc bắt đầu, 15 phút trước hạn và lúc hạn nếu chưa hoàn tất. Cần mẫu gần giống (ví dụ Mở ca chiều): bấm **Nhân bản** trên mẫu có sẵn, đổi tên và sửa vài việc.
2. **Bấm vào dòng mẫu** (hoặc nút **Bắt đầu**) để làm lượt hôm nay. Ghi **Người làm**. Đang làm dở thì bấm vào dòng là làm tiếp.
3. Mỗi việc chọn **Hoàn tất**, **Có vấn đề** hoặc **Không áp dụng**; ghi chú và **Chụp ảnh** (camera) hoặc **Chọn ảnh**. App ghi giờ và người làm từng việc.
4. **Hoàn tất checklist.** Còn việc bắt buộc chưa làm, hoặc thiếu ảnh, ghi chú, thì app hỏi lại; hãy ghi lý do vào **Ghi chú chung**.
5. **Báo cáo:** **Sao chép để gửi** (dán Zalo), **Xuất ảnh**, **Xuất Excel**. Báo cáo ghi nổi bật **Người làm**, có từng việc, trạng thái, giờ, ghi chú, ảnh và đúng hạn hay trễ.
6. Làm xong trong ngày, dòng mẫu có dấu xanh **Đã xong hôm nay** (giờ xong, số việc) và nút **Xem**: bấm vào là mở lại lượt đã làm, không làm lại từ đầu. Cần làm thêm một lượt nữa trong ngày thì mở lượt đã xong, bấm **Làm lượt mới**. Dòng mẫu cũng ghi **Đang làm**, **Đến giờ làm** hoặc **Quá hạn, chưa làm** theo lịch.

Tab **Hôm nay** gom việc quá hạn, việc trong ngày và checklist theo lịch hôm nay. Tab **Thống kê** (7 hoặc 30 ngày) cho biết số lượt hoàn tất, tỉ lệ đúng hạn, trễ hạn, việc hay có vấn đề, nhắc việc đã xong và bị lỡ.

Nhắc việc, checklist, ảnh và âm thanh tự nhập đều có trong file sao lưu.

## Tạo mã

Tạo mã QR, mã vạch từ nội dung bất kỳ (mã sản phẩm, đường link, Wi-Fi, vị trí kệ…), mỗi mã có tiêu đề in to phía trên.

1. **Nhập mã:** mỗi dòng một **Tiêu đề** (không bắt buộc) và **Nội dung**. Gõ nội dung rồi bấm Enter là sang dòng mới. Ô **×** là số bản in của mã đó (ví dụ in 24 tem giống nhau).
2. **Nhập nhiều dòng:** dán nhiều mã một lần, mỗi dòng một mã. Có tiêu đề thì ghi `Tiêu đề | Nội dung`, hoặc chép hai cột từ Excel (cột A tiêu đề, cột B nội dung). Chọn **Thêm** vào danh sách hoặc **Thay cả danh sách**.
3. **Loại mã:** **Mã QR** (nhận cả tiếng Việt có dấu, đường link dài), **Mã vạch** (Code 128, chỉ nhận chữ không dấu, số và ký hiệu) hoặc **QR + mã vạch**. Dòng không tạo được mã có viền đỏ và lý do, không in, không xuất. Mã vạch dài in trong ô nhỏ thì vạch quá mảnh, máy quét khó đọc: app báo màu vàng, nên chọn ít mã mỗi trang hơn hoặc dùng mã QR.
4. **Số mã mỗi trang:** chọn từ 1 đến 70 mã trên một trang A4; app tự chia cột, hàng (ghi trong ngoặc) và cỡ chữ theo cỡ ô. Chọn khổ **Dọc** hoặc **Ngang**, bật tắt **Ghi nội dung dưới mã** và **Viền nét đứt để cắt**.
5. **Xem trước** bên phải đúng như bản in; nhiều trang thì bấm mũi tên để xem từng trang.
6. **In N mã:** mở màn xem trước bản in như các chức năng khác (chọn máy in, số bản, lưu PDF).
7. **Ảnh từng mã:** mỗi mã một ảnh PNG (tiêu đề, mã, nội dung), tên file theo số dòng và tiêu đề. **Ảnh theo trang:** mỗi trang A4 một ảnh, giống bản in. Ảnh lưu vào thư mục Tải về.

Danh sách mã và cách in được giữ lại khi đóng app, và có trong file sao lưu. **Xoá hết** để làm danh sách mới.

## Quét mã

Bấm nút quét cạnh ô tìm kiếm. Lần đầu máy sẽ hỏi quyền camera; nếu đã từ chối, bật lại trong phần cài đặt quyền riêng tư của máy. Máy quét mã USB hoạt động như bàn phím: bấm vào ô tìm kiếm rồi quét. Máy quét tự bấm Enter sau mã thì sản phẩm có đúng mã đó được thêm ngay; mã không có trong bảng giá thì app hiện gợi ý để chọn.

## Khác với bản web

- Không có đăng nhập, phân quyền, kho và đồng bộ Cloud. Danh sách đã lưu không tự sang máy khác, hãy dùng Sao lưu.
- Ai dùng máy cũng nạp được bảng giá và xoá được bảng giá bằng nút thùng rác trên thanh trên cùng (chỉ hiện ở tab Event).
- Có thêm tab Sticker: nhập như Giá Sốc, xem trước và in ra tem giá theo kiểu và bố cục chọn lúc in.
- Không có nạp tồn kho, nên cũng không có bộ lọc ngành hàng, nhóm hàng và số tem theo tồn.
- Không có giao diện điện thoại.

1. Quy tắc Tiền xử lý (Preprocessing & Clean up)
Trước khi phân tích SQL, bạn cần dọn dẹp các cú pháp của Java để lấy ra chuỗi SQL nguyên bản.

Xóa bỏ vỏ bọc sql.append: * Logic: Dùng Regex tìm và thay thế sql.append(" và "); thành chuỗi rỗng.

Bắt các biến Java (Dynamic Variables):

Dấu hiệu: Các đoạn nằm giữa " và +. Ví dụ: '" + inBean.getDenpyoKb() + "'.

Logic: Dùng Regex (vd: "\s*\+\s*([a-zA-Z0-9_\.\(\)]+)\s*\+\s*") để trích xuất tên biến (ví dụ: inBean.getDenpyoKb()). Chuyển nó thành format thiết kế, ví dụ: 【入力．伝票区分】.

Bắt các khối điều kiện Java (if):

Dấu hiệu: Bắt đầu bằng if ( hoặc if(.

Logic: Khi gặp dòng if, hãy lưu điều kiện đó lại thành một "Ghi chú điều kiện". Bất kỳ dòng sql.append nào nằm trong khối { ... } của if đó sẽ được gắn kèm ghi chú: "[Điều kiện: nếu inBean...]".

2. Quy tắc Nhận diện Mệnh đề SQL (SQL Keywords)
Các từ khóa này đóng vai trò là Điểm neo (Anchor). Khi code của bạn đọc từng dòng (sau khi đã dọn dẹp), hễ gặp từ khóa này thì biết là phải chuyển sang Section mới trong file Excel.

SELECT (Điểm bắt đầu mục "Trường hiển thị/lấy ra"):

Quy tắc xuống dòng: Khi đang ở trong scope của SELECT, cứ gặp dấu phẩy , là bạn cắt chuỗi (split) và cho xuống một dòng mới trong Excel.

FROM (Điểm bắt đầu mục "Bảng đối tượng"):

Quy tắc nhận diện Alias (Bí danh): Tách chuỗi theo dấu cách. Ví dụ R_RIYU RR -> Bảng là R_RIYU, Alias là RR. Lưu cặp này vào một Map/Dictionary tạm thời trong bộ nhớ để map ngược lại cho các điều kiện bên dưới.

WHERE (Điểm bắt đầu mục "Điều kiện chiết xuất/lọc"):

Quy tắc xuống dòng: Cứ gặp chữ AND hoặc OR đứng đầu chuỗi (sau khi trim) thì đó là một dòng điều kiện mới trong Excel.

ORDER BY (Điểm bắt đầu mục "Điều kiện sắp xếp"):

Quy tắc xuống dòng: Tương tự SELECT, gặp dấu phẩy , là xuống dòng. Kiểm tra thêm từ khóa ASC hoặc DESC ở cuối để map thành "Tăng dần" hoặc "Giảm dần".

3. Quy tắc Phân tách Toán tử (Operators Parsing trong WHERE)
Mỗi dòng trong phần WHERE (sau khi đã tách bằng AND/OR) cần được chia làm 3 cột trong Excel: [Trường dữ liệu] | [Toán tử] | [Giá trị so sánh].

Toán tử =: Tách chuỗi bằng dấu =. Bên trái là Trường, bên phải là Giá trị.

Toán tử BETWEEN ... AND ...:

Dấu hiệu: Chuỗi chứa từ khóa BETWEEN.

Logic: Bên trái BETWEEN là Trường dữ liệu. Nửa sau chứa AND (thuộc SQL, không phải ngắt dòng) là khoảng giá trị (Giá trị 1 ~ Giá trị 2).

Toán tử > hoặc <: Tương tự dấu =.

Mô phỏng luồng chạy (Workflow Logic) cho đoạn code của bạn:
Đọc vào: sql.append(" SELECT ");
-> Trạng thái: Chuyển sang Section [Item List].

Đọc vào: RR.DENPYO_KB, RR.RIYU_CD, RR.YUKO_DT...
-> Hành động: Split bằng ,. Viết ra Excel 7 dòng: RR.DENPYO_KB, RR.RIYU_CD,...

Đọc vào: sql.append(" FROM ");
-> Trạng thái: Chuyển sang Section [Tables].

Đọc vào: R_RIYU RR
-> Hành động: Ghi ra Excel tên bảng là R_RIYU. Ghi nhớ RR = R_RIYU.

Đọc vào: sql.append(" WHERE ");
-> Trạng thái: Chuyển sang Section [Conditions].

Đọc vào: RR.DENPYO_KB = '" + inBean.getDenpyoKb() + "' 
-> Hành động: Tách bằng =. Viết ra Excel: (Cột 1) RR.DENPYO_KB | (Cột 2) Bằng (=) | (Cột 3) inBean.getDenpyoKb().

Đọc vào: if(inBean.getRiyuCd() != null ...)
-> Hành động: Lưu cờ [Ghi chú: inBean.getRiyuCd() != null].

Đọc vào: RR.RIYU_CD = '" + inBean.getRiyuCd().trim() + "'  (nằm trong IF)
-> Hành động: Viết ra Excel: (Cột 1) RR.RIYU_CD | (Cột 2) Bằng (=) | (Cột 3) inBean.getRiyuCd().trim() | (Cột Ghi chú) Khi inBean.getRiyuCd() != null.
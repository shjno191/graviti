# Thay đổi: Đọc file trực tiếp từ filesystem

## Vấn đề
- App không thể đọc file khi file đang được sử dụng bởi ứng dụng khác
- Browser File API bị giới hạn bởi permission

## Giải pháp
Sử dụng **Tauri Rust backend** để đọc file trực tiếp từ filesystem, bỏ qua giới hạn của browser.

## Các thay đổi đã thực hiện:

### 1. Backend (Rust) - `src-tauri/src/main.rs`
- ✅ Thêm command `read_log_file` để đọc file từ filesystem
- ✅ Hỗ trợ Shift-JIS encoding
- ✅ Có thể đọc file ngay cả khi file đang được mở bởi app khác

### 2. Dependencies - `src-tauri/Cargo.toml`
- ✅ Thêm `encoding_rs = "0.8"` cho Shift-JIS support

### 3. Frontend - `src/components/ParamsTab.tsx`
- ✅ Thay thế `<input type="file">` bằng Tauri dialog
- ✅ Sử dụng `invoke('read_log_file')` thay vì browser File API
- ✅ Hiển thị đường dẫn file đã chọn
- ✅ UI tiếng Việt

## Cách sử dụng:
1. Nhấn nút **"📁 Chọn File"**
2. Chọn file log (có thể đang được sử dụng bởi app khác)
3. App sẽ đọc file trực tiếp từ disk
4. Không còn lỗi permission!

## Lợi ích:
- ✅ Đọc được file đang được sử dụng
- ✅ Nhanh hơn (đọc trực tiếp từ filesystem)
- ✅ Ổn định hơn
- ✅ Không cần copy file

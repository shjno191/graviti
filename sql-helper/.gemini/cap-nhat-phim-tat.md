# Cập Nhật Logic Phím Tắt CTRL+ENTER - Tab Compare Lab

## 🎯 Yêu cầu đã triển khai

### Khi FOCUS vào ô SQL:

#### Focus vào B (Statement B):
- ✅ **B có SQL** → Chạy B
- ✅ **B rỗng, A có SQL** → Chạy A (thông minh!)
- ✅ **Cả 2 đều rỗng** → Không làm gì

#### Focus vào A (Statement A):
- ✅ **A có SQL** → Chạy A
- ✅ **A rỗng, B có SQL** → Chạy B (thông minh!)
- ✅ **Cả 2 đều rỗng** → Không làm gì

### Khi KHÔNG FOCUS (bấm phím tắt ở ngoài):

- ✅ **A có, B rỗng** → Chạy A
- ✅ **B có, A rỗng** → Chạy B
- ✅ **Cả 2 đều có SQL** → Hiện modal hỏi chọn A hay B
- ✅ **Cả 2 đều rỗng** → Không làm gì

## 📊 Bảng tổng hợp các trường hợp

| Tình huống | Statement A | Statement B | Kết quả |
|------------|-------------|-------------|---------|
| **Focus vào A** | Có SQL | Rỗng | Chạy A |
| **Focus vào A** | Rỗng | Có SQL | Chạy B ⭐ |
| **Focus vào A** | Rỗng | Rỗng | Không làm gì |
| **Focus vào B** | Rỗng | Có SQL | Chạy B |
| **Focus vào B** | Có SQL | Rỗng | Chạy A ⭐ |
| **Focus vào B** | Rỗng | Rỗng | Không làm gì |
| **Không focus** | Có SQL | Rỗng | Chạy A |
| **Không focus** | Rỗng | Có SQL | Chạy B |
| **Không focus** | Có SQL | Có SQL | Hiện modal chọn |
| **Không focus** | Rỗng | Rỗng | Không làm gì |

⭐ = Logic thông minh mới (fallback)

## 💡 Ưu điểm của logic mới

1. **Tiết kiệm thời gian**: Không cần di chuyển con trỏ khi statement hiện tại rỗng
2. **Thông minh**: Tự động chạy statement còn lại khi có thể
3. **Tránh click thừa**: Chỉ hiện modal khi thực sự cần chọn (cả 2 đều có SQL)
4. **Trực quan**: Hành vi dễ đoán, hợp lý với ý định người dùng

## 🔧 Code đã thay đổi

**File**: `src/components/LabTab.tsx`

### Logic chính:
```typescript
const hasA = stateRef.current.stmt1.sql.trim();
const hasB = stateRef.current.stmt2.sql.trim();

// Kiểm tra xem đang focus vào statement nào
const activeEl = document.activeElement;

if (activeEl?.id === 'sql-lab-1') {
  // Focus vào A
  if (hasA) {
    runQuery(1);  // A có → Chạy A
    return;
  } else if (hasB) {
    runQuery(2);  // A rỗng nhưng B có → Chạy B
    return;
  }
  return;  // Cả 2 rỗng → Không làm gì
}

if (activeEl?.id === 'sql-lab-2') {
  // Focus vào B
  if (hasB) {
    runQuery(2);  // B có → Chạy B
    return;
  } else if (hasA) {
    runQuery(1);  // B rỗng nhưng A có → Chạy A
    return;
  }
  return;  // Cả 2 rỗng → Không làm gì
}

// Không focus vào statement nào
if (!hasA && !hasB) {
  return;  // Cả 2 rỗng → Không làm gì
}
if (hasA && !hasB) {
  runQuery(1);  // Chỉ A có → Chạy A
  return;
}
if (!hasA && hasB) {
  runQuery(2);  // Chỉ B có → Chạy B
  return;
}
// Cả 2 đều có → Hiện modal chọn
setShowExecPicker(true);
```

## ✅ Test Cases

### Cần test các trường hợp sau:

**Nhóm 1: Focus vào A**
1. Paste SQL vào A, để B rỗng → Focus A → CTRL+ENTER → Phải chạy A
2. Để A rỗng, paste SQL vào B → Focus A → CTRL+ENTER → Phải chạy B
3. Để cả 2 rỗng → Focus A → CTRL+ENTER → Không làm gì

**Nhóm 2: Focus vào B**  
4. Paste SQL vào B, để A rỗng → Focus B → CTRL+ENTER → Phải chạy B
5. Để B rỗng, paste SQL vào A → Focus B → CTRL+ENTER → Phải chạy A
6. Để cả 2 rỗng → Focus B → CTRL+ENTER → Không làm gì

**Nhóm 3: Không focus**
7. Paste SQL vào A, để B rỗng → Click ra ngoài → CTRL+ENTER → Phải chạy A
8. Paste SQL vào B, để A rỗng → Click ra ngoài → CTRL+ENTER → Phải chạy B
9. Paste SQL vào cả A và B → Click ra ngoài → CTRL+ENTER → Phải hiện modal
10. Để cả 2 rỗng → CTRL+ENTER → Không làm gì

## 📝 Ghi chú

- Logic này chỉ áp dụng cho **Compare Lab Tab**
- **Parameter Replacement Tab** vẫn giữ logic cũ (đơn giản hơn)
- Phím tắt mặc định là CTRL+ENTER (có thể thay đổi trong Settings)
- Khi chạy sẽ kiểm tra connection đã verified chưa
- Có kiểm tra SQL nguy hiểm (UPDATE, DELETE, etc.)

## 🎉 Hoàn thành

Tất cả các yêu cầu đã được triển khai đúng như mô tả!

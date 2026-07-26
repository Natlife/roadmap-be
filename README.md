# 🚀 Học Mẹo Node.js Express Backend (Mat Bao Hosting Ready)

Dự án Backend viết bằng **Node.js + Express + MySQL2 + JWT**, thay thế toàn bộ dự án Spring Boot nhằm tương thích 100% với hạ tầng **cPanel Node.js Selector / Hosting Mắt Bão**.

---

## 🎯 Tính Năng & API Compatibility
Dự án được chuyển đổi chuẩn 100% cấu trúc API (Data Envelope `{ code: 1000, message, data, timestamp }`), phản hồi chính xác mọi yêu cầu từ **Flutter Mobile App** và **React Admin WebApp**:

- 🔑 **Auth API**: `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `GET /api/v1/auth/me`.
- 📘 **Topic & Step API**: `GET /api/v1/topics`, `GET /api/v1/topics/:id`, `GET /api/v1/steps/:id`, `PUT /api/v1/steps/:id/progress`, `POST /api/v1/steps/:id/quiz`.
- ⚙️ **Admin Management API**: CRUD Categories, Tags, Topics, Lessons, Steps, Content Blocks, Quiz Questions.
- ⚡ **Bulk Sync API**: `POST /api/v1/admin/sync` - Đồng bộ dữ liệu đa tầng từ Admin WebPortal thẳng vào MySQL Mắt Bão.
- 🛡️ **Auto Migration & Seed Data**: Tự động tạo bảng và khởi tạo tài khoản `admin` & `user` mặc định khi khởi chạy server.

---

## 📁 Cấu Trúc Mã Nguồn (Code Structure)

```
node-backend/
├── .env                  # Cấu hình biến môi trường (Database, Port, Secret)
├── app.js                # Entry point chính cho Node.js Selector cPanel Mắt Bão
├── server.js             # Express Server startup script
├── package.json
└── src/
    ├── config/
    │   └── db.js         # MySQL2 Connection Pool (Hỗ trợ UTF-8 Tiếng Việt & Auto Reconnect)
    ├── middleware/
    │   └── authMiddleware.js # Xác thực JWT Bearer Token & phân quyền
    ├── controllers/
    │   ├── authController.js
    │   ├── topicController.js
    │   ├── adminController.js
    │   └── userController.js
    ├── services/
    │   └── seedService.js # Kiểm tra & tự động khởi tạo bảng MySQL
    └── utils/
        ├── baseResponse.js # Bọc JSON response chuẩn Spring Boot
        └── jwt.js
```

---

## 🛠️ Hướng Dẫn Khởi Chạy Cục Bộ (Local Development)

1. Cài đặt các gói phụ thuộc:
   ```bash
   cd node-backend
   npm install
   ```

2. Bật Server:
   ```bash
   npm start
   # Hoặc chế độ watch tự động reload khi sửa code:
   npm run dev
   ```
   *Server sẽ lắng nghe tại `http://localhost:5001`*

---

## 🌐 Hướng Dẫn Deploy Lên Hosting Mắt Bão (cPanel Node.js Selector)

1. **Nén & Upload thư mục `node-backend`**:
   - Upload thư mục `node-backend` lên thư mục gốc cá nhân trên Mắt Bão cPanel (ví dụ: `/home/aiv25518/node-backend`).

2. **Cấu hình trên cPanel Mắt Bão (Setup Node.js App)**:
   - Trong cPanel, tìm đến mục **Setup Node.js App**.
   - Bấm **Create Application**:
     - **Node.js version**: Chọn `18.x` hoặc `20.x`
     - **Application mode**: `Production`
     - **Application root**: `node-backend`
     - **Application URL**: Thư mục URL bạn muốn chạy backend (ví dụ: `api` hoặc giữ nguyên)
     - **Application startup file**: `app.js` (hoặc `server.js`)
   - Bấm **Create**.

3. **Cài đặt gói phụ thuộc trên cPanel**:
   - Sau khi bấm Create, giao diện sẽ xuất hiện nút **Run NPM Install**, bạn nhấp vào đó để cPanel tự động tải các gói thư viện (`express`, `mysql2`, `jsonwebtoken`, v.v.).

4. **Khởi chạy & Tận hưởng**:
   - Bấm **Restart Application** trên cPanel.
   - Kiểm tra API qua đường dẫn: `https://yourdomain.com/api/v1/health`

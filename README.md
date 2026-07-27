# Học Mẹo Node.js Express REST API Backend (`roadmap-be`)

Dự án Backend chính của nền tảng **Học Mẹo**, viết bằng **Node.js + Express + MySQL2 + JWT**, tương thích 100% với hạ tầng **cPanel Node.js Selector / Hosting Mắt Bão** cũng như môi trường Docker / VPS.

---

## 1. Tính Năng & API Specification

Dự án sử dụng chuẩn dữ liệu Envelope phản hồi (`{ code: 1000, message, data, timestamp }`), phục vụ cả **Flutter Mobile App** và **React Admin Web Console**:

- **Auth API**: `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `GET /api/v1/auth/me`.
- **Topic & Progress API**: `GET /api/v1/topics`, `GET /api/v1/topics/:id`, `GET /api/v1/steps/:id`, `PUT /api/v1/steps/:id/progress`, `POST /api/v1/steps/:id/quiz`.
- **Plan Request API (Nâng cấp Premium)**:
  - `POST /api/v1/plan-requests` — Học viên gửi yêu cầu nâng cấp gói.
  - `GET /api/v1/plan-requests/my` — Học viên xem danh sách yêu cầu cá nhân.
  - `GET /api/v1/admin/plan-requests` — Admin xem & tìm kiếm danh sách ticket.
  - `PATCH /api/v1/admin/plan-requests/:id` — Admin duyệt (`APPROVED`), từ chối (`REJECTED`) hoặc hoãn (`PENDING`). Khi duyệt, tài khoản học viên tự động nâng cấp sang `PREMIUM` (`plan = 'PREMIUM'`).
- **Admin Management API**: CRUD Categories, Tags, Topics, Lessons, Steps, Content Blocks, Quiz Questions, Users, Groups.
- **Bulk Sync API**: `POST /api/v1/admin/sync` — Đồng bộ dữ liệu đa tầng từ Admin Web Console vào MySQL.
- **Auto Migration & Seed Data**: Tự động khởi tạo bảng (`users`, `topics`, `plan_requests`, v.v.) và seed tài khoản thử nghiệm khi khởi chạy máy chủ.

---

## 2. Cấu Trúc Mã Nguồn (Code Structure)

```
roadmap-be/
├── .env                  # Cấu hình biến môi trường (Database, Port, JWT Secret)
├── .env.example          # Mẫu cấu hình môi trường
├── app.js                # Entry point chính cho Node.js Selector cPanel Mắt Bão
├── server.js             # Express Server startup script
├── package.json
└── src/
    ├── config/
    │   └── db.js         # Connection Pool MySQL2 (Hỗ trợ UTF-8 Tiếng Việt & Reconnect)
    ├── controllers/
    │   ├── authController.js
    │   ├── topicController.js
    │   ├── planRequestController.js
    │   ├── adminController.js
    │   └── userController.js
    ├── middleware/
    │   ├── auth.js       # Xác thực JWT Bearer Token & phân quyền Admin
    │   └── error.js      # Async Handler & Global Error Middleware
    ├── repositories/     # Data Layer / SQL Queries
    ├── routes/           # REST API Endpoint definitions
    ├── services/
    │   ├── planRequestService.js # Nghiệp vụ ticket & tự động upgrade plan PREMIUM
    │   └── seedService.js        # Migration & Dữ liệu mẫu khởi tạo CSDL
    └── utils/
        ├── baseResponse.js       # Format JSON response chuẩn Envelope
        └── jwt.js                # Sign & Verify JWT Token
```

---

## 3. Hướng Dẫn Khởi Chạy Cục Bộ (Local Setup)

1. **Cài đặt các gói thư viện**:
   ```bash
   cd roadmap-be
   npm install
   ```

2. **Cấu hình biến môi trường**:
   Tạo tệp `.env` từ `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. **Khởi chạy Server**:
   ```bash
   # Chế độ phát triển (Tự động restart khi sửa code):
   npm run dev

   # Hoặc chế độ Production:
   npm start
   ```
   *Máy chủ Backend sẽ lắng nghe tại `http://localhost:5001`*

---

## 4. Hướng Dẫn Deploy Lên Hosting Mắt Bão (cPanel Node.js Selector)

1. Upload toàn bộ mã nguồn `roadmap-be` (trừ `node_modules`) lên cPanel.
2. Vào mục **Setup Node.js App** trên cPanel Mắt Bão:
   - Node.js version: `18.x` hoặc `20.x`
   - Application root: `roadmap-be`
   - Application startup file: `server.js` (hoặc `app.js`)
3. Bấm **Run NPM Install** và bấm **Restart Application**.

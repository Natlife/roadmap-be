// app.js

// 1. Ép cổng PORT của Passenger vào biến môi trường hệ thống
// phòng trường hợp config/env.js lấy giá trị mặc định nếu không thấy PORT
if (process.env.PORT) {
  process.env.PORT = process.env.PORT;
}

const { bootstrap } = require('./server.js');
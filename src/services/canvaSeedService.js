const pool = require('../config/db');

async function seedCanvaBasicTopic() {
  let connection;
  try {
    connection = await pool.getConnection();

    console.log('🎨 [Canva Seed] Starting Canva Basic topic creation from PDF spec...');

    // 1. Category "Design & Education"
    let categoryId;
    const [catRows] = await connection.query(`SELECT id FROM categories WHERE title LIKE '%Design%' OR title LIKE '%Thiết Kế%' LIMIT 1`);
    if (catRows.length > 0) {
      categoryId = catRows[0].id;
    } else {
      const [resCat] = await connection.query(`INSERT INTO categories (title, description, status) VALUES ('Thiết Kế & Sáng Tạo', 'Canva, Đồ họa, Thuyết trình & Đồ dùng dạy học', 1)`);
      categoryId = resCat.insertId;
    }

    // 2. Tag "Canva"
    let tagId;
    const [tagRows] = await connection.query(`SELECT id FROM tags WHERE title LIKE '%Canva%' LIMIT 1`);
    if (tagRows.length > 0) {
      tagId = tagRows[0].id;
    } else {
      const [resTag] = await connection.query(`INSERT INTO tags (title, description, status) VALUES ('Canva', 'Công cụ thiết kế đồ họa sáng tạo', 1)`);
      tagId = resTag.insertId;
    }

    // 3. Topic "Canva Basic"
    const topicTitle = 'Dạy Học Sáng Tạo Cùng Canva (Canva Basic)';
    const topicDescription = 'Lộ trình toàn diện hướng dẫn Giáo viên & Học viên làm chủ Canva: Thiết kế bài thuyết trình sinh động, tạo phiếu bài tập (Worksheets), tương tác thực tế với Whiteboard và tạo Poster trang trí lớp học.';
    
    let topicId;
    const [existingTopic] = await connection.query(`SELECT id FROM topics WHERE title = ?`, [topicTitle]);
    if (existingTopic.length > 0) {
      topicId = existingTopic[0].id;
      await connection.query(
        `UPDATE topics SET description = ?, emoji = '🎨', level_label = 'Beginner', estimated_hours = 6, access_level = 'FREE', status = 1 WHERE id = ?`,
        [topicDescription, topicId]
      );
    } else {
      const [resTopic] = await connection.query(
        `INSERT INTO topics (title, description, emoji, level_label, estimated_hours, access_level, status)
         VALUES (?, ?, '🎨', 'Beginner', 6, 'FREE', 1)`,
        [topicTitle, topicDescription]
      );
      topicId = resTopic.insertId;
    }

    // Clean up duplicates & link Topic - Category & Tag cleanly
    await connection.query(`DELETE FROM topic_categories WHERE topic_id = ?`, [topicId]);
    await connection.query(`DELETE FROM topic_tags WHERE topic_id = ?`, [topicId]);
    await connection.query(`INSERT INTO topic_categories (topic_id, category_id) VALUES (?, ?)`, [topicId, categoryId]);
    await connection.query(`INSERT INTO topic_tags (topic_id, tag_id) VALUES (?, ?)`, [topicId, tagId]);

    // Helper to insert or get Lesson
    async function createOrGetLesson(title, summary, orderIndex, estMinutes) {
      const [rows] = await connection.query(`SELECT id FROM lessons WHERE topic_id = ? AND title = ?`, [topicId, title]);
      if (rows.length > 0) return rows[0].id;
      const [res] = await connection.query(
        `INSERT INTO lessons (topic_id, title, summary, order_index, access_level, estimated_minutes, status)
         VALUES (?, ?, ?, ?, 'FREE', ?, 1)`,
        [topicId, title, summary, orderIndex, estMinutes]
      );
      return res.insertId;
    }

    // Helper to insert or get Step
    async function createOrGetStep(lessonId, title, summary, orderIndex, note, theory, codeSnippet, xpReward, checklistArray = []) {
      const checklistJson = JSON.stringify(checklistArray);
      const [rows] = await connection.query(`SELECT id FROM steps WHERE lesson_id = ? AND title = ?`, [lessonId, title]);
      let stepId;
      if (rows.length > 0) {
        stepId = rows[0].id;
        await connection.query(
          `UPDATE steps
           SET summary = ?,
               order_index = ?,
               access_level = 'FREE',
               note = ?,
               theory = ?,
               code_snippet = ?,
               code_language = 'text',
               checklist_json = ?,
               pass_threshold = 80,
               estimated_minutes = 15,
               xp_reward = ?,
               status = 1
           WHERE id = ?`,
          [summary, orderIndex, note, theory, codeSnippet, checklistJson, xpReward, stepId]
        );
      } else {
        const [result] = await connection.query(
          `INSERT INTO steps (
             lesson_id, title, summary, order_index, access_level, note, theory,
             code_snippet, code_language, checklist_json, pass_threshold, estimated_minutes, xp_reward, status
           )
           VALUES (?, ?, ?, ?, 'FREE', ?, ?, ?, 'text', ?, 80, 15, ?, 1)`,
          [lessonId, title, summary, orderIndex, note, theory, codeSnippet, checklistJson, xpReward]
        );
        stepId = result.insertId;
      }

      // Clean existing blocks & quizzes to prevent duplication on restart
      await connection.query(`DELETE FROM content_blocks WHERE step_id = ?`, [stepId]);
      await connection.query(`DELETE FROM quiz_questions WHERE step_id = ?`, [stepId]);

      return stepId;
    }

    // Helper to insert Content Blocks
    async function addBlock(stepId, type, title, body, itemsJson, orderIndex) {
      let blockType = 'PARAGRAPH';
      if (type === 'heading') blockType = 'HEADING';
      if (type === 'callout') blockType = 'CALLOUT';
      if (type === 'checklist' || type === 'bullets') blockType = 'BULLETS';

      await connection.query(
        `INSERT INTO content_blocks (step_id, block_type, title, body, items_json, order_index, status)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [stepId, blockType, title || '', body || '', itemsJson || '', orderIndex]
      );
    }

    // Helper to insert Quiz Questions
    async function addQuiz(stepId, prompt, optionsArray, correctIndex) {
      await connection.query(
        `INSERT INTO quiz_questions (step_id, prompt, options_json, correct_index, status)
         VALUES (?, ?, ?, ?, 1)`,
        [stepId, prompt, JSON.stringify(optionsArray), correctIndex]
      );
    }

    // -------------------------------------------------------------
    // LESSON 1: HỌC PHẦN 1 - LÀM QUEN & THIẾT KẾ BÀI THUYẾT TRÌNH
    // -------------------------------------------------------------
    const l1Id = await createOrGetLesson(
      'Học Phần 1: Làm Quen & Thiết Kế Bài Thuyết Trình',
      'Tổng quan giao diện Canva Giáo dục, quản lý bản thiết kế và làm chủ các kỹ năng soạn slide thuyết trình chuyên nghiệp.',
      1,
      45
    );

    const s1_1 = await createOrGetStep(
      l1Id,
      'Giao diện Trang chủ & Tổng quan Canva Education',
      'Khám phá thanh điều hướng, kho tài nguyên 150K+ mẫu giáo dục và cách quản lý thiết kế cá nhân.',
      1,
      '💡 Canva Education hoàn toàn 100% MIỄN PHÍ cho giáo viên và các trường học với hơn 100 triệu người dùng trên 150 quốc gia.',
      'Canva là nền tảng thiết kế đồ họa kéo-thả trực quan. Giao diện trang chủ bao gồm:\n- Thanh điều hướng bên trái: Trang chủ, Lớp học, Dự án, Mẫu thiết kế.\n- Ô tìm kiếm trung tâm: Tìm kiếm mẫu theo từ khóa bài học.\n- Kho mẫu Giáo dục: Bài thuyết trình, Phiếu bài tập, Docs, Whiteboard, Poster.',
      'Phím tắt thông dụng trên Canva:\nT (Text)     : Thêm nhanh ô Văn bản\nR (Rectangle): Thêm nhanh Hình chữ nhật/Hình khối\nL (Line)     : Thêm nhanh Đường kẻ',
      25,
      [
        "Đăng nhập tài khoản Canva Education chính chủ",
        "Khám phá thanh điều hướng bên trái và thanh tìm kiếm mẫu bài giảng",
        "Xem danh mục bài thuyết trình và phiếu bài tập mẫu",
        "Lưu bài thiết kế đầu tiên vào thư mục Dự án của tôi"
      ]
    );

    await addBlock(s1_1, 'heading', '1. Quyền lợi tài khoản Canva Education', 'Tài khoản Giáo dục mở khóa toàn bộ thư viện mẫu cao cấp, tính năng tạo lớp học và công cụ AI Canva Magic.', '', 0);
    await addBlock(s1_1, 'checklist', 'Các khu vực cốt lõi trên Trang chủ', '', JSON.stringify(["Thanh Menu bên trái (Dự án, Lớp học, Mẫu)", "Thanh Tìm kiếm thông minh theo chủ đề giảng dạy", "Danh mục phân loại nhanh (Bài thuyết trình, Phiếu bài tập, Whiteboard, Poster)", "Khu vực bài thiết kế Gần đây (Recent Designs)"]), 1);

    await addQuiz(s1_1, 'Tài khoản Canva Education cung cấp chính sách giá như thế nào cho giáo viên và nhà trường?', ["Giảm giá 50%", "Miễn phí 100%", "Dùng thử 30 ngày", "Thu phí theo tháng"], 1);
    await addQuiz(s1_1, 'Phím tắt nào giúp bạn thêm nhanh một khung văn bản (Text box) vào thiết kế?', ["Phím R", "Phím L", "Phím T", "Phím S"], 2);

    const s1_2 = await createOrGetStep(
      l1Id,
      'Kỹ thuật Soạn Slide & Trình chiếu Magic Interactivity',
      'Thao tác chỉnh sửa bài thuyết trình, tùy biến thành phần đồ họa và sử dụng hiệu ứng tương tác trình chiếu Magic.',
      2,
      '✨ Khi ở chế độ Trình chiếu (Presenter Mode), hãy bấm các phím tắt Magic để tạo hiệu ứng âm thanh và hình ảnh sống động thu hút học sinh!',
      'Khi thiết kế bài thuyết trình:\n- Sử dụng tab Thành phần (Elements) để chèn Hình khối (R), Đồ họa (Graphics), Văn bản (T).\n- Chỉnh sửa từng slide: Thêm slide mới, sao chép slide, thay đổi màu sắc & font chữ Tiếng Việt.\n- Sử dụng công cụ Canva Magic AI để gợi ý thiết kế và soạn thảo nội dung (Magic Write).',
      'Bảng Phím tắt Magic khi Trình chiếu (Presenter Mode):\nB : Làm mờ màn hình (Blur)\nQ : Hiệu ứng Im lặng (Quiet/Shh)\nO : Mưa bong bóng (Bubbles)\nC : Pháo giấy ăn mừng (Confetti)\nD : Tiếng trống dồn (Drumroll)\nU : Phủ rèm sân khấu (Curtain Curtain)\nM : Thả Micro (Mic Drop)',
      30,
      [
        "Tạo mới slide bài thuyết trình với kích thước 16:9",
        "Thêm khung văn bản (Phím T) và hình khối trang trí (Phím R)",
        "Trải nghiệm trình chiếu Magic với phím C (Confetti) và B (Blur)",
        "Xuất bài thuyết trình sang dạng file Video MP4"
      ]
    );

    await addBlock(s1_2, 'heading', '1. Thao tác chỉnh sửa Slide', 'Thêm mới, nhân bản, sắp xếp vị trí slide và áp dụng bộ mẫu màu đồng bộ cho toàn bộ bài thuyết trình.', '', 0);
    await addBlock(s1_2, 'callout', 'Tính năng Chuyển bài thuyết trình thành Video & Tự động dịch', 'Canva cho phép xuất slide thành file Video MP4 hoặc tự động dịch toàn bộ văn bản slide sang các ngôn ngữ khác chỉ với 1 cú nhấp.', '', 1);

    await addQuiz(s1_2, 'Trong lúc đang trình chiếu slide cho học sinh, phím tắt nào giúp bạn tung hiệu ứng Pháo giấy (Confetti) chúc mừng?', ["Phím B", "Phím C", "Phím D", "Phím M"], 1);
    await addQuiz(s1_2, 'Phím tắt nào tạo hiệu ứng mờ màn hình (Blur) để tập trung sự chú ý của học sinh về phía giáo viên?', ["Phím B", "Phím Q", "Phím O", "Phím U"], 0);

    // -------------------------------------------------------------
    // LESSON 2: HỌC PHẦN 2 - KỸ THUẬT THIẾT KẾ CƠ BẢN & TẠO PHIẾU BÀI TẬP
    // -------------------------------------------------------------
    const l2Id = await createOrGetLesson(
      'Học Phần 2: Kỹ Thuật Thiết Kế Cơ Bản & Tạo Phiếu Bài Tập',
      'Làm chủ công cụ đường kẻ, căn chỉnh vị trí chính xác, tạo bảng dữ liệu và thiết kế phiếu bài tập (Worksheets) tối ưu cho in ấn.',
      2,
      50
    );

    const s2_1 = await createOrGetStep(
      l2Id,
      'Kỹ thuật Đường kẻ, Căn chỉnh & Thao tác Bảng (Table)',
      'Sử dụng phím Shift giữ thẳng hàng, nhóm thành phần, sao chép định dạng và tạo bảng phiếu bài tập.',
      1,
      '🎯 Mẹo: Giữ phím Shift khi vẽ đường kẻ (L) hoặc kéo thả đối tượng để giữ đường thẳng hàng hoàn hảo!',
      'Kỹ thuật thiết kế cốt lõi trên Canva:\n1. Đường kẻ (Lines - Phím L): Điều chỉnh độ dày, nét liền, nét đứt, mũi tên đầu/cuối.\n2. Căn chỉnh (Alignment): Giữ Shift chọn nhiều thành phần -> Nhóm (Ctrl+G) hoặc căn thẳng hàng thông minh qua đường viền đỏ.\n3. Sao chép định dạng: Ctrl + Alt + C.\n4. Sao chép nhanh đối tượng: Ctrl + D.\n5. Bảng (Table): Tạo bảng, gộp/tách ô, ẩn đường viền trùng màu nền.',
      'Phím tắt căn chỉnh nâng cao:\nCtrl + G       : Nhóm đối tượng (Group)\nCtrl + Shift + G: Bỏ nhóm (Ungroup)\nCtrl + D       : Nhân bản nhanh (Duplicate)\nCtrl + Alt + C : Sao chép định dạng (Copy Style)',
      30,
      [
        "Tạo đường kẻ (Phím L) và giữ Shift để đường luôn thẳng",
        "Nhóm các đối tượng cùng loại với tổ hợp phím Ctrl + G",
        "Tạo bảng dữ liệu bài tập (Table) và tùy chỉnh màu viền",
        "Nhân bản nhanh đối tượng bằng tổ hợp phím Ctrl + D"
      ]
    );

    await addBlock(s2_1, 'heading', '1. Thao tác điều khiển Bảng (Table) chuyên nghiệp', 'Chuột phải vào ô trong bảng để chèn thêm hàng/cột, gộp ô hoặc điều chỉnh màu viền trùng màu nền tạo khoảng trống bài tập.', '', 0);

    await addQuiz(s2_1, 'Tổ hợp phím nào dùng để nhân bản nhanh (Duplicate) một thành phần đang chọn trên Canva?', ["Ctrl + C", "Ctrl + D", "Ctrl + V", "Ctrl + Z"], 1);
    await addQuiz(s2_1, 'Để chọn nhiều đối tượng cùng lúc và giữ đường kẻ luôn thẳng hàng, bạn cần giữ phím nào trên bàn phím?', ["Phím Alt", "Phím Ctrl", "Phím Shift", "Phím Tab"], 2);

    const s2_2 = await createOrGetStep(
      l2Id,
      'Thiết kế Phiếu Bài Tập & Quy tắc Tối ưu In Ấn (Print Ready)',
      'Nguyên tắc phối màu sáng, độ dày nét vẽ thích hợp và xuất file định dạng PDF Bản in sắc nét.',
      2,
      '🖨️ Luôn chọn định dạng "PDF bản in" (PDF Print) khi xuất file phiếu bài tập để đảm bảo độ phân giải cao nhất cho máy in!',
      'Quy tắc thiết kế phiếu bài tập chất lượng:\n- Ưu tiên nền màu trắng hoặc màu pastel cực sáng giúp học sinh đọc và viết không bị mỏi mắt.\n- Điều chỉnh độ dày đường kẻ và khoảng cách ô đủ rộng cho học sinh tiểu học / trung học viết chữ.\n- Khi tải xuống: Chọn tùy chọn "PDF bản in" (PDF Print) thay vì PDF tiêu chuẩn để giữ chuẩn CMYK và sắc nét.',
      'Các định dạng xuất file Canva:\nPNG       : Hình ảnh chất lượng cao cho web\nPDF Standard: Đọc trên máy tính / gửi email\nPDF Print   : Tối ưu chuẩn in ấn giấy A4/A5',
      25,
      [
        "Lựa chọn màu nền trắng hoặc màu pastel cực sáng",
        "Căn chỉnh khoảng cách các dòng ô đủ rộng cho viết tay",
        "Tải xuống file với tùy chọn PDF Bản in (PDF Print) tối ưu sắc nét"
      ]
    );

    await addQuiz(s2_2, 'Định dạng tệp nào khi tải xuống từ Canva được khuyến nghị tối ưu nhất cho việc in ra giấy?', ["File PNG", "PDF tiêu chuẩn", "PDF bản in (PDF Print)", "Video MP4"], 2);

    // -------------------------------------------------------------
    // LESSON 3: HỌC PHẦN 3 - CHIA SẺ VÀ TƯƠNG TÁC TRỰC TUYẾN VỚI WHITEBOARD
    // -------------------------------------------------------------
    const l3Id = await createOrGetLesson(
      'Học Phần 3: Chia Sẻ & Tương Tác Trực Tuyến Với Whiteboard',
      'Ứng dụng Bảng trắng Canva Whiteboard không giới hạn cho giờ học nhóm, thảo luận trực tiếp và quản lý phân quyền lớp học.',
      3,
      40
    );

    const s3_1 = await createOrGetStep(
      l3Id,
      'Ứng dụng Canva Whiteboard & Công cụ Tương tác Nhóm',
      'Sử dụng không gian trắng vô hạn, dán ghi chú Sticky Notes, bút vẽ và bộ hẹn giờ thảo luận.',
      1,
      '📌 Ghi chú Sticky Notes giúp học sinh dễ dàng đóng góp ý kiến cá nhân trong tiết học thảo luận nhóm.',
      'Canva Whiteboard cung cấp không gian làm việc rộng mở không giới hạn trang:\n- Sticky Notes (Ghi chú dán): Tạo các thẻ ý kiến nhiều màu sắc.\n- Draw Tools (Bút vẽ): Vẽ tự do, đánh dấu điểm trọng tâm.\n- Timer (Bộ hẹn giờ): Đếm ngược thời gian thảo luận bài tập nhóm.\n- Chia sẻ liên kết công khai với cấp độ truy cập "Có thể chỉnh sửa" (Can Edit) để học sinh cùng tham gia real-time.',
      'Các bước tổ chức tiết học tương tác Whiteboard:\n1. Tạo thiết kế Whiteboard mới\n2. Bấm "Chia sẻ" -> Đổi cấp độ: "Bất kỳ ai có liên kết" -> "Có thể chỉnh sửa"\n3. Mở Bộ hẹn giờ 5 phút\n4. Học sinh dán Sticky Notes trả lời câu hỏi',
      30,
      [
        "Khởi tạo trang làm việc Bảng trắng Canva Whiteboard",
        "Thêm các thẻ Ghi chú dán (Sticky Notes) nhiều màu sắc",
        "Kích hoạt Bộ hẹn giờ (Timer) đếm ngược 5 phút thảo luận",
        "Chia sẻ liên kết với quyền 'Có thể chỉnh sửa' cho học viên"
      ]
    );

    await addQuiz(s3_1, 'Khi muốn học sinh cùng tham gia điền ý kiến vào Whiteboard theo thời gian thực, giáo viên cần cài đặt quyền truy cập nào khi chia sẻ liên kết?', ["Chỉ xem (Can view)", "Có thể bình luận (Can comment)", "Có thể chỉnh sửa (Can edit)", "Khóa riêng tư"], 2);
    await addQuiz(s3_1, 'Tính năng nào trên Canva Whiteboard thích hợp nhất để từng học sinh ghi nhanh câu trả lời ngắn của mình?', ["Khung ảnh (Frames)", "Ghi chú dán (Sticky Notes)", "Tệp PDF", "Hình chuyển động"], 1);

    // -------------------------------------------------------------
    // LESSON 4: HỌC PHẦN 4 - THIẾT KẾ POSTER SỰ KIỆN, TRANG TRÍ LỚP HỌC
    // -------------------------------------------------------------
    const l4Id = await createOrGetLesson(
      'Học Phần 4: Thiết Kế Poster Sự Kiện, Trang Trí Lớp Học',
      'Kỹ thuật xử lý hình ảnh AI, tách nền tự động, lồng ảnh vào Khung (Frames), hút màu thương hiệu và quản lý các lớp (Layers).',
      4,
      45
    );

    const s4_1 = await createOrGetStep(
      l4Id,
      'Kỹ thuật Xử lý Hình ảnh AI, Khung (Frames) & Quản lý Lớp (Layers)',
      'Xóa nền ảnh 1-click, cắt ảnh theo khung đồ họa, sử dụng ống hút màu Eyedropper và sắp xếp thứ tự Layer.',
      1,
      '🪄 Chức năng Xóa nền (Background Remover) giúp tự động tách hình ảnh giáo viên/học sinh để đưa vào Poster trang trí lớp!',
      'Các kỹ thuật thiết kế Poster nâng cao:\n1. Xóa nền (Background Remover): Tách nền nhân vật trong 1 giây.\n2. Khung (Frames): Cắt ảnh theo hình tròn, gợn sóng, đa giác.\n3. Hút màu (Eyedropper): Chọn công cụ Chọn màu -> Dùng ống hút chọn chính xác màu từ bức ảnh mẫu.\n4. Đổi cỡ (Resize): Thay đổi kích thước poster thành banner/tờ rơi linh hoạt.\n5. Quản lý lớp (Layers): Đưa đối tượng lên trên (Ctrl+]) hoặc xuống dưới (Ctrl+[), chỉnh độ trong suốt (Transparency).',
      'Phím tắt quản lý Layer:\nCtrl + ] : Đưa lên 1 lớp (Bring Forward)\nCtrl + [ : Đưa xuống 1 lớp (Send Backward)\nCtrl + Alt + ] : Đưa lên trên cùng\nCtrl + Alt + [ : Đưa xuống dưới cùng',
      35,
      [
        "Tách nền ảnh tự động bằng công cụ AI Background Remover",
        "Thả hình ảnh vào Khung (Frames) đồ họa hình tròn",
        "Sử dụng ống hút màu Eyedropper trích xuất màu chuẩn",
        "Sắp xếp thứ tự Lớp (Layers) với phím tắt Ctrl + [ và Ctrl + ]"
      ]
    );

    await addBlock(s4_1, 'heading', '1. Kỹ thuật lồng hình ảnh vào Khung (Frames)', 'Kéo bức ảnh bất kỳ thả vào Khung đồ họa trong tab Thành phần để tự động cắt ảnh theo hình dạng mong muốn.', '', 0);
    await addBlock(s4_1, 'callout', 'Nhiệm vụ thực hành tốt nghiệp', 'Hãy thiết kế 1 Poster Trang trí lớp học (Nội quy lớp học, Bảng vinh danh thành tích hoặc Khung từ vựng Tiếng Anh) và xuất file PDF bản in!', '', 1);

    await addQuiz(s4_1, 'Để cắt một hình ảnh theo dạng hình tròn hoặc hình đám mây, bạn cần sử dụng thành phần nào trong Canva?', ["Hình khối (Shapes)", "Khung (Frames)", "Ghi chú (Sticky Notes)", "Bảng (Table)"], 1);
    await addQuiz(s4_1, 'Tổ hợp phím tắt nào giúp bạn di chuyển một thành phần xuống bên dưới một lớp khác (Send Backward)?', ["Ctrl + ]", "Ctrl + [", "Ctrl + D", "Ctrl + Shift"], 1);

    console.log(`✅ [Canva Seed] Canva Basic topic seeded successfully with ID '${topicId}' into MySQL!`);
  } catch (err) {
    console.error('❌ [Canva Seed] Error seeding Canva Basic topic:', err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  seedCanvaBasicTopic,
};

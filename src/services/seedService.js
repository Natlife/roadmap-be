const pool = require("../config/db");

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SHOW COLUMNS FROM ${tableName} LIKE ?`,
    [columnName],
  );
  return rows.length > 0;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(`SHOW TABLES LIKE ?`, [tableName]);
  return rows.length > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
    [indexName],
  );
  return rows.length > 0;
}

async function tableRowCount(connection, tableName) {
  if (!(await tableExists(connection, tableName))) {
    return 0;
  }

  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM ${tableName}`,
  );
  return Number(rows[0]?.total || 0);
}

async function ensureUserStepProgressSchema(connection) {
  const alterations = [];

  if (
    !(await columnExists(
      connection,
      "user_step_progress",
      "completed_checklist_json",
    ))
  ) {
    alterations.push(
      `ADD COLUMN completed_checklist_json LONGTEXT NULL AFTER progress_status`,
    );
  }
  if (!(await columnExists(connection, "user_step_progress", "quiz_score"))) {
    alterations.push(
      `ADD COLUMN quiz_score INT NOT NULL DEFAULT 0 AFTER completed_checklist_json`,
    );
  }
  if (
    !(await columnExists(connection, "user_step_progress", "last_accessed_at"))
  ) {
    alterations.push(
      `ADD COLUMN last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER quiz_score`,
    );
  }
  if (!(await columnExists(connection, "user_step_progress", "status"))) {
    alterations.push(`ADD COLUMN status INT DEFAULT 1 AFTER last_accessed_at`);
  }
  if (!(await columnExists(connection, "user_step_progress", "created_at"))) {
    alterations.push(
      `ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER status`,
    );
  }
  if (!(await columnExists(connection, "user_step_progress", "updated_at"))) {
    alterations.push(
      `ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`,
    );
  }

  if (alterations.length > 0) {
    await connection.query(
      `ALTER TABLE user_step_progress ${alterations.join(", ")}`,
    );
  }

  if (await columnExists(connection, "user_step_progress", "score")) {
    await connection.query(
      `UPDATE user_step_progress
       SET quiz_score = CASE
         WHEN (quiz_score IS NULL OR quiz_score = 0) AND score IS NOT NULL THEN score
         ELSE quiz_score
       END`,
    );
  }

  if (
    !(await indexExists(connection, "user_step_progress", "user_step_unique"))
  ) {
    await connection.query(
      `ALTER TABLE user_step_progress ADD UNIQUE KEY user_step_unique (user_id, step_id)`,
    );
  }
}

async function ensureCoreSchemaCompatibility(connection) {
  const hasSteps = await tableExists(connection, "steps");
  const hasLegacyStepItems = await tableExists(connection, "step_items");

  if (!hasSteps && hasLegacyStepItems) {
    await connection.query("RENAME TABLE step_items TO steps");
  }

  if (await tableExists(connection, "content_blocks")) {
    const hasBlockType = await columnExists(
      connection,
      "content_blocks",
      "block_type",
    );
    const hasLegacyType = await columnExists(
      connection,
      "content_blocks",
      "type",
    );

    if (!hasBlockType) {
      await connection.query(
        `ALTER TABLE content_blocks
         ADD COLUMN block_type VARCHAR(50) NOT NULL DEFAULT 'PARAGRAPH' AFTER step_id`,
      );
    } else {
      try {
        await connection.query(
          `ALTER TABLE content_blocks MODIFY block_type VARCHAR(50) NOT NULL DEFAULT 'PARAGRAPH'`,
        );
      } catch (_) {}
    }

    if (hasLegacyType) {
      await connection.query(
        `UPDATE content_blocks
         SET block_type = UPPER(COALESCE(NULLIF(block_type, ''), type, 'PARAGRAPH'))`,
      );
    }
  }

  if (
    (await tableExists(connection, "learning_groups")) &&
    !(await columnExists(connection, "learning_groups", "expired_at"))
  ) {
    await connection.query(
      `ALTER TABLE learning_groups
       ADD COLUMN expired_at DATETIME NULL AFTER description`,
    );
  }

  if (await tableExists(connection, "roles")) {
    await connection.query(
      `UPDATE roles
       SET name = CASE
         WHEN UPPER(name) = 'ADMIN' THEN 'ROLE_ADMIN'
         WHEN UPPER(name) = 'USER' THEN 'ROLE_USER'
         ELSE name
       END`,
    );
  }

  if (await tableExists(connection, "users")) {
    if (await columnExists(connection, "users", "plan")) {
      await connection.query(
        `UPDATE users
         SET plan = CASE
           WHEN UPPER(plan) = 'GROUPPRO' THEN 'GROUP'
           ELSE UPPER(COALESCE(plan, 'FREE'))
         END`,
      );
    }
    if (!(await columnExists(connection, "users", "streak_days"))) {
      await connection.query(
        "ALTER TABLE users ADD COLUMN streak_days INT DEFAULT 0",
      );
    } else {
      await connection.query(
        "ALTER TABLE users MODIFY streak_days INT DEFAULT 0",
      );
    }
    if (!(await columnExists(connection, "users", "completed_steps_count"))) {
      await connection.query(
        "ALTER TABLE users ADD COLUMN completed_steps_count INT DEFAULT 0",
      );
    } else {
      await connection.query(
        "ALTER TABLE users MODIFY completed_steps_count INT DEFAULT 0",
      );
    }
  }

  if (await tableExists(connection, "categories")) {
    try {
      await connection.query(
        "ALTER TABLE categories ADD CONSTRAINT unique_category_title UNIQUE (title)",
      );
    } catch (_) {}
  }

  if (await tableExists(connection, "tags")) {
    try {
      await connection.query(
        "ALTER TABLE tags ADD CONSTRAINT unique_tag_title UNIQUE (title)",
      );
    } catch (_) {}
  }

  if (await tableExists(connection, "topics")) {
    try {
      await connection.query(
        "ALTER TABLE topics ADD CONSTRAINT unique_topic_title UNIQUE (title)",
      );
    } catch (_) {}
  }

  const longtextColumns = [
    { table: "content_blocks", col: "body" },
    { table: "content_blocks", col: "items_json" },
    { table: "content_blocks", col: "media_url" },
    { table: "content_blocks", col: "caption" },
    { table: "content_blocks", col: "title" },
    { table: "steps", col: "summary" },
    { table: "steps", col: "note" },
    { table: "steps", col: "theory" },
    { table: "steps", col: "code_snippet" },
    { table: "steps", col: "checklist_json" },
    { table: "lessons", col: "summary" },
    { table: "topics", col: "description" },
    { table: "categories", col: "description" },
    { table: "tags", col: "description" },
    { table: "quiz_questions", col: "prompt" },
    { table: "quiz_questions", col: "options_json" },
    { table: "user_step_progress", col: "completed_checklist_json" },
  ];

  for (const item of longtextColumns) {
    if (
      (await tableExists(connection, item.table)) &&
      (await columnExists(connection, item.table, item.col))
    ) {
      try {
        await connection.query(
          `ALTER TABLE ${item.table} MODIFY ${item.col} LONGTEXT NULL`,
        );
      } catch (_) {}
    }
  }

  for (const tableName of ["topics", "lessons", "steps"]) {
    if (
      (await tableExists(connection, tableName)) &&
      (await columnExists(connection, tableName, "access_level"))
    ) {
      await connection.query(
        `UPDATE ${tableName}
         SET access_level = UPPER(COALESCE(access_level, 'FREE'))`,
      );
    }
  }

  if (
    (await tableExists(connection, "user_step_progress")) &&
    (await columnExists(connection, "user_step_progress", "progress_status"))
  ) {
    await connection.query(
      `UPDATE user_step_progress
       SET progress_status = CASE
         WHEN LOWER(progress_status) = 'completed' THEN 'COMPLETED'
         WHEN LOWER(progress_status) = 'in_progress' THEN 'IN_PROGRESS'
         WHEN LOWER(progress_status) = 'not_started' THEN 'NOT_STARTED'
         WHEN LOWER(progress_status) = 'locked' THEN 'NOT_STARTED'
         ELSE UPPER(COALESCE(progress_status, 'NOT_STARTED'))
       END`,
    );
  }
}

async function syncCompletedStepCounts(connection) {
  await connection.query(
    `UPDATE users u
     SET completed_steps_count = (
       SELECT COUNT(*)
       FROM user_step_progress usp
       WHERE usp.user_id = u.id
         AND LOWER(usp.progress_status) = 'completed'
     )`,
  );
}

async function ensureCodeColumns(connection) {
  if (await tableExists(connection, "users")) {
    if (!(await columnExists(connection, "users", "code"))) {
      await connection.query("ALTER TABLE users ADD COLUMN code VARCHAR(50) NULL AFTER id");
      try {
        await connection.query("ALTER TABLE users ADD UNIQUE KEY uk_users_code (code)");
      } catch (_) {}
    }
    const [usersWithoutCode] = await connection.query("SELECT id FROM users WHERE code IS NULL OR code = ''");
    for (const u of usersWithoutCode) {
      const code = `USR-${String(u.id).padStart(5, '0')}`;
      await connection.query("UPDATE users SET code = ? WHERE id = ?", [code, u.id]);
    }
  }

  if (await tableExists(connection, "lessons")) {
    if (!(await columnExists(connection, "lessons", "code"))) {
      await connection.query("ALTER TABLE lessons ADD COLUMN code VARCHAR(50) NULL AFTER id");
      try {
        await connection.query("ALTER TABLE lessons ADD UNIQUE KEY uk_lessons_code (code)");
      } catch (_) {}
    }
    const [lessonsWithoutCode] = await connection.query("SELECT id FROM lessons WHERE code IS NULL OR code = ''");
    for (const l of lessonsWithoutCode) {
      const code = `BLOG-${String(l.id).padStart(5, '0')}`;
      await connection.query("UPDATE lessons SET code = ? WHERE id = ?", [code, l.id]);
    }
  }
}

async function ensureProductionIndexes(connection) {
  const indexConfigs = [
    { table: 'lessons', index: 'idx_lessons_topic_id', sql: 'ALTER TABLE lessons ADD INDEX idx_lessons_topic_id (topic_id)' },
    { table: 'steps', index: 'idx_steps_lesson_id', sql: 'ALTER TABLE steps ADD INDEX idx_steps_lesson_id (lesson_id)' },
    { table: 'content_blocks', index: 'idx_blocks_step_id', sql: 'ALTER TABLE content_blocks ADD INDEX idx_blocks_step_id (step_id)' },
    { table: 'quiz_questions', index: 'idx_quizzes_step_id', sql: 'ALTER TABLE quiz_questions ADD INDEX idx_quizzes_step_id (step_id)' },
    { table: 'user_step_progress', index: 'idx_usp_user_id', sql: 'ALTER TABLE user_step_progress ADD INDEX idx_usp_user_id (user_id)' },
    { table: 'plan_requests', index: 'idx_plan_requests_status', sql: 'ALTER TABLE plan_requests ADD INDEX idx_plan_requests_status (status)' },
  ];

  for (const cfg of indexConfigs) {
    if (await tableExists(connection, cfg.table)) {
      if (!(await indexExists(connection, cfg.table, cfg.index))) {
        try {
          await connection.query(cfg.sql);
        } catch (_) {}
      }
    }
  }
}

async function initDatabaseSchema() {
  try {
    const connection = await pool.getConnection();

    const createTableQueries = [
      // 1. Roles
      `CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255),
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 2. Users
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        user_name VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        role_id INT DEFAULT 2,
        active TINYINT(1) DEFAULT 1,
        plan VARCHAR(20) DEFAULT 'FREE',
        status INT DEFAULT 1,
        streak_days INT DEFAULT 0,
        completed_steps_count INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 3. Categories
      `CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 4. Tags
      `CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        description TEXT,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 5. Topics
      `CREATE TABLE IF NOT EXISTS topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        emoji VARCHAR(10) DEFAULT '📘',
        level_label VARCHAR(50) DEFAULT 'Beginner',
        estimated_hours INT DEFAULT 4,
        access_level VARCHAR(20) DEFAULT 'FREE',
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 6. Topic Categories
      `CREATE TABLE IF NOT EXISTS topic_categories (
        topic_id INT NOT NULL,
        category_id INT NOT NULL,
        PRIMARY KEY (topic_id, category_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 7. Topic Tags
      `CREATE TABLE IF NOT EXISTS topic_tags (
        topic_id INT NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (topic_id, tag_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 8. Lessons
      `CREATE TABLE IF NOT EXISTS lessons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NULL UNIQUE,
        topic_id INT NOT NULL,
        title VARCHAR(150) NOT NULL,
        summary TEXT,
        order_index INT DEFAULT 0,
        access_level VARCHAR(20) DEFAULT 'FREE',
        estimated_minutes INT DEFAULT 15,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 9. Steps
      `CREATE TABLE IF NOT EXISTS steps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lesson_id INT NOT NULL,
        title VARCHAR(150) NOT NULL,
        summary TEXT,
        order_index INT DEFAULT 0,
        access_level VARCHAR(20) DEFAULT 'FREE',
        note TEXT,
        theory TEXT,
        code_snippet TEXT,
        code_language VARCHAR(30) DEFAULT 'javascript',
        checklist_json JSON,
        pass_threshold INT DEFAULT 80,
        estimated_minutes INT DEFAULT 10,
        xp_reward INT DEFAULT 20,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 10. Step Prerequisites
      `CREATE TABLE IF NOT EXISTS step_prerequisites (
        step_id INT NOT NULL,
        prerequisite_step_id INT NOT NULL,
        PRIMARY KEY (step_id, prerequisite_step_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 11. Content Blocks
      `CREATE TABLE IF NOT EXISTS content_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        step_id INT NOT NULL,
        block_type VARCHAR(30) NOT NULL DEFAULT 'PARAGRAPH',
        title VARCHAR(150),
        body TEXT,
        items_json JSON,
        media_url VARCHAR(255),
        caption VARCHAR(255),
        code_language VARCHAR(30),
        order_index INT DEFAULT 0,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 12. Quiz Questions
      `CREATE TABLE IF NOT EXISTS quiz_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        step_id INT NOT NULL,
        prompt TEXT NOT NULL,
        options_json JSON NOT NULL,
        correct_index INT NOT NULL DEFAULT 0,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 13. User Step Progress
      `CREATE TABLE IF NOT EXISTS user_step_progress (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        step_id INT NOT NULL,
        progress_status VARCHAR(30) DEFAULT 'NOT_STARTED',
        completed_checklist_json LONGTEXT,
        quiz_score INT DEFAULT 0,
        last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY user_step_unique (user_id, step_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 14. Learning Groups
      `CREATE TABLE IF NOT EXISTS learning_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        expired_at DATETIME NULL,
        status INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 15. Group Members
      `CREATE TABLE IF NOT EXISTS group_members (
        group_id INT NOT NULL,
        user_id INT NOT NULL,
        PRIMARY KEY (group_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 16. Group Topics
      `CREATE TABLE IF NOT EXISTS group_topics (
        group_id INT NOT NULL,
        topic_id INT NOT NULL,
        PRIMARY KEY (group_id, topic_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

      // 17. Plan Requests
      `CREATE TABLE IF NOT EXISTS plan_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'PENDING',
        admin_note TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
    ];

    for (const query of createTableQueries) {
      try {
        await connection.query(query);
      } catch (e) {
        console.warn("Notice creating table:", e.message);
      }
    }

    await ensureCoreSchemaCompatibility(connection);
    await ensureUserStepProgressSchema(connection);
    await ensureCodeColumns(connection);
    await ensureProductionIndexes(connection);

    // NOTE: Auto-seed data (demo accounts, content, Canva topics) has been
    // intentionally removed. Use cleanup_db.js or admin tools to seed data
    // manually when needed. This avoids unwanted data insertion in production.

    await syncCompletedStepCounts(connection);
    connection.release();
    console.log("[SeedService] Database schema verified and ready.");
  } catch (err) {
    console.error("[SeedService] Error initializing database schema:", err);
  }
}

module.exports = {
  initDatabaseSchema,
};

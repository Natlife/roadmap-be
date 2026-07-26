const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/env');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SHOW COLUMNS FROM ${tableName} LIKE ?`,
    [columnName]
  );
  return rows.length > 0;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SHOW TABLES LIKE ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
    [indexName]
  );
  return rows.length > 0;
}

async function tableRowCount(connection, tableName) {
  if (!(await tableExists(connection, tableName))) {
    return 0;
  }

  const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${tableName}`);
  return Number(rows[0]?.total || 0);
}

function getSpringSeedFilePath() {
  const candidates = [
    path.resolve(__dirname, '../../../seed_data.sql'),
    path.resolve(__dirname, '../../../spb-code-base/src/main/resources/seed_data.sql'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function extractInsertStatement(sqlContent, tableName) {
  const escapedTableName = tableName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const startPattern = new RegExp(`INSERT\\s+INTO\\s+\`${escapedTableName}\``, 'i');
  const startMatch = startPattern.exec(sqlContent);

  if (!startMatch || startMatch.index == null) {
    return null;
  }

  const startIndex = startMatch.index;
  let inSingleQuote = false;
  let inBacktick = false;
  let escaped = false;

  for (let index = startIndex; index < sqlContent.length; index += 1) {
    const char = sqlContent[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '\'' && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '`' && !inSingleQuote) {
      inBacktick = !inBacktick;
      continue;
    }

    if (char === ';' && !inSingleQuote && !inBacktick) {
      return sqlContent.slice(startIndex, index + 1);
    }
  }

  return null;
}

async function runSeedInsertIgnore(connection, sqlContent, tableName) {
  const insertStatement = extractInsertStatement(sqlContent, tableName);
  if (!insertStatement) {
    return false;
  }

  const normalizedStatement = insertStatement.replace(/^INSERT\s+INTO/i, 'INSERT IGNORE INTO');
  await connection.query(normalizedStatement);
  return true;
}

async function ensureSpringSeedContent(connection) {
  const seedFilePath = getSpringSeedFilePath();
  if (!seedFilePath) {
    return;
  }

  const counts = {
    categories: await tableRowCount(connection, 'categories'),
    tags: await tableRowCount(connection, 'tags'),
    topics: await tableRowCount(connection, 'topics'),
    topicCategories: await tableRowCount(connection, 'topic_categories'),
    topicTags: await tableRowCount(connection, 'topic_tags'),
    lessons: await tableRowCount(connection, 'lessons'),
    steps: await tableRowCount(connection, 'steps'),
    contentBlocks: await tableRowCount(connection, 'content_blocks'),
    quizQuestions: await tableRowCount(connection, 'quiz_questions'),
    learningGroups: await tableRowCount(connection, 'learning_groups'),
    groupTopics: await tableRowCount(connection, 'group_topics'),
  };

  const shouldBootstrapCoreContent =
    counts.topics === 0 && counts.lessons === 0 && counts.steps === 0;
  const shouldBackfillSteps =
    counts.lessons > 0 &&
    (counts.steps === 0 || counts.contentBlocks === 0 || counts.quizQuestions === 0);

  const shouldBackfillTaxonomyRelations =
    counts.topics > 0 && (counts.topicCategories === 0 || counts.topicTags === 0);

  const shouldBackfillGroups =
    counts.learningGroups === 0 && counts.groupTopics === 0;

  if (
    !shouldBootstrapCoreContent &&
    !shouldBackfillSteps &&
    !shouldBackfillTaxonomyRelations &&
    !shouldBackfillGroups &&
    counts.categories > 0 &&
    counts.tags > 0
  ) {
    return;
  }

  const sqlContent = fs.readFileSync(seedFilePath, 'utf8');
  const tablesToBackfill = [];

  if (counts.categories === 0) {
    tablesToBackfill.push('categories');
  }
  if (counts.tags === 0) {
    tablesToBackfill.push('tags');
  }

  if (shouldBootstrapCoreContent) {
    tablesToBackfill.push(
      'topics',
      'topic_categories',
      'topic_tags',
      'lessons',
      'steps',
      'content_blocks',
      'quiz_questions'
    );
  } else {
    if (counts.topics === 0) {
      tablesToBackfill.push('topics');
    }
    if (counts.lessons === 0) {
      tablesToBackfill.push('lessons');
    }
    if (counts.steps === 0) {
      tablesToBackfill.push('steps');
    }
    if (counts.contentBlocks === 0) {
      tablesToBackfill.push('content_blocks');
    }
    if (counts.quizQuestions === 0) {
      tablesToBackfill.push('quiz_questions');
    }
    if (counts.topicCategories === 0) {
      tablesToBackfill.push('topic_categories');
    }
    if (counts.topicTags === 0) {
      tablesToBackfill.push('topic_tags');
    }
  }

  if (shouldBackfillGroups) {
    tablesToBackfill.push('learning_groups', 'group_topics');
  }

  const uniqueTables = Array.from(new Set(tablesToBackfill));
  if (uniqueTables.length === 0) {
    return;
  }

  for (const tableName of uniqueTables) {
    const executed = await runSeedInsertIgnore(connection, sqlContent, tableName);
    if (executed) {
      console.log(`[SeedService] Backfilled ${tableName} from Spring seed data`);
    }
  }
}

async function ensureUserStepProgressSchema(connection) {
  const alterations = [];

  if (!(await columnExists(connection, 'user_step_progress', 'completed_checklist_json'))) {
    alterations.push(`ADD COLUMN completed_checklist_json LONGTEXT NULL AFTER progress_status`);
  }
  if (!(await columnExists(connection, 'user_step_progress', 'quiz_score'))) {
    alterations.push(`ADD COLUMN quiz_score INT NOT NULL DEFAULT 0 AFTER completed_checklist_json`);
  }
  if (!(await columnExists(connection, 'user_step_progress', 'last_accessed_at'))) {
    alterations.push(`ADD COLUMN last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER quiz_score`);
  }
  if (!(await columnExists(connection, 'user_step_progress', 'status'))) {
    alterations.push(`ADD COLUMN status INT DEFAULT 1 AFTER last_accessed_at`);
  }
  if (!(await columnExists(connection, 'user_step_progress', 'created_at'))) {
    alterations.push(`ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER status`);
  }
  if (!(await columnExists(connection, 'user_step_progress', 'updated_at'))) {
    alterations.push(
      `ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`
    );
  }

  if (alterations.length > 0) {
    await connection.query(`ALTER TABLE user_step_progress ${alterations.join(', ')}`);
  }

  if (await columnExists(connection, 'user_step_progress', 'score')) {
    await connection.query(
      `UPDATE user_step_progress
       SET quiz_score = CASE
         WHEN (quiz_score IS NULL OR quiz_score = 0) AND score IS NOT NULL THEN score
         ELSE quiz_score
       END`
    );
  }

  if (!(await indexExists(connection, 'user_step_progress', 'user_step_unique'))) {
    await connection.query(
      `ALTER TABLE user_step_progress ADD UNIQUE KEY user_step_unique (user_id, step_id)`
    );
  }
}

async function ensureCoreSchemaCompatibility(connection) {
  const hasSteps = await tableExists(connection, 'steps');
  const hasLegacyStepItems = await tableExists(connection, 'step_items');

  if (!hasSteps && hasLegacyStepItems) {
    await connection.query('RENAME TABLE step_items TO steps');
  }

  if (await tableExists(connection, 'content_blocks')) {
    const hasBlockType = await columnExists(connection, 'content_blocks', 'block_type');
    const hasLegacyType = await columnExists(connection, 'content_blocks', 'type');

    if (!hasBlockType) {
      await connection.query(
        `ALTER TABLE content_blocks
         ADD COLUMN block_type VARCHAR(30) NOT NULL DEFAULT 'PARAGRAPH' AFTER step_id`
      );
    }

    if (hasLegacyType) {
      await connection.query(
        `UPDATE content_blocks
         SET block_type = UPPER(COALESCE(NULLIF(block_type, ''), type, 'PARAGRAPH'))`
      );
    }
  }

  if (await tableExists(connection, 'learning_groups') &&
      !(await columnExists(connection, 'learning_groups', 'expired_at'))) {
    await connection.query(
      `ALTER TABLE learning_groups
       ADD COLUMN expired_at DATETIME NULL AFTER description`
    );
  }

  if (await tableExists(connection, 'roles')) {
    await connection.query(
      `UPDATE roles
       SET name = CASE
         WHEN UPPER(name) = 'ADMIN' THEN 'ROLE_ADMIN'
         WHEN UPPER(name) = 'USER' THEN 'ROLE_USER'
         ELSE name
       END`
    );
  }

  if (await tableExists(connection, 'users') && await columnExists(connection, 'users', 'plan')) {
    await connection.query(
      `UPDATE users
       SET plan = CASE
         WHEN UPPER(plan) = 'GROUPPRO' THEN 'GROUP'
         ELSE UPPER(COALESCE(plan, 'FREE'))
       END`
    );
  }

  for (const tableName of ['topics', 'lessons', 'steps']) {
    if (await tableExists(connection, tableName) && await columnExists(connection, tableName, 'access_level')) {
      await connection.query(
        `UPDATE ${tableName}
         SET access_level = UPPER(COALESCE(access_level, 'FREE'))`
      );
    }
  }

  if (await tableExists(connection, 'user_step_progress') &&
      await columnExists(connection, 'user_step_progress', 'progress_status')) {
    await connection.query(
      `UPDATE user_step_progress
       SET progress_status = CASE
         WHEN LOWER(progress_status) = 'completed' THEN 'COMPLETED'
         WHEN LOWER(progress_status) = 'in_progress' THEN 'IN_PROGRESS'
         WHEN LOWER(progress_status) = 'not_started' THEN 'NOT_STARTED'
         WHEN LOWER(progress_status) = 'locked' THEN 'NOT_STARTED'
         ELSE UPPER(COALESCE(progress_status, 'NOT_STARTED'))
       END`
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
     )`
  );
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
    ];

    for (const query of createTableQueries) {
      try {
        await connection.query(query);
      } catch (e) {
        console.warn('Notice creating table:', e.message);
      }
    }

    await ensureCoreSchemaCompatibility(connection);
    await ensureUserStepProgressSchema(connection);
    await ensureSpringSeedContent(connection);

    // Seed roles
    await connection.query(
      `INSERT INTO roles (id, name, description, status)
       VALUES (1, 'ROLE_ADMIN', 'System Administrator', 1), (2, 'ROLE_USER', 'Standard Learning Student', 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = VALUES(status)`
    );

    // Seed built-in admin/user accounts (can be disabled once real accounts
    // exist — set ENABLE_DEMO_ACCOUNTS=false). Password is configurable via
    // ADMIN_SEED_PASSWORD so production never ships with a well-known secret.
    if (config.seed.enableDemoAccounts) {
      const passwordHash = await bcrypt.hash(config.seed.adminPassword, 10);
      await connection.query(
        `INSERT INTO users (id, email, user_name, password, full_name, role_id, plan, active, status, streak_days, completed_steps_count) VALUES (1, 'admin@email.com', 'admin', ?, 'System Administrator', 1, 'GROUP', 1, 1, 0, 0)
         ON DUPLICATE KEY UPDATE password = ?, role_id = 1`,
        [passwordHash, passwordHash]
      );

      await connection.query(
        `INSERT INTO users (id, email, user_name, password, full_name, role_id, plan, active, status, streak_days, completed_steps_count) VALUES (2, 'user@email.com', 'user', ?, 'Học Viên Thử Nghiệm', 2, 'GROUP', 1, 1, 0, 0)
         ON DUPLICATE KEY UPDATE password = ?, role_id = 2`,
        [passwordHash, passwordHash]
      );
    }

    await syncCompletedStepCounts(connection);

    connection.release();
    console.log('✅ [SeedService] Database schema verified and seed data initialized successfully!');

    if (config.seed.enableCanva) {
      const { seedCanvaBasicTopic } = require('./canvaSeedService');
      await seedCanvaBasicTopic();
    }
  } catch (err) {
    console.error('❌ [SeedService] Error initializing database schema:', err);
  }
}

module.exports = {
  initDatabaseSchema,
};

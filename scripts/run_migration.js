const pool = require('../src/config/db');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function foreignKeyExists(connection, tableName, constraintName) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [tableName, constraintName]
  );
  return rows.length > 0;
}

async function runMigration() {
  const connection = await pool.getConnection();
  try {
    console.log('🚀 Starting Database Migration for Author Role & Approval System...');

    // 1. Roles: Ensure ROLE_AUTHOR exists
    console.log('1. Checking ROLE_AUTHOR in roles table...');
    await connection.query(
      `INSERT INTO roles (id, name, description, status, created_at, updated_at)
       VALUES (3, 'ROLE_AUTHOR', 'Content Creator & Author', 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE description = VALUES(description)`
    );
    console.log('   ✅ ROLE_AUTHOR configured.');

    // 2. Users: code, description
    console.log('2. Checking users table columns...');
    if (!(await columnExists(connection, 'users', 'code'))) {
      await connection.query('ALTER TABLE users ADD COLUMN code VARCHAR(50) NULL AFTER id');
      try {
        await connection.query('ALTER TABLE users ADD UNIQUE KEY uk_users_code (code)');
      } catch (_) {}
      console.log('   ✅ Added code column to users.');
    }
    if (!(await columnExists(connection, 'users', 'description'))) {
      await connection.query('ALTER TABLE users ADD COLUMN description TEXT NULL AFTER full_name');
      console.log('   ✅ Added description column to users.');
    } else {
      console.log('   ℹ️ Column users.description already exists.');
    }


    // 3. Topics: code, author_id, approval_status, rejection_reason
    console.log('3. Checking topics table columns...');
    if (!(await columnExists(connection, 'topics', 'code'))) {
      await connection.query('ALTER TABLE topics ADD COLUMN code VARCHAR(50) NULL AFTER id');
      console.log('   ✅ Added code to topics.');
    }
    if (!(await columnExists(connection, 'topics', 'author_id'))) {
      await connection.query('ALTER TABLE topics ADD COLUMN author_id INT NULL AFTER code');
      console.log('   ✅ Added author_id to topics.');
    }
    if (!(await columnExists(connection, 'topics', 'approval_status'))) {
      await connection.query(
        "ALTER TABLE topics ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' AFTER access_level"
      );
      console.log('   ✅ Added approval_status to topics.');
    }
    if (!(await columnExists(connection, 'topics', 'rejection_reason'))) {
      await connection.query('ALTER TABLE topics ADD COLUMN rejection_reason TEXT NULL AFTER approval_status');
      console.log('   ✅ Added rejection_reason to topics.');
    }

    if (!(await foreignKeyExists(connection, 'topics', 'fk_topics_author'))) {
      await connection.query(
        'ALTER TABLE topics ADD CONSTRAINT fk_topics_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL'
      );
      console.log('   ✅ Added fk_topics_author foreign key.');
    }

    if (!(await indexExists(connection, 'topics', 'uk_topics_code'))) {
      try {
        await connection.query('ALTER TABLE topics ADD UNIQUE KEY uk_topics_code (code)');
        console.log('   ✅ Added uk_topics_code unique index.');
      } catch (_) {}
    }

    // 4. Lessons: author_id
    console.log('4. Checking lessons table columns...');
    if (!(await columnExists(connection, 'lessons', 'author_id'))) {
      await connection.query('ALTER TABLE lessons ADD COLUMN author_id INT NULL AFTER topic_id');
      console.log('   ✅ Added author_id to lessons.');
    }
    if (!(await foreignKeyExists(connection, 'lessons', 'fk_lessons_author'))) {
      await connection.query(
        'ALTER TABLE lessons ADD CONSTRAINT fk_lessons_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL'
      );
      console.log('   ✅ Added fk_lessons_author foreign key.');
    }

    // 5. Steps: code, author_id, approval_status, rejection_reason
    console.log('5. Checking steps table columns...');
    if (!(await columnExists(connection, 'steps', 'code'))) {
      await connection.query('ALTER TABLE steps ADD COLUMN code VARCHAR(50) NULL AFTER id');
      console.log('   ✅ Added code to steps.');
    }
    if (!(await columnExists(connection, 'steps', 'author_id'))) {
      await connection.query('ALTER TABLE steps ADD COLUMN author_id INT NULL AFTER lesson_id');
      console.log('   ✅ Added author_id to steps.');
    }
    if (!(await columnExists(connection, 'steps', 'approval_status'))) {
      await connection.query(
        "ALTER TABLE steps ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' AFTER xp_reward"
      );
      console.log('   ✅ Added approval_status to steps.');
    }
    if (!(await columnExists(connection, 'steps', 'rejection_reason'))) {
      await connection.query('ALTER TABLE steps ADD COLUMN rejection_reason TEXT NULL AFTER approval_status');
      console.log('   ✅ Added rejection_reason to steps.');
    }

    if (!(await foreignKeyExists(connection, 'steps', 'fk_steps_author'))) {
      await connection.query(
        'ALTER TABLE steps ADD CONSTRAINT fk_steps_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL'
      );
      console.log('   ✅ Added fk_steps_author foreign key.');
    }

    if (!(await indexExists(connection, 'steps', 'uk_steps_code'))) {
      try {
        await connection.query('ALTER TABLE steps ADD UNIQUE KEY uk_steps_code (code)');
        console.log('   ✅ Added uk_steps_code unique index.');
      } catch (_) {}
    }

    // 6. Indexes for Explore & Search
    console.log('6. Checking search indexes...');
    const indexes = [
      { table: 'users', index: 'idx_users_role_username', sql: 'CREATE INDEX idx_users_role_username ON users (role_id, user_name)' },
      { table: 'topics', index: 'idx_topics_author_approval', sql: 'CREATE INDEX idx_topics_author_approval ON topics (author_id, approval_status)' },
      { table: 'steps', index: 'idx_steps_author_approval', sql: 'CREATE INDEX idx_steps_author_approval ON steps (author_id, approval_status)' },
      { table: 'topics', index: 'idx_topics_code', sql: 'CREATE INDEX idx_topics_code ON topics (code)' },
      { table: 'steps', index: 'idx_steps_code', sql: 'CREATE INDEX idx_steps_code ON steps (code)' },
    ];

    for (const item of indexes) {
      if (!(await indexExists(connection, item.table, item.index))) {
        try {
          await connection.query(item.sql);
          console.log(`   ✅ Created index ${item.index} on ${item.table}.`);
        } catch (e) {
          console.log(`   ⚠️ Could not create index ${item.index}: ${e.message}`);
        }
      }
    }

    // 7. Auto-populate missing codes
    console.log('7. Populating missing codes for users, topics, and steps...');
    await connection.query("UPDATE users SET code = CONCAT('USR-', LPAD(id, 5, '0')) WHERE code IS NULL OR code = ''");
    await connection.query("UPDATE topics SET code = CONCAT('BLOG-', LPAD(id, 5, '0')) WHERE code IS NULL OR code = ''");
    await connection.query("UPDATE steps SET code = CONCAT('STEP-', LPAD(id, 5, '0')) WHERE code IS NULL OR code = ''");
    console.log('   ✅ Populated codes.');


    console.log('🎉 DATABASE MIGRATION COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    connection.release();
    process.exit();
  }
}

runMigration();

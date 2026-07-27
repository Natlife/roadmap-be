const pool = require('./src/config/db');

async function cleanDuplicatesAndAddConstraints() {
  const connection = await pool.getConnection();
  try {
    console.log('🔍 Checking and cleaning duplicate categories, tags, and topics...');

    // 1. DEDUPLICATE CATEGORIES
    const [dupCatRows] = await connection.query(`
      SELECT LOWER(TRIM(title)) as norm_title, COUNT(*) as count, GROUP_CONCAT(id ORDER BY id ASC) as ids
      FROM categories
      GROUP BY norm_title
      HAVING count > 1
    `);

    console.log(`📌 Found ${dupCatRows.length} duplicate category group(s).`);

    for (const row of dupCatRows) {
      const ids = row.ids.split(',').map(Number);
      const keepId = ids[0];
      const deleteIds = ids.slice(1);

      console.log(`  -> Category "${row.norm_title}": Keeping ID ${keepId}, deleting IDs [${deleteIds.join(', ')}]`);

      for (const delId of deleteIds) {
        await connection.query(
          `UPDATE IGNORE topic_categories SET category_id = ? WHERE category_id = ?`,
          [keepId, delId]
        );
        await connection.query(
          `DELETE FROM topic_categories WHERE category_id = ?`,
          [delId]
        );
        await connection.query(`DELETE FROM categories WHERE id = ?`, [delId]);
      }
    }

    // 2. DEDUPLICATE TAGS
    const [dupTagRows] = await connection.query(`
      SELECT LOWER(TRIM(title)) as norm_title, COUNT(*) as count, GROUP_CONCAT(id ORDER BY id ASC) as ids
      FROM tags
      GROUP BY norm_title
      HAVING count > 1
    `);

    console.log(`📌 Found ${dupTagRows.length} duplicate tag group(s).`);

    for (const row of dupTagRows) {
      const ids = row.ids.split(',').map(Number);
      const keepId = ids[0];
      const deleteIds = ids.slice(1);

      console.log(`  -> Tag "${row.norm_title}": Keeping ID ${keepId}, deleting IDs [${deleteIds.join(', ')}]`);

      for (const delId of deleteIds) {
        await connection.query(
          `UPDATE IGNORE topic_tags SET tag_id = ? WHERE tag_id = ?`,
          [keepId, delId]
        );
        await connection.query(`DELETE FROM topic_tags WHERE tag_id = ?`, [delId]);
        await connection.query(`DELETE FROM tags WHERE id = ?`, [delId]);
      }
    }

    // 3. DEDUPLICATE TOPICS
    const [dupTopicRows] = await connection.query(`
      SELECT LOWER(TRIM(title)) as norm_title, COUNT(*) as count, GROUP_CONCAT(id ORDER BY id ASC) as ids
      FROM topics
      GROUP BY norm_title
      HAVING count > 1
    `);

    console.log(`📌 Found ${dupTopicRows.length} duplicate topic group(s).`);

    for (const row of dupTopicRows) {
      const ids = row.ids.split(',').map(Number);
      const keepId = ids[0];
      const deleteIds = ids.slice(1);

      console.log(`  -> Topic "${row.norm_title}": Keeping ID ${keepId}, deleting IDs [${deleteIds.join(', ')}]`);

      for (const delId of deleteIds) {
        await connection.query(
          `UPDATE IGNORE topic_categories SET topic_id = ? WHERE topic_id = ?`,
          [keepId, delId]
        );
        await connection.query(`DELETE FROM topic_categories WHERE topic_id = ?`, [delId]);

        await connection.query(
          `UPDATE IGNORE topic_tags SET topic_id = ? WHERE topic_id = ?`,
          [keepId, delId]
        );
        await connection.query(`DELETE FROM topic_tags WHERE topic_id = ?`, [delId]);

        await connection.query(
          `UPDATE IGNORE group_topics SET topic_id = ? WHERE topic_id = ?`,
          [keepId, delId]
        );
        await connection.query(`DELETE FROM group_topics WHERE topic_id = ?`, [delId]);

        await connection.query(`UPDATE lessons SET topic_id = ? WHERE topic_id = ?`, [
          keepId,
          delId,
        ]);

        await connection.query(`DELETE FROM topics WHERE id = ?`, [delId]);
      }
    }

    // 4. ADD UNIQUE CONSTRAINTS
    console.log('🔒 Adding UNIQUE constraints to prevent future duplicates...');
    try {
      await connection.query('ALTER TABLE categories ADD CONSTRAINT unique_category_title UNIQUE (title)');
      console.log('  ✅ Added UNIQUE constraint on categories(title)');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME' || e.message.includes('already exists')) {
        console.log('  ℹ️ UNIQUE constraint on categories(title) already exists.');
      } else {
        console.warn('  ⚠️ Notice categories constraint:', e.message);
      }
    }

    try {
      await connection.query('ALTER TABLE tags ADD CONSTRAINT unique_tag_title UNIQUE (title)');
      console.log('  ✅ Added UNIQUE constraint on tags(title)');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME' || e.message.includes('already exists')) {
        console.log('  ℹ️ UNIQUE constraint on tags(title) already exists.');
      } else {
        console.warn('  ⚠️ Notice tags constraint:', e.message);
      }
    }

    try {
      await connection.query('ALTER TABLE topics ADD CONSTRAINT unique_topic_title UNIQUE (title)');
      console.log('  ✅ Added UNIQUE constraint on topics(title)');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME' || e.message.includes('already exists')) {
        console.log('  ℹ️ UNIQUE constraint on topics(title) already exists.');
      } else {
        console.warn('  ⚠️ Notice topics constraint:', e.message);
      }
    }

    // Print summary counts
    const [catCount] = await connection.query('SELECT COUNT(*) AS total FROM categories');
    const [tagCount] = await connection.query('SELECT COUNT(*) AS total FROM tags');
    const [topCount] = await connection.query('SELECT COUNT(*) AS total FROM topics');
    console.log(`📊 Current total categories: ${catCount[0].total}`);
    console.log(`📊 Current total tags: ${tagCount[0].total}`);
    console.log(`📊 Current total topics: ${topCount[0].total}`);

    console.log('🎉 Cleanup and constraints completed successfully!');
  } catch (err) {
    console.error('❌ Error during script execution:', err);
  } finally {
    connection.release();
    process.exit(0);
  }
}

cleanDuplicatesAndAddConstraints();

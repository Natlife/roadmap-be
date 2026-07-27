const pool = require('./src/config/db');

async function fixBlockType() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Updating content_blocks.block_type column definition...');
    await connection.query(
      `ALTER TABLE content_blocks MODIFY block_type VARCHAR(50) NOT NULL DEFAULT 'PARAGRAPH'`
    );
    console.log('✅ Successfully updated block_type to VARCHAR(50)!');
  } catch (err) {
    console.error('❌ Error updating block_type:', err);
  } finally {
    connection.release();
    process.exit(0);
  }
}

fixBlockType();

-- ============================================================================
-- Dedup categories & tags by (case-insensitive, trimmed) title.
-- Keeps the SMALLEST id per title as canonical, re-points topic links to it,
-- then deletes the duplicate rows. Safe to re-run.
--
-- BACK UP FIRST:  mysqldump <db> categories tags topic_categories topic_tags > backup.sql
-- Then run against your DB. Wrapped in a transaction so it's all-or-nothing.
-- ============================================================================

-- ---- 0. PREVIEW duplicates (run this first to see what will be merged) -----
-- SELECT LOWER(TRIM(title)) AS title_key, COUNT(*) AS copies,
--        GROUP_CONCAT(id ORDER BY id) AS ids, MIN(id) AS keep_id
--   FROM categories GROUP BY LOWER(TRIM(title)) HAVING COUNT(*) > 1;
-- SELECT LOWER(TRIM(title)) AS title_key, COUNT(*) AS copies,
--        GROUP_CONCAT(id ORDER BY id) AS ids, MIN(id) AS keep_id
--   FROM tags GROUP BY LOWER(TRIM(title)) HAVING COUNT(*) > 1;

START TRANSACTION;

-- ===================== CATEGORIES ==========================================
CREATE TEMPORARY TABLE cat_canon AS
  SELECT LOWER(TRIM(title)) AS k, MIN(id) AS keep_id
    FROM categories GROUP BY LOWER(TRIM(title));

-- re-point topic links from duplicates to the canonical id (ignore existing)
INSERT IGNORE INTO topic_categories (topic_id, category_id)
  SELECT tc.topic_id, cc.keep_id
    FROM topic_categories tc
    JOIN categories c   ON c.id = tc.category_id
    JOIN cat_canon  cc  ON cc.k = LOWER(TRIM(c.title))
   WHERE tc.category_id <> cc.keep_id;

DELETE tc FROM topic_categories tc
    JOIN categories c   ON c.id = tc.category_id
    JOIN cat_canon  cc  ON cc.k = LOWER(TRIM(c.title))
   WHERE tc.category_id <> cc.keep_id;

DELETE c FROM categories c
    JOIN cat_canon cc ON cc.k = LOWER(TRIM(c.title))
   WHERE c.id <> cc.keep_id;

DROP TEMPORARY TABLE cat_canon;

-- ===================== TAGS ================================================
CREATE TEMPORARY TABLE tag_canon AS
  SELECT LOWER(TRIM(title)) AS k, MIN(id) AS keep_id
    FROM tags GROUP BY LOWER(TRIM(title));

INSERT IGNORE INTO topic_tags (topic_id, tag_id)
  SELECT tt.topic_id, tc.keep_id
    FROM topic_tags tt
    JOIN tags      t  ON t.id = tt.tag_id
    JOIN tag_canon tc ON tc.k = LOWER(TRIM(t.title))
   WHERE tt.tag_id <> tc.keep_id;

DELETE tt FROM topic_tags tt
    JOIN tags      t  ON t.id = tt.tag_id
    JOIN tag_canon tc ON tc.k = LOWER(TRIM(t.title))
   WHERE tt.tag_id <> tc.keep_id;

DELETE t FROM tags t
    JOIN tag_canon tc ON tc.k = LOWER(TRIM(t.title))
   WHERE t.id <> tc.keep_id;

DROP TEMPORARY TABLE tag_canon;

COMMIT;

-- ---- OPTIONAL: enforce uniqueness at the DB level (defense in depth) -------
-- Run AFTER the dedup above succeeds. The default utf8mb4 collation is
-- case-insensitive, so this also blocks 'ai' vs 'AI'.
-- ALTER TABLE categories ADD UNIQUE KEY uq_categories_title (title);
-- ALTER TABLE tags       ADD UNIQUE KEY uq_tags_title (title);

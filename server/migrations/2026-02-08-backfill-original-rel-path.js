/**
 * 数据库迁移: 回填 original_rel_path
 * 
 * @description 修复通过单张上传 (uploadSinglePhoto) 添加的照片中
 *   original_rel_path 为 NULL 的问题。
 * 
 * 策略:
 *   1. 查询所有 original_rel_path IS NULL 的 photos 记录
 *   2. 根据 roll_id + filename 推导出 originals/ 目录下的可能文件名模式
 *   3. 扫描磁盘上的 originals/ 目录，匹配实际存在的文件
 *   4. 更新 DB 中的 original_rel_path
 *   5. 同时修复 is_negative_source 为 NULL 的记录 (根据 negative_rel_path 推断)
 * 
 * 可直接运行: node server/migrations/2026-02-08-backfill-original-rel-path.js
 */

const path = require('path');
const fs = require('fs');

// Ensure DB_PATH / paths can resolve before requiring db
if (!process.env.DB_PATH && require.main === module) {
  process.env.DB_PATH = path.join(__dirname, '../film.db');
}

const db = require('../db');
const { rollsDir } = require('../config/paths');

const MIGRATION_NAME = '2026-02-08-backfill-original-rel-path';

// ────────────────────────────── DB helpers ──────────────────────────────

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ────────────────────────────── Core logic ──────────────────────────────

/**
 * Try to find the original file for a photo in the originals/ directory.
 * 
 * Naming convention used by processFileForRoll / uploadSinglePhoto:
 *   {rollId}_{frameNumber}_original{ext}
 * 
 * Since originalExt could be anything (.jpg, .cr2, .rw2, .dng, .tif, ...),
 * we scan the directory and match by the `{rollId}_{frameNumber}_original` prefix.
 * 
 * Note: We use roll_id + frame_number directly instead of deriving from filename,
 * because filename may contain suffixes like `_pos` or `_neg` that would break matching.
 * 
 * @param {number} rollId - Roll ID (= folder name)
 * @param {string} frameNumber - Frame number (e.g. "01", "40")
 * @returns {string|null} - Relative path like "rolls/10/originals/10_40_original.RW2", or null
 */
function findOriginalOnDisk(rollId, frameNumber) {
  const originalsPath = path.join(rollsDir, String(rollId), 'originals');
  if (!fs.existsSync(originalsPath)) return null;

  // Canonical prefix: {rollId}_{frameNumber}_original
  const prefix = `${rollId}_${frameNumber}_original`;

  try {
    const files = fs.readdirSync(originalsPath);
    const match = files.find(f => f.startsWith(prefix));
    if (match) {
      return `rolls/${rollId}/originals/${match}`;
    }
  } catch (err) {
    // Directory read error — skip silently
  }
  return null;
}

/**
 * Run the backfill migration.
 */
async function migrate() {
  console.log(`[Migration] Running ${MIGRATION_NAME}...`);

  try {
    // ── Phase 1: Backfill original_rel_path ──────────────────────────
    const nullOriginals = await allAsync(
      `SELECT id, roll_id, frame_number, filename, negative_rel_path, full_rel_path
       FROM photos
       WHERE original_rel_path IS NULL`
    );

    console.log(`[Migration] Found ${nullOriginals.length} photos with NULL original_rel_path.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const photo of nullOriginals) {
      const fn = String(photo.frame_number).padStart(2, '0');
      const relPath = findOriginalOnDisk(photo.roll_id, fn);
      if (relPath) {
        await runAsync(
          `UPDATE photos SET original_rel_path = ? WHERE id = ?`,
          [relPath, photo.id]
        );
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`[Migration] original_rel_path backfill: ${updatedCount} updated, ${skippedCount} skipped (no file on disk).`);

    // ── Phase 2: Fix is_negative_source NULLs ────────────────────────
    // For records where is_negative_source is NULL, infer from negative_rel_path
    const fixedNegSource = await runAsync(`
      UPDATE photos
      SET is_negative_source = CASE
        WHEN negative_rel_path IS NOT NULL THEN 1
        ELSE 0
      END
      WHERE is_negative_source IS NULL
    `);

    console.log(`[Migration] is_negative_source fixed: ${fixedNegSource.changes} rows updated.`);

    console.log(`[Migration] ${MIGRATION_NAME} completed successfully.`);
    return {
      success: true,
      originalRelPath: { updated: updatedCount, skipped: skippedCount },
      isNegativeSource: { updated: fixedNegSource.changes }
    };
  } catch (e) {
    console.error(`[Migration] ${MIGRATION_NAME} failed:`, e.message);
    return { success: false, error: e.message };
  }
}

// 如果直接运行
if (require.main === module) {
  migrate().then(result => {
    console.log('Migration result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { migrate, MIGRATION_NAME };

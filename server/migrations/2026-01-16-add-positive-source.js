/**
 * 数据库迁移: 添加 positive_source 字段
 * 
 * @description 为 photos 表添加 positive_source 字段，标记正片来源
 * - 'filmlab': 通过 FilmLab 渲染生成
 * - 'external': 从外部软件导入
 * - null: 未知来源（历史数据）
 */

const db = require('../db');

const MIGRATION_NAME = '2026-01-16-add-positive-source';

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function checkColumnExists(table, column) {
  const info = await new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  return info.some(col => col.name === column);
}

async function migrate() {
  console.log(`[Migration] Running ${MIGRATION_NAME}...`);
  
  try {
    // 检查 positive_source 字段是否已存在
    const hasPositiveSource = await checkColumnExists('photos', 'positive_source');
    
    if (hasPositiveSource) {
      console.log('[Migration] positive_source column already exists, skipping.');
      return { success: true, skipped: true };
    }
    
    // 添加 positive_source 字段
    await runAsync(`
      ALTER TABLE photos 
      ADD COLUMN positive_source TEXT DEFAULT NULL
    `);
    
    console.log('[Migration] Added positive_source column to photos table.');
    
    // 可选：将现有正片标记为 'filmlab' (假设之前都是 FilmLab 生成的)
    // 如果不确定来源，可以保持 NULL
    // await runAsync(`
    //   UPDATE photos SET positive_source = 'filmlab' 
    //   WHERE positive_rel_path IS NOT NULL AND positive_source IS NULL
    // `);
    
    console.log(`[Migration] ${MIGRATION_NAME} completed successfully.`);
    return { success: true };
  } catch (e) {
    console.error(`[Migration] ${MIGRATION_NAME} failed:`, e.message);
    return { success: false, error: e.message };
  }
}

// 如果直接运行
if (require.main === module) {
  migrate().then(result => {
    console.log('Migration result:', result);
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { migrate, MIGRATION_NAME };

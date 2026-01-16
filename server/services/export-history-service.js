/**
 * 导出历史服务
 * 
 * 记录批量渲染/下载操作的历史
 */

const db = require('../db');

// ============================================================================
// 数据库表初始化
// ============================================================================

const initTable = `
CREATE TABLE IF NOT EXISTS export_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK(job_type IN ('render', 'download', 'import')),
  roll_id INTEGER,
  status TEXT NOT NULL DEFAULT 'processing',
  total_photos INTEGER NOT NULL DEFAULT 0,
  completed_photos INTEGER NOT NULL DEFAULT 0,
  failed_photos INTEGER NOT NULL DEFAULT 0,
  output_dir TEXT,
  params TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (roll_id) REFERENCES rolls(id) ON DELETE SET NULL
)`;

// 初始化表
try {
  db.exec(initTable);
  console.log('[ExportHistory] Table initialized');
} catch (e) {
  console.error('[ExportHistory] Failed to initialize table:', e);
}

// ============================================================================
// 服务函数
// ============================================================================

/**
 * 记录新任务
 * @param {Object} params
 * @param {string} params.jobId - 任务 ID
 * @param {string} params.jobType - 'render' | 'download' | 'import'
 * @param {number} params.rollId - 卷 ID
 * @param {number} params.totalPhotos - 总照片数
 * @param {string} params.outputDir - 输出目录
 * @param {Object} params.params - 任务参数（JSON）
 */
function recordJob({ jobId, jobType, rollId, totalPhotos, outputDir, params }) {
  try {
    const stmt = db.prepare(`
      INSERT INTO export_history (job_id, job_type, roll_id, total_photos, output_dir, params)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(jobId, jobType, rollId, totalPhotos, outputDir, JSON.stringify(params || {}));
    return { success: true };
  } catch (e) {
    console.error('[ExportHistory] Failed to record job:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 更新任务进度
 * @param {string} jobId - 任务 ID
 * @param {Object} update
 * @param {number} update.completed - 已完成数
 * @param {number} update.failed - 失败数
 * @param {string} update.status - 状态
 */
function updateJobProgress(jobId, { completed, failed, status }) {
  try {
    const updates = [];
    const values = [];
    
    if (completed !== undefined) {
      updates.push('completed_photos = ?');
      values.push(completed);
    }
    if (failed !== undefined) {
      updates.push('failed_photos = ?');
      values.push(failed);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
      
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        updates.push("completed_at = datetime('now', 'localtime')");
      }
    }
    
    if (updates.length === 0) return { success: true };
    
    values.push(jobId);
    const stmt = db.prepare(`UPDATE export_history SET ${updates.join(', ')} WHERE job_id = ?`);
    stmt.run(...values);
    return { success: true };
  } catch (e) {
    console.error('[ExportHistory] Failed to update job:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 标记任务完成
 * @param {string} jobId - 任务 ID
 * @param {number} completed - 完成数
 * @param {number} failed - 失败数
 */
function completeJob(jobId, completed, failed) {
  return updateJobProgress(jobId, {
    completed,
    failed,
    status: failed > 0 && completed === 0 ? 'failed' : 'completed'
  });
}

/**
 * 标记任务失败
 * @param {string} jobId - 任务 ID
 * @param {string} errorMessage - 错误信息
 */
function failJob(jobId, errorMessage) {
  try {
    const stmt = db.prepare(`
      UPDATE export_history 
      SET status = 'failed', error_message = ?, completed_at = datetime('now', 'localtime')
      WHERE job_id = ?
    `);
    stmt.run(errorMessage, jobId);
    return { success: true };
  } catch (e) {
    console.error('[ExportHistory] Failed to mark job failed:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 获取历史记录
 * @param {Object} options
 * @param {number} options.limit - 限制数量
 * @param {number} options.offset - 偏移量
 * @param {number} options.rollId - 按卷筛选
 * @param {string} options.jobType - 按类型筛选
 */
function getHistory({ limit = 50, offset = 0, rollId, jobType } = {}) {
  try {
    let sql = `
      SELECT 
        h.*,
        r.title as roll_title
      FROM export_history h
      LEFT JOIN rolls r ON h.roll_id = r.id
      WHERE 1=1
    `;
    const params = [];
    
    if (rollId) {
      sql += ' AND h.roll_id = ?';
      params.push(rollId);
    }
    if (jobType) {
      sql += ' AND h.job_type = ?';
      params.push(jobType);
    }
    
    sql += ' ORDER BY h.started_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => ({
      ...row,
      params: row.params ? JSON.parse(row.params) : null
    }));
  } catch (e) {
    console.error('[ExportHistory] Failed to get history:', e);
    return [];
  }
}

/**
 * 获取历史统计
 */
function getStats() {
  try {
    const stmt = db.prepare(`
      SELECT 
        job_type,
        COUNT(*) as total_jobs,
        SUM(completed_photos) as total_completed,
        SUM(failed_photos) as total_failed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs
      FROM export_history
      GROUP BY job_type
    `);
    return stmt.all();
  } catch (e) {
    console.error('[ExportHistory] Failed to get stats:', e);
    return [];
  }
}

/**
 * 清理旧历史（保留最近 N 条）
 * @param {number} keepCount - 保留数量
 */
function cleanupOldHistory(keepCount = 100) {
  try {
    const stmt = db.prepare(`
      DELETE FROM export_history 
      WHERE id NOT IN (
        SELECT id FROM export_history ORDER BY started_at DESC LIMIT ?
      )
    `);
    const result = stmt.run(keepCount);
    return { deleted: result.changes };
  } catch (e) {
    console.error('[ExportHistory] Failed to cleanup:', e);
    return { deleted: 0, error: e.message };
  }
}

module.exports = {
  recordJob,
  updateJobProgress,
  completeJob,
  failJob,
  getHistory,
  getStats,
  cleanupOldHistory
};

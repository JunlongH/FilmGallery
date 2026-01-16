/**
 * 导出历史 API 路由
 * 
 * @module routes/export-history
 */

const express = require('express');
const router = express.Router();
const exportHistory = require('../services/export-history-service');

/**
 * GET /api/export-history
 * 获取导出历史列表
 */
router.get('/', (req, res) => {
  try {
    const { limit, offset, rollId, jobType } = req.query;
    
    const history = exportHistory.getHistory({
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
      rollId: rollId ? parseInt(rollId) : undefined,
      jobType
    });
    
    res.json({ history });
  } catch (e) {
    console.error('[ExportHistory] Get history error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/export-history/stats
 * 获取导出统计
 */
router.get('/stats', (req, res) => {
  try {
    const stats = exportHistory.getStats();
    res.json({ stats });
  } catch (e) {
    console.error('[ExportHistory] Get stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/export-history/cleanup
 * 清理旧历史
 */
router.delete('/cleanup', (req, res) => {
  try {
    const { keepCount } = req.query;
    const result = exportHistory.cleanupOldHistory(keepCount ? parseInt(keepCount) : 100);
    res.json(result);
  } catch (e) {
    console.error('[ExportHistory] Cleanup error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

/**
 * 导出队列面板组件
 * 
 * @component ExportQueuePanel
 * @description 显示批量导出任务进度和管理界面
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// 任务状态枚举
const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
};

// 状态显示配置
const STATUS_CONFIG = {
  [JOB_STATUS.PENDING]: { label: '等待中', color: '#888', icon: '⏳' },
  [JOB_STATUS.PROCESSING]: { label: '处理中', color: '#4CAF50', icon: '⚙️' },
  [JOB_STATUS.COMPLETED]: { label: '完成', color: '#2196F3', icon: '✓' },
  [JOB_STATUS.FAILED]: { label: '失败', color: '#f44336', icon: '✗' },
  [JOB_STATUS.CANCELLED]: { label: '已取消', color: '#9E9E9E', icon: '⊘' },
  [JOB_STATUS.PAUSED]: { label: '已暂停', color: '#FF9800', icon: '⏸' },
};

/**
 * 单个任务项
 */
function ExportJobItem({ 
  job, 
  onCancel, 
  onPause, 
  onResume, 
  onRetry,
  expanded,
  onToggleExpand
}) {
  const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG[JOB_STATUS.PENDING];
  const progress = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  
  // 格式化时间
  const formatTime = (ms) => {
    if (!ms) return '--:--';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div style={{
      background: '#252525',
      borderRadius: 4,
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* 任务头部 */}
      <div 
        onClick={onToggleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          cursor: 'pointer',
          gap: 8,
        }}
      >
        {/* 状态图标 */}
        <span style={{ fontSize: 14 }}>{statusConfig.icon}</span>
        
        {/* 任务名称 */}
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: 12, 
            fontWeight: 500, 
            color: '#fff' 
          }}>
            {job.name || `任务 #${job.id}`}
          </div>
          <div style={{ 
            fontSize: 10, 
            color: '#888',
            marginTop: 2
          }}>
            {job.completed}/{job.total} 张 · {statusConfig.label}
          </div>
        </div>
        
        {/* 进度 */}
        <div style={{ 
          fontSize: 11, 
          fontWeight: 600,
          color: statusConfig.color 
        }}>
          {progress}%
        </div>
        
        {/* 展开箭头 */}
        <span style={{ 
          fontSize: 10, 
          color: '#666',
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s'
        }}>
          ▼
        </span>
      </div>
      
      {/* 进度条 */}
      <div style={{
        height: 3,
        background: '#333',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${progress}%`,
          background: statusConfig.color,
          transition: 'width 0.3s',
        }} />
      </div>
      
      {/* 展开详情 */}
      {expanded && (
        <div style={{ 
          padding: '8px 12px',
          borderTop: '1px solid #333',
          fontSize: 10,
          color: '#888'
        }}>
          {/* 详细信息 */}
          <div style={{ marginBottom: 8 }}>
            <div>开始时间: {job.startTime ? new Date(job.startTime).toLocaleTimeString() : '--'}</div>
            <div>已用时间: {formatTime(job.elapsedTime)}</div>
            <div>预计剩余: {formatTime(job.estimatedTimeRemaining)}</div>
            {job.currentPhoto && (
              <div>当前: {job.currentPhoto}</div>
            )}
            {job.error && (
              <div style={{ color: '#f44336' }}>错误: {job.error}</div>
            )}
          </div>
          
          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {job.status === JOB_STATUS.PROCESSING && (
              <button
                onClick={(e) => { e.stopPropagation(); onPause(job.id); }}
                className="iv-btn-icon"
                style={{ padding: '2px 8px', fontSize: 10 }}
              >
                暂停
              </button>
            )}
            {job.status === JOB_STATUS.PAUSED && (
              <button
                onClick={(e) => { e.stopPropagation(); onResume(job.id); }}
                className="iv-btn-icon"
                style={{ padding: '2px 8px', fontSize: 10 }}
              >
                继续
              </button>
            )}
            {(job.status === JOB_STATUS.PENDING || job.status === JOB_STATUS.PROCESSING || job.status === JOB_STATUS.PAUSED) && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(job.id); }}
                className="iv-btn-icon"
                style={{ padding: '2px 8px', fontSize: 10, color: '#f44336' }}
              >
                取消
              </button>
            )}
            {job.status === JOB_STATUS.FAILED && (
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(job.id); }}
                className="iv-btn-icon"
                style={{ padding: '2px 8px', fontSize: 10, color: '#FF9800' }}
              >
                重试
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 导出队列面板主组件
 */
export default function ExportQueuePanel({
  jobs = [],
  onCancel,
  onPause,
  onResume,
  onRetry,
  onClearCompleted,
  visible = true,
  onClose,
}) {
  const [expandedJobId, setExpandedJobId] = useState(null);
  
  // 统计
  const stats = {
    total: jobs.length,
    pending: jobs.filter(j => j.status === JOB_STATUS.PENDING).length,
    processing: jobs.filter(j => j.status === JOB_STATUS.PROCESSING).length,
    completed: jobs.filter(j => j.status === JOB_STATUS.COMPLETED).length,
    failed: jobs.filter(j => j.status === JOB_STATUS.FAILED).length,
  };
  
  // 活动任务
  const activeJobs = jobs.filter(j => 
    j.status === JOB_STATUS.PENDING || 
    j.status === JOB_STATUS.PROCESSING ||
    j.status === JOB_STATUS.PAUSED
  );
  const completedJobs = jobs.filter(j => 
    j.status === JOB_STATUS.COMPLETED ||
    j.status === JOB_STATUS.FAILED ||
    j.status === JOB_STATUS.CANCELLED
  );

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: 320,
      maxHeight: 400,
      background: '#1a1a1a',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      border: '1px solid #333',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 标题栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        borderBottom: '1px solid #333',
      }}>
        <div>
          <span style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: '#fff' 
          }}>
            导出队列
          </span>
          <span style={{ 
            fontSize: 10, 
            color: '#888',
            marginLeft: 8
          }}>
            {stats.processing > 0 && `${stats.processing} 处理中`}
            {stats.pending > 0 && ` · ${stats.pending} 等待`}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: 16,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        )}
      </div>
      
      {/* 任务列表 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 8,
      }}>
        {jobs.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#666',
            fontSize: 11,
            padding: 20,
          }}>
            暂无导出任务
          </div>
        ) : (
          <>
            {/* 活动任务 */}
            {activeJobs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ 
                  fontSize: 10, 
                  color: '#888', 
                  marginBottom: 6,
                  paddingLeft: 4
                }}>
                  进行中 ({activeJobs.length})
                </div>
                {activeJobs.map(job => (
                  <ExportJobItem
                    key={job.id}
                    job={job}
                    onCancel={onCancel}
                    onPause={onPause}
                    onResume={onResume}
                    onRetry={onRetry}
                    expanded={expandedJobId === job.id}
                    onToggleExpand={() => setExpandedJobId(
                      expandedJobId === job.id ? null : job.id
                    )}
                  />
                ))}
              </div>
            )}
            
            {/* 已完成任务 */}
            {completedJobs.length > 0 && (
              <div>
                <div style={{ 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 10, 
                  color: '#888', 
                  marginBottom: 6,
                  paddingLeft: 4
                }}>
                  <span>已完成 ({completedJobs.length})</span>
                  {onClearCompleted && (
                    <button
                      onClick={onClearCompleted}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        fontSize: 10,
                        cursor: 'pointer',
                        padding: '2px 4px',
                      }}
                    >
                      清除
                    </button>
                  )}
                </div>
                {completedJobs.slice(0, 5).map(job => (
                  <ExportJobItem
                    key={job.id}
                    job={job}
                    onCancel={onCancel}
                    onPause={onPause}
                    onResume={onResume}
                    onRetry={onRetry}
                    expanded={expandedJobId === job.id}
                    onToggleExpand={() => setExpandedJobId(
                      expandedJobId === job.id ? null : job.id
                    )}
                  />
                ))}
                {completedJobs.length > 5 && (
                  <div style={{ 
                    textAlign: 'center', 
                    fontSize: 10, 
                    color: '#666',
                    padding: 4
                  }}>
                    还有 {completedJobs.length - 5} 个任务...
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 底部状态栏 */}
      {stats.total > 0 && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid #333',
          fontSize: 10,
          color: '#666',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>
            共 {stats.total} 个任务
          </span>
          <span>
            ✓ {stats.completed} · ✗ {stats.failed}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 导出队列 Hook
 * 
 * 用于管理导出队列状态和 WebSocket 连接
 */
export function useExportQueue(apiBase = '') {
  const [jobs, setJobs] = useState([]);
  const [visible, setVisible] = useState(false);
  const wsRef = useRef(null);
  
  // 获取任务列表
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/export/jobs`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (e) {
      console.error('Failed to fetch export jobs', e);
    }
  }, [apiBase]);
  
  // 取消任务
  const cancelJob = useCallback(async (jobId) => {
    try {
      await fetch(`${apiBase}/api/export/jobs/${jobId}`, { method: 'DELETE' });
      fetchJobs();
    } catch (e) {
      console.error('Failed to cancel job', e);
    }
  }, [apiBase, fetchJobs]);
  
  // 暂停任务
  const pauseJob = useCallback(async (jobId) => {
    try {
      await fetch(`${apiBase}/api/export/jobs/${jobId}/pause`, { method: 'POST' });
      fetchJobs();
    } catch (e) {
      console.error('Failed to pause job', e);
    }
  }, [apiBase, fetchJobs]);
  
  // 恢复任务
  const resumeJob = useCallback(async (jobId) => {
    try {
      await fetch(`${apiBase}/api/export/jobs/${jobId}/resume`, { method: 'POST' });
      fetchJobs();
    } catch (e) {
      console.error('Failed to resume job', e);
    }
  }, [apiBase, fetchJobs]);
  
  // 重试任务
  const retryJob = useCallback(async (jobId) => {
    // TODO: 实现重试逻辑
    console.log('Retry job', jobId);
  }, []);
  
  // 清除已完成任务
  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => 
      j.status !== 'completed' && 
      j.status !== 'failed' && 
      j.status !== 'cancelled'
    ));
  }, []);
  
  // 创建批量导出任务
  const createBatchExport = useCallback(async (options) => {
    try {
      const res = await fetch(`${apiBase}/api/export/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (res.ok) {
        const data = await res.json();
        setVisible(true);
        fetchJobs();
        return data;
      }
    } catch (e) {
      console.error('Failed to create batch export', e);
    }
    return null;
  }, [apiBase, fetchJobs]);
  
  // 初始加载
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);
  
  return {
    jobs,
    visible,
    setVisible,
    cancelJob,
    pauseJob,
    resumeJob,
    retryJob,
    clearCompleted,
    createBatchExport,
    refresh: fetchJobs,
  };
}

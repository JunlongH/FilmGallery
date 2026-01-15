/**
 * FilmLab 导出队列服务
 * 
 * @module export-queue
 * @description 实现批量导出任务管理，支持后台处理和进度反馈
 * 
 * 功能特性：
 * - 任务队列管理（添加/取消/暂停/恢复）
 * - 并发控制 (Worker Pool)
 * - 进度追踪和事件发射
 * - 任务持久化 (可选)
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// 共享处理核心
const { processPixel, prepareLUTs } = require('../../packages/shared/filmlab-core');
const { buildExportParams, validateExportParams } = require('../../packages/shared/filmLabExport');
const { JPEG_QUALITY, EXPORT_MAX_WIDTH } = require('../../packages/shared/filmLabConstants');

// ============================================================================
// 常量定义
// ============================================================================

/** 任务状态 */
const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/** 默认配置 */
const DEFAULT_CONFIG = {
  concurrency: 2,           // 并发处理数
  retryAttempts: 2,         // 失败重试次数
  retryDelay: 1000,         // 重试延迟 (ms)
  maxQueueSize: 100,        // 最大队列长度
};

// ============================================================================
// ExportJob 类
// ============================================================================

/**
 * 导出任务类
 */
class ExportJob {
  constructor(options) {
    this.id = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.rollId = options.rollId || null;
    this.photoIds = options.photoIds || [];
    this.format = options.format || 'JPEG';
    this.quality = options.quality || JPEG_QUALITY.export;
    this.maxWidth = options.maxWidth || EXPORT_MAX_WIDTH;
    this.outputDir = options.outputDir;
    this.presetId = options.presetId || null;
    this.processingParams = options.processingParams || null;
    
    this.status = JOB_STATUS.QUEUED;
    this.progress = {
      current: 0,
      total: this.photoIds.length,
      currentPhoto: null,
      errors: [],
    };
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.results = [];
  }

  /**
   * 序列化为 JSON
   */
  toJSON() {
    return {
      id: this.id,
      rollId: this.rollId,
      photoCount: this.photoIds.length,
      format: this.format,
      quality: this.quality,
      maxWidth: this.maxWidth,
      outputDir: this.outputDir,
      status: this.status,
      progress: this.progress,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }
}

// ============================================================================
// ExportQueue 类
// ============================================================================

/**
 * 导出队列管理器
 * 
 * @extends EventEmitter
 * @fires ExportQueue#jobAdded
 * @fires ExportQueue#jobStarted
 * @fires ExportQueue#jobProgress
 * @fires ExportQueue#jobCompleted
 * @fires ExportQueue#jobFailed
 * @fires ExportQueue#jobCancelled
 */
class ExportQueue extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.jobs = new Map();
    this.queue = [];
    this.activeWorkers = 0;
    this.isProcessing = false;
    
    // 数据库访问器 (由外部注入)
    this.db = null;
  }

  /**
   * 设置数据库访问器
   * @param {Object} db - 数据库连接
   */
  setDatabase(db) {
    this.db = db;
  }

  /**
   * 添加批量导出任务
   * 
   * @param {Object} options - 任务选项
   * @param {number} [options.rollId] - 卷 ID (可选，与 photoIds 二选一)
   * @param {number[]} [options.photoIds] - 照片 ID 列表
   * @param {string} [options.format='JPEG'] - 输出格式
   * @param {number} [options.quality=95] - JPEG 质量
   * @param {number} [options.maxWidth=4000] - 最大宽度
   * @param {string} options.outputDir - 输出目录
   * @param {string} [options.presetId] - 应用的预设 ID
   * @param {Object} [options.processingParams] - 覆盖处理参数
   * @returns {Promise<ExportJob>} 创建的任务
   */
  async addJob(options) {
    // 验证必需参数
    if (!options.outputDir) {
      throw new Error('outputDir is required');
    }
    
    // 如果提供了 rollId，获取该卷的所有照片
    let photoIds = options.photoIds || [];
    if (options.rollId && this.db && photoIds.length === 0) {
      const photos = await this.db.all(
        'SELECT id FROM photos WHERE roll_id = ? ORDER BY frame_number, id',
        [options.rollId]
      );
      photoIds = photos.map(p => p.id);
    }
    
    if (photoIds.length === 0) {
      throw new Error('No photos to export');
    }
    
    // 检查队列容量
    if (this.jobs.size >= this.config.maxQueueSize) {
      throw new Error('Export queue is full');
    }
    
    // 创建任务
    const job = new ExportJob({
      ...options,
      photoIds,
    });
    
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    
    /**
     * 任务添加事件
     * @event ExportQueue#jobAdded
     * @type {ExportJob}
     */
    this.emit('jobAdded', job);
    
    // 启动处理
    this._processQueue();
    
    return job;
  }

  /**
   * 获取任务状态
   * @param {string} jobId - 任务 ID
   * @returns {ExportJob|null}
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * 获取所有任务
   * @returns {ExportJob[]}
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * 取消任务
   * @param {string} jobId - 任务 ID
   * @returns {boolean} 是否成功取消
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    if (job.status === JOB_STATUS.QUEUED) {
      job.status = JOB_STATUS.CANCELLED;
      this.queue = this.queue.filter(id => id !== jobId);
      
      /**
       * 任务取消事件
       * @event ExportQueue#jobCancelled
       * @type {ExportJob}
       */
      this.emit('jobCancelled', job);
      return true;
    }
    
    if (job.status === JOB_STATUS.PROCESSING) {
      // 标记为取消，worker 会检查此状态
      job.status = JOB_STATUS.CANCELLED;
      this.emit('jobCancelled', job);
      return true;
    }
    
    return false;
  }

  /**
   * 暂停任务
   * @param {string} jobId - 任务 ID
   */
  pauseJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === JOB_STATUS.PROCESSING) {
      job.status = JOB_STATUS.PAUSED;
      this.emit('jobPaused', job);
    }
  }

  /**
   * 恢复任务
   * @param {string} jobId - 任务 ID
   */
  resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === JOB_STATUS.PAUSED) {
      job.status = JOB_STATUS.PROCESSING;
      this.emit('jobResumed', job);
      this._processQueue();
    }
  }

  /**
   * 删除已完成/取消的任务
   * @param {string} jobId - 任务 ID
   */
  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(job.status)) {
      this.jobs.delete(jobId);
      return true;
    }
    return false;
  }

  /**
   * 清理所有已完成的任务
   */
  cleanupCompletedJobs() {
    for (const [jobId, job] of this.jobs) {
      if ([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED].includes(job.status)) {
        this.jobs.delete(jobId);
      }
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 处理队列
   * @private
   */
  async _processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeWorkers < this.config.concurrency) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);
      
      if (!job || job.status === JOB_STATUS.CANCELLED) continue;
      
      this.activeWorkers++;
      this._processJob(job).finally(() => {
        this.activeWorkers--;
        this._processQueue();
      });
    }

    this.isProcessing = false;
  }

  /**
   * 处理单个任务
   * @private
   * @param {ExportJob} job - 导出任务
   */
  async _processJob(job) {
    job.status = JOB_STATUS.PROCESSING;
    job.startedAt = new Date();
    
    /**
     * 任务开始事件
     * @event ExportQueue#jobStarted
     * @type {ExportJob}
     */
    this.emit('jobStarted', job);

    try {
      // 确保输出目录存在
      await fs.mkdir(job.outputDir, { recursive: true });

      // 逐张处理照片
      for (let i = 0; i < job.photoIds.length; i++) {
        // 检查是否被取消或暂停
        if (job.status === JOB_STATUS.CANCELLED) {
          break;
        }
        
        while (job.status === JOB_STATUS.PAUSED) {
          await this._sleep(500);
          if (job.status === JOB_STATUS.CANCELLED) break;
        }
        
        if (job.status === JOB_STATUS.CANCELLED) break;

        const photoId = job.photoIds[i];
        
        try {
          const result = await this._processPhoto(job, photoId);
          job.results.push(result);
        } catch (err) {
          job.progress.errors.push({
            photoId,
            error: err.message,
          });
          console.error(`[ExportQueue] Failed to process photo ${photoId}:`, err.message);
        }

        // 更新进度
        job.progress.current = i + 1;
        job.progress.currentPhoto = null;
        
        /**
         * 任务进度事件
         * @event ExportQueue#jobProgress
         * @type {Object}
         */
        this.emit('jobProgress', {
          jobId: job.id,
          current: job.progress.current,
          total: job.progress.total,
          errors: job.progress.errors.length,
        });
      }

      // 完成
      if (job.status !== JOB_STATUS.CANCELLED) {
        job.status = JOB_STATUS.COMPLETED;
        job.completedAt = new Date();
        
        /**
         * 任务完成事件
         * @event ExportQueue#jobCompleted
         * @type {ExportJob}
         */
        this.emit('jobCompleted', job);
      }
    } catch (err) {
      job.status = JOB_STATUS.FAILED;
      job.completedAt = new Date();
      job.progress.errors.push({ error: err.message });
      
      /**
       * 任务失败事件
       * @event ExportQueue#jobFailed
       * @type {Object}
       */
      this.emit('jobFailed', { job, error: err });
    }
  }

  /**
   * 处理单张照片
   * @private
   * @param {ExportJob} job - 导出任务
   * @param {number} photoId - 照片 ID
   * @returns {Promise<Object>} 处理结果
   */
  async _processPhoto(job, photoId) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    // 获取照片信息
    const photo = await this.db.get(
      'SELECT * FROM photos WHERE id = ?',
      [photoId]
    );
    
    if (!photo) {
      throw new Error(`Photo not found: ${photoId}`);
    }

    job.progress.currentPhoto = photo.filename || `photo_${photoId}`;
    
    // 获取处理参数
    let params;
    if (job.processingParams) {
      // 使用任务指定的参数
      params = job.processingParams;
    } else if (photo.processing_params) {
      // 使用照片保存的参数
      params = typeof photo.processing_params === 'string' 
        ? JSON.parse(photo.processing_params) 
        : photo.processing_params;
    } else {
      // 默认参数
      params = buildExportParams(null, {});
    }

    // 构建输出路径
    const baseName = path.basename(photo.filename || `photo_${photoId}`, path.extname(photo.filename || ''));
    const ext = job.format === 'TIFF' ? '.tiff' : job.format === 'PNG' ? '.png' : '.jpg';
    const outputPath = path.join(job.outputDir, `${baseName}${ext}`);

    // 执行导出
    await this._exportPhoto(photo.file_path, outputPath, params, {
      format: job.format,
      quality: job.quality,
      maxWidth: job.maxWidth,
    });

    return {
      photoId,
      filename: photo.filename,
      outputPath,
      success: true,
    };
  }

  /**
   * 执行照片导出
   * @private
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputPath - 输出文件路径
   * @param {Object} params - 处理参数
   * @param {Object} options - 导出选项
   */
  async _exportPhoto(inputPath, outputPath, params, options) {
    const { format, quality, maxWidth } = options;
    
    // 使用 sharp 加载图像
    const image = sharp(inputPath, { failOn: 'none' });
    const metadata = await image.metadata();
    
    // 计算目标尺寸
    const scale = maxWidth ? Math.min(1, maxWidth / metadata.width) : 1;
    const targetWidth = Math.round(metadata.width * scale);
    
    // 应用几何变换
    let pipeline = image;
    
    if (params.rotation) {
      pipeline = pipeline.rotate(params.rotation);
    }
    
    if (scale < 1) {
      pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });
    }
    
    // 获取像素数据进行处理
    const { data, info } = await pipeline
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // 准备 LUT
    const luts = prepareLUTs(params);
    const inversionParams = {
      inverted: params.inverted || false,
      inversionMode: params.inversionMode || 'linear',
      filmCurveEnabled: params.filmCurveEnabled || false,
      filmCurveProfile: params.filmCurveProfile || 'default',
    };
    
    // 处理像素
    const channels = info.channels;
    const output = Buffer.alloc(data.length);
    
    for (let i = 0; i < data.length; i += channels) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      
      [r, g, b] = processPixel(r, g, b, luts, inversionParams);
      
      output[i] = r;
      output[i + 1] = g;
      output[i + 2] = b;
      
      if (channels === 4) {
        output[i + 3] = data[i + 3]; // 保留 alpha
      }
    }
    
    // 应用裁剪
    let finalPipeline = sharp(output, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    });
    
    if (params.cropRect) {
      const { x, y, w, h } = params.cropRect;
      const left = Math.round(x * info.width);
      const top = Math.round(y * info.height);
      const width = Math.round(w * info.width);
      const height = Math.round(h * info.height);
      
      if (width > 0 && height > 0) {
        finalPipeline = finalPipeline.extract({ left, top, width, height });
      }
    }
    
    // 输出
    switch (format) {
      case 'TIFF':
        await finalPipeline.tiff({ compression: 'lzw' }).toFile(outputPath);
        break;
      case 'PNG':
        await finalPipeline.png({ compressionLevel: 6 }).toFile(outputPath);
        break;
      case 'JPEG':
      default:
        await finalPipeline.jpeg({ quality }).toFile(outputPath);
        break;
    }
  }

  /**
   * 延迟工具函数
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 单例导出
// ============================================================================

// 创建全局单例
const exportQueue = new ExportQueue();

module.exports = {
  exportQueue,
  ExportQueue,
  ExportJob,
  JOB_STATUS,
};

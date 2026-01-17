/**
 * RAW 文件导入向导组件
 * 
 * 功能:
 * - 支持拖拽或选择 RAW 文件
 * - 快速预览 RAW 内容
 * - 配置解码参数
 * - 批量导入到指定相册
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './RawImportWizard.css';
import {
  getRawDecoderStatus,
  getSupportedRawFormats,
  previewRawFile,
  extractRawMetadata,
  importRawFile
} from '../../api';

// 解码选项默认值
const DEFAULT_OPTIONS = {
  colorSpace: 'srgb',
  whiteBalance: 'camera',
  quality: 'high',
  halfSize: false,
  autoRotate: true,
  outputFormat: 'tiff'
};

// 色彩空间选项
const COLOR_SPACES = [
  { value: 'raw', label: 'RAW (无色彩空间)' },
  { value: 'srgb', label: 'sRGB' },
  { value: 'adobe', label: 'Adobe RGB' },
  { value: 'wide', label: 'Wide Gamut' },
  { value: 'prophoto', label: 'ProPhoto RGB' },
  { value: 'xyz', label: 'CIE XYZ' }
];

// 白平衡选项
const WHITE_BALANCE_OPTIONS = [
  { value: 'camera', label: '相机白平衡' },
  { value: 'auto', label: '自动白平衡' },
  { value: 'daylight', label: '日光' },
  { value: 'tungsten', label: '钨丝灯' },
  { value: 'fluorescent', label: '荧光灯' }
];

// 质量选项
const QUALITY_OPTIONS = [
  { value: 'preview', label: '预览 (快速)' },
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高质量' }
];

// 输出格式选项
const OUTPUT_FORMATS = [
  { value: 'tiff', label: 'TIFF (16-bit, 推荐)' },
  { value: 'ppm', label: 'PPM (无压缩)' }
];

export default function RawImportWizard({ 
  isOpen, 
  onClose, 
  rollId, 
  onImportComplete 
}) {
  // 状态
  const [step, setStep] = useState(1); // 1: 选择文件, 2: 配置选项, 3: 导入中, 4: 完成
  const [decoderStatus, setDecoderStatus] = useState(null);
  const [supportedFormats, setSupportedFormats] = useState([]);
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, file: '', percent: 0 });
  const [importResults, setImportResults] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // 初始化：检查解码器状态
  useEffect(() => {
    if (isOpen) {
      checkDecoderStatus();
      loadSupportedFormats();
    }
  }, [isOpen]);

  const checkDecoderStatus = async () => {
    try {
      const status = await getRawDecoderStatus();
      setDecoderStatus(status);
      if (!status.available) {
        setError('RAW 解码器不可用。请确保已安装 dcraw。');
      }
    } catch (err) {
      setError('无法检查 RAW 解码器状态');
      console.error('Failed to check decoder status:', err);
    }
  };

  const loadSupportedFormats = async () => {
    try {
      const result = await getSupportedRawFormats();
      if (result.success) {
        setSupportedFormats(result.formats);
      }
    } catch (err) {
      console.error('Failed to load supported formats:', err);
    }
  };

  // 文件验证
  const isValidRawFile = useCallback((file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    return supportedFormats.includes(ext) || 
           ['dng', 'cr2', 'cr3', 'arw', 'nef', 'orf', 'raf', 'rw2', 'pef', 'srw', 'raw', '3fr', 'fff', 'iiq', 'dcr', 'kdc', 'mrw', 'x3f'].includes(ext);
  }, [supportedFormats]);

  // 处理文件选择
  const handleFiles = useCallback((newFiles) => {
    const validFiles = Array.from(newFiles).filter(isValidRawFile);
    if (validFiles.length === 0) {
      setError('没有找到有效的 RAW 文件');
      return;
    }
    
    // 为每个文件添加状态
    const filesWithStatus = validFiles.map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      status: 'pending', // pending, previewing, importing, done, error
      progress: 0,
      preview: null,
      metadata: null,
      result: null,
      error: null
    }));
    
    setFiles(prev => [...prev, ...filesWithStatus]);
    setError(null);
  }, [isValidRawFile]);

  // 拖拽处理
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  };

  // 点击选择文件
  const handleClickSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    if (e.target.files?.length > 0) {
      handleFiles(e.target.files);
    }
  };

  // 移除文件
  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 预览文件
  const previewFile = async (fileItem) => {
    setPreviewLoading(true);
    setPreviewData(null);
    
    try {
      // 更新文件状态
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'previewing' } : f
      ));

      // 获取预览和元数据
      const [preview, metadata] = await Promise.all([
        previewRawFile(fileItem.file),
        extractRawMetadata(fileItem.file)
      ]);

      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'pending', preview: preview.previewPath, metadata: metadata.metadata } 
          : f
      ));

      setPreviewData({
        fileId: fileItem.id,
        fileName: fileItem.name,
        previewUrl: preview.success ? preview.previewPath : null,
        metadata: metadata.success ? metadata.metadata : null
      });
    } catch (err) {
      console.error('Preview failed:', err);
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'pending', error: err.message } : f
      ));
    } finally {
      setPreviewLoading(false);
    }
  };

  // 更新选项
  const updateOption = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  // 开始导入
  const startImport = async () => {
    if (!rollId) {
      setError('请先选择目标相册');
      return;
    }
    
    if (files.length === 0) {
      setError('请先添加 RAW 文件');
      return;
    }

    setImporting(true);
    setStep(3);
    setImportResults([]);
    
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const fileItem = files[i];
      
      setImportProgress({
        current: i + 1,
        total: files.length,
        file: fileItem.name,
        percent: 0
      });

      // 更新文件状态
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id ? { ...f, status: 'importing', progress: 0 } : f
      ));

      try {
        const result = await importRawFile(
          fileItem.file,
          rollId,
          options,
          (percent) => {
            setImportProgress(prev => ({ ...prev, percent }));
            setFiles(prev => prev.map(f => 
              f.id === fileItem.id ? { ...f, progress: percent } : f
            ));
          }
        );

        if (result.success) {
          results.push({ ...fileItem, status: 'done', result });
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'done', result } : f
          ));
        } else {
          results.push({ ...fileItem, status: 'error', error: result.error });
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'error', error: result.error } : f
          ));
        }
      } catch (err) {
        results.push({ ...fileItem, status: 'error', error: err.message });
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id ? { ...f, status: 'error', error: err.message } : f
        ));
      }
    }

    setImportResults(results);
    setImporting(false);
    setStep(4);
  };

  // 完成并关闭
  const handleComplete = () => {
    const successCount = importResults.filter(r => r.status === 'done').length;
    if (successCount > 0 && onImportComplete) {
      onImportComplete(importResults);
    }
    handleClose();
  };

  // 关闭/重置
  const handleClose = () => {
    setStep(1);
    setFiles([]);
    setOptions(DEFAULT_OPTIONS);
    setImporting(false);
    setImportProgress({ current: 0, total: 0, file: '', percent: 0 });
    setImportResults([]);
    setPreviewData(null);
    setError(null);
    onClose();
  };

  // 格式化文件大小
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="raw-import-wizard-overlay">
      <div className="raw-import-wizard">
        {/* 标题栏 */}
        <div className="raw-import-wizard-header">
          <h2>RAW 文件导入</h2>
          <button className="close-btn" onClick={handleClose}>&times;</button>
        </div>

        {/* 步骤指示器 */}
        <div className="raw-import-steps">
          <div className={`step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">选择文件</span>
          </div>
          <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">配置选项</span>
          </div>
          <div className={`step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">导入</span>
          </div>
          <div className={`step ${step >= 4 ? 'active' : ''}`}>
            <span className="step-number">4</span>
            <span className="step-label">完成</span>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="raw-import-error">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* 解码器不可用警告 */}
        {decoderStatus && !decoderStatus.available && (
          <div className="raw-import-warning">
            <h4>⚠️ RAW 解码器未安装</h4>
            <p>需要安装 dcraw 才能解码 RAW 文件。</p>
            <p>
              Windows: 下载 dcraw.exe 并添加到 PATH
              <br />
              Mac: <code>brew install dcraw</code>
              <br />
              Linux: <code>sudo apt install dcraw</code>
            </p>
          </div>
        )}

        {/* 步骤内容 */}
        <div className="raw-import-content">
          {/* 步骤 1: 选择文件 */}
          {step === 1 && (
            <div className="step-content step-1">
              {/* 拖拽区域 */}
              <div 
                ref={dropZoneRef}
                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClickSelect}
              >
                <div className="drop-zone-content">
                  <span className="drop-icon">📁</span>
                  <p>拖拽 RAW 文件到这里</p>
                  <p className="or">或</p>
                  <button className="select-btn">选择文件</button>
                  <p className="formats">
                    支持格式: {supportedFormats.length > 0 
                      ? supportedFormats.slice(0, 8).join(', ').toUpperCase() + (supportedFormats.length > 8 ? ' ...' : '')
                      : 'DNG, CR2, ARW, NEF, ORF, RAF...'
                    }
                  </p>
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  multiple 
                  accept={supportedFormats.map(f => `.${f}`).join(',')}
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
              </div>

              {/* 已选文件列表 */}
              {files.length > 0 && (
                <div className="file-list">
                  <h4>已选择 {files.length} 个文件</h4>
                  <div className="file-items">
                    {files.map(fileItem => (
                      <div key={fileItem.id} className="file-item">
                        <div className="file-info">
                          <span className="file-name">{fileItem.name}</span>
                          <span className="file-size">{formatSize(fileItem.size)}</span>
                        </div>
                        <div className="file-actions">
                          <button 
                            className="preview-btn"
                            onClick={(e) => { e.stopPropagation(); previewFile(fileItem); }}
                            disabled={previewLoading}
                          >
                            👁️
                          </button>
                          <button 
                            className="remove-btn"
                            onClick={(e) => { e.stopPropagation(); removeFile(fileItem.id); }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 预览面板 */}
              {previewLoading && (
                <div className="preview-panel loading">
                  <div className="loading-spinner"></div>
                  <p>正在生成预览...</p>
                </div>
              )}

              {previewData && !previewLoading && (
                <div className="preview-panel">
                  <h4>预览: {previewData.fileName}</h4>
                  {previewData.previewUrl && (
                    <div className="preview-image">
                      <img src={previewData.previewUrl} alt="Preview" />
                    </div>
                  )}
                  {previewData.metadata && (
                    <div className="preview-metadata">
                      <div className="metadata-item">
                        <span className="label">相机:</span>
                        <span className="value">{previewData.metadata.camera || 'N/A'}</span>
                      </div>
                      {previewData.metadata.timestamp && (
                        <div className="metadata-item">
                          <span className="label">拍摄时间:</span>
                          <span className="value">{new Date(previewData.metadata.timestamp).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 步骤 2: 配置选项 */}
          {step === 2 && (
            <div className="step-content step-2">
              <div className="options-grid">
                {/* 色彩空间 */}
                <div className="option-group">
                  <label>色彩空间</label>
                  <select 
                    value={options.colorSpace}
                    onChange={(e) => updateOption('colorSpace', e.target.value)}
                  >
                    {COLOR_SPACES.map(cs => (
                      <option key={cs.value} value={cs.value}>{cs.label}</option>
                    ))}
                  </select>
                </div>

                {/* 白平衡 */}
                <div className="option-group">
                  <label>白平衡</label>
                  <select 
                    value={options.whiteBalance}
                    onChange={(e) => updateOption('whiteBalance', e.target.value)}
                  >
                    {WHITE_BALANCE_OPTIONS.map(wb => (
                      <option key={wb.value} value={wb.value}>{wb.label}</option>
                    ))}
                  </select>
                </div>

                {/* 解码质量 */}
                <div className="option-group">
                  <label>解码质量</label>
                  <select 
                    value={options.quality}
                    onChange={(e) => updateOption('quality', e.target.value)}
                  >
                    {QUALITY_OPTIONS.map(q => (
                      <option key={q.value} value={q.value}>{q.label}</option>
                    ))}
                  </select>
                </div>

                {/* 输出格式 */}
                <div className="option-group">
                  <label>输出格式</label>
                  <select 
                    value={options.outputFormat}
                    onChange={(e) => updateOption('outputFormat', e.target.value)}
                  >
                    {OUTPUT_FORMATS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* 半尺寸选项 */}
                <div className="option-group checkbox">
                  <label>
                    <input 
                      type="checkbox"
                      checked={options.halfSize}
                      onChange={(e) => updateOption('halfSize', e.target.checked)}
                    />
                    半尺寸输出 (更快)
                  </label>
                </div>

                {/* 自动旋转 */}
                <div className="option-group checkbox">
                  <label>
                    <input 
                      type="checkbox"
                      checked={options.autoRotate}
                      onChange={(e) => updateOption('autoRotate', e.target.checked)}
                    />
                    自动旋转
                  </label>
                </div>
              </div>

              {/* 导入目标信息 */}
              <div className="import-target">
                <span className="label">导入到:</span>
                <span className="value">Roll #{rollId}</span>
              </div>

              {/* 文件列表摘要 */}
              <div className="files-summary">
                <span>将导入 {files.length} 个 RAW 文件</span>
                <span className="total-size">
                  总大小: {formatSize(files.reduce((sum, f) => sum + f.size, 0))}
                </span>
              </div>
            </div>
          )}

          {/* 步骤 3: 导入中 */}
          {step === 3 && (
            <div className="step-content step-3">
              <div className="import-progress">
                <div className="progress-header">
                  <span>正在导入 ({importProgress.current}/{importProgress.total})</span>
                  <span>{importProgress.file}</span>
                </div>
                
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar"
                    style={{ width: `${importProgress.percent}%` }}
                  ></div>
                </div>
                
                <div className="progress-percent">{importProgress.percent}%</div>
              </div>

              {/* 文件状态列表 */}
              <div className="import-file-list">
                {files.map(fileItem => (
                  <div key={fileItem.id} className={`import-file-item ${fileItem.status}`}>
                    <span className="status-icon">
                      {fileItem.status === 'pending' && '⏳'}
                      {fileItem.status === 'importing' && '⏳'}
                      {fileItem.status === 'done' && '✅'}
                      {fileItem.status === 'error' && '❌'}
                    </span>
                    <span className="file-name">{fileItem.name}</span>
                    {fileItem.status === 'importing' && (
                      <span className="file-progress">{fileItem.progress}%</span>
                    )}
                    {fileItem.status === 'error' && (
                      <span className="file-error">{fileItem.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 步骤 4: 完成 */}
          {step === 4 && (
            <div className="step-content step-4">
              <div className="import-complete">
                <span className="complete-icon">🎉</span>
                <h3>导入完成</h3>
                
                <div className="import-summary">
                  <div className="summary-item success">
                    <span className="count">{importResults.filter(r => r.status === 'done').length}</span>
                    <span className="label">成功</span>
                  </div>
                  <div className="summary-item error">
                    <span className="count">{importResults.filter(r => r.status === 'error').length}</span>
                    <span className="label">失败</span>
                  </div>
                </div>

                {/* 失败的文件列表 */}
                {importResults.filter(r => r.status === 'error').length > 0 && (
                  <div className="failed-files">
                    <h4>导入失败的文件:</h4>
                    {importResults.filter(r => r.status === 'error').map(r => (
                      <div key={r.id} className="failed-file">
                        <span className="file-name">{r.name}</span>
                        <span className="error-msg">{r.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="raw-import-footer">
          {step === 1 && (
            <>
              <button className="btn-secondary" onClick={handleClose}>取消</button>
              <button 
                className="btn-primary" 
                onClick={() => setStep(2)}
                disabled={files.length === 0 || !decoderStatus?.available}
              >
                下一步
              </button>
            </>
          )}
          
          {step === 2 && (
            <>
              <button className="btn-secondary" onClick={() => setStep(1)}>上一步</button>
              <button 
                className="btn-primary" 
                onClick={startImport}
                disabled={!rollId}
              >
                开始导入
              </button>
            </>
          )}
          
          {step === 3 && (
            <button className="btn-secondary" disabled={importing}>
              {importing ? '导入中...' : '请等待'}
            </button>
          )}
          
          {step === 4 && (
            <button className="btn-primary" onClick={handleComplete}>
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

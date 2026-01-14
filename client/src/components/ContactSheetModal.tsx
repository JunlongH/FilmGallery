import React, { useState, useEffect, useRef, useCallback } from 'react';
import { buildUploadUrl, API_BASE } from '../api';
import '../styles/FilmInventory.css';

// Style presets metadata
const STYLE_PRESETS = {
  kodak: {
    name: 'Kodak Gold',
    description: 'Classic Kodak look with warm tones',
    preview: '#d97706'
  },
  fuji: {
    name: 'Fujifilm C200',
    description: 'Green edge aesthetic',
    preview: '#22c55e'
  },
  ilford: {
    name: 'Ilford HP5',
    description: 'Black & white minimalist',
    preview: '#ffffff'
  },
  minimal: {
    name: 'Minimal',
    description: 'Clean and simple',
    preview: '#666666'
  }
};

const COLUMNS = 6; // Fixed 6 columns per row

/**
 * Generate DX code barcode pattern based on real film information
 * @param {Object} rollInfo - Roll metadata containing film_name, iso, photo_count
 * @param {number} frameIndex - Current frame index for variation
 * @returns {boolean[]} - Array of 14 booleans representing bar/no-bar
 */
function generateDXCode(rollInfo, frameIndex = 0) {
  const filmName = (rollInfo?.film_name_joined || rollInfo?.film_type || 'KODAK').toUpperCase();
  const iso = parseInt(rollInfo?.iso) || 400;
  const photoCount = rollInfo?.photo_count || 36;
  
  // Film brand/model encoding (6 bits) - hash based on film name
  const filmHash = filmName.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
  const brandBits = [];
  for (let i = 0; i < 6; i++) {
    brandBits.push(((filmHash >> i) & 1) === 1);
  }
  
  // ISO encoding (4 bits)
  const isoMap = { 25: 0, 50: 1, 100: 2, 200: 3, 400: 4, 800: 5, 1600: 6, 3200: 7 };
  const isoValues = Object.keys(isoMap).map(Number);
  const closestIso = isoValues.reduce((prev, curr) => Math.abs(curr - iso) < Math.abs(prev - iso) ? curr : prev);
  const isoCode = isoMap[closestIso] || 4;
  const isoBits = [];
  for (let i = 0; i < 4; i++) {
    isoBits.push(((isoCode >> i) & 1) === 1);
  }
  
  // Exposure count encoding (4 bits)
  const countCode = Math.floor(photoCount / 12);
  const countBits = [];
  for (let i = 0; i < 4; i++) {
    countBits.push(((countCode >> i) & 1) === 1);
  }
  
  // Combine all bits with frame-based variation
  const allBits = [...brandBits, ...isoBits, ...countBits];
  return allBits.map((bit, i) => (i >= 10 && (frameIndex + i) % 7 === 0) ? !bit : bit);
}

// Image source options for contact sheet
const IMAGE_SOURCES = {
  auto: { name: 'Auto', description: 'Use best available (positive > negative > thumb)' },
  positive: { name: 'Positive', description: 'Edited/inverted images' },
  negative: { name: 'Negative', description: 'Original scanned negatives' }
};

export default function ContactSheetModal({ isOpen, onClose, roll, photos = [] }) {
  const [selectedStyle, setSelectedStyle] = useState('kodak');
  const [imageSource, setImageSource] = useState('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '', percentage: 0 });
  const [error, setError] = useState(null);
  
  const canvasRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Helper to get image path based on selected source
  const getImagePath = useCallback((photo) => {
    switch (imageSource) {
      case 'positive':
        return photo.positive_thumb_rel_path || photo.thumb_rel_path || photo.positive_rel_path || photo.full_rel_path;
      case 'negative':
        return photo.negative_thumb_rel_path || photo.negative_rel_path || photo.thumb_rel_path;
      case 'auto':
      default:
        // Prefer positive (edited), fallback to thumb, then negative
        return photo.positive_thumb_rel_path || photo.thumb_rel_path || photo.negative_thumb_rel_path || photo.positive_rel_path || photo.full_rel_path || photo.negative_rel_path;
    }
  }, [imageSource]);

  // Calculate rows based on photo count
  const rows = Math.ceil(photos.length / COLUMNS);

  // Generate canvas preview with authentic 35mm film strip layout
  useEffect(() => {
    if (!isOpen || !canvasRef.current || photos.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // 3:2 aspect ratio for film frames (35mm standard)
    const FRAME_RATIO = 3 / 2;
    const frameWidth = 120;
    const frameHeight = Math.round(frameWidth / FRAME_RATIO);
    const frameGap = 2;
    const padding = 16;
    
    // Authentic 35mm film strip elements
    const FILM = {
      edgeTextHeight: selectedStyle !== 'minimal' ? 14 : 0,
      sprocketHeight: selectedStyle !== 'minimal' ? 10 : 0,
      rowGap: selectedStyle === 'minimal' ? 18 : 8  // minimal模式下行间距更大，防止编号被遮挡
    };
    
    // Row height: edge text + sprockets + photo + sprockets + edge text
    const rowHeight = frameHeight + (FILM.edgeTextHeight + FILM.sprocketHeight) * 2;
    const rowTotalHeight = rowHeight + FILM.rowGap;
    
    const totalWidth = 2 * padding + COLUMNS * frameWidth + (COLUMNS - 1) * frameGap;
    // Total height: rows * rowHeight + (rows-1) * rowGap
    const totalHeight = 2 * padding + rows * rowHeight + (rows - 1) * FILM.rowGap;
    
    canvas.width = totalWidth;
    canvas.height = totalHeight;

    // Style colors - unified text color
    const styleColors = {
      kodak: { bg: '#1a1a1a', text: '#fbbf24', sprocket: '#0a0a0a', filmBg: '#2a2520' },
      fuji: { bg: '#0f1e0f', text: '#22c55e', sprocket: '#050a05', filmBg: '#1a2e1a' },
      ilford: { bg: '#000000', text: '#cccccc', sprocket: '#1a1a1a', filmBg: '#1a1a1a' },
      minimal: { bg: '#000000', text: '#666666', sprocket: '#000000', filmBg: '#000000' }
    };
    
    const colors = styleColors[selectedStyle];

    // Background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    const loadedImages = [];
    let loadedCount = 0;

    const drawPhotos = () => {
      // Draw each row as a film strip
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        const rowY = padding + rowIdx * rowTotalHeight;
        const photosInRow = photos.slice(rowIdx * COLUMNS, (rowIdx + 1) * COLUMNS);
        const filmName = roll?.film_name_joined || roll?.film_type || 'FILM';
        
        if (selectedStyle !== 'minimal') {
          // Draw film strip background (slightly different for visual separation)
          ctx.fillStyle = colors.filmBg;
          ctx.fillRect(padding - 2, rowY - 1, totalWidth - 2*padding + 4, rowHeight + 2);
          
          // ===== TOP EDGE TEXT (outside sprockets) =====
          ctx.fillStyle = colors.text;
          
          // Film stock name on the left
          ctx.font = "bold 8px 'Courier New', monospace";
          ctx.textAlign = 'left';
          ctx.fillText(filmName, padding + 4, rowY + FILM.edgeTextHeight - 3);
          
          // Frame numbers+A positioned at the edge/separator area (between photos)
          ctx.font = "bold 8px 'Courier New', monospace";
          photosInRow.forEach((p, col) => {
            const num = p.frame_number || String(rowIdx * COLUMNS + col + 1).padStart(2, '0');
            const frameX = padding + col * (frameWidth + frameGap);
            
            if (col < photosInRow.length - 1) {
              const separatorX = frameX + frameWidth + frameGap / 2;
              // Frame number+A on the left of separator
              ctx.textAlign = 'right';
              ctx.fillText(`${num}A`, separatorX - 8, rowY + FILM.edgeTextHeight - 3);
              // Separator symbol
              ctx.textAlign = 'center';
              ctx.font = 'bold 7px Courier New, monospace';
              ctx.fillText('◄►', separatorX, rowY + FILM.edgeTextHeight - 3);
              ctx.font = "bold 8px 'Courier New', monospace";
            } else {
              // Last photo: put frameNum+A at the right edge
              ctx.textAlign = 'right';
              ctx.fillText(`${num}A`, frameX + frameWidth - 4, rowY + FILM.edgeTextHeight - 3);
            }
          });
          
          // ===== TOP SPROCKET HOLES =====
          const sprocketWidth = 6;
          const sprocketsPerFrame = 8;
          const sprocketSpacing = frameWidth / sprocketsPerFrame;
          
          ctx.fillStyle = colors.sprocket;
          for (let col = 0; col < photosInRow.length; col++) {
            const frameX = padding + col * (frameWidth + frameGap);
            for (let s = 0; s < sprocketsPerFrame; s++) {
              const sx = frameX + s * sprocketSpacing + (sprocketSpacing - sprocketWidth) / 2;
              // Top sprockets (below edge text)
              ctx.fillRect(sx, rowY + FILM.edgeTextHeight, sprocketWidth, FILM.sprocketHeight);
              // Bottom sprockets (above bottom edge text)
              ctx.fillRect(sx, rowY + FILM.edgeTextHeight + FILM.sprocketHeight + frameHeight, sprocketWidth, FILM.sprocketHeight);
            }
          }
          
          // ===== BOTTOM EDGE TEXT (outside sprockets) =====
          // Frame numbers (without A) centered below each photo
          ctx.fillStyle = colors.text;
          ctx.font = "bold 8px 'Courier New', monospace";
          ctx.textAlign = 'center';
          
          // DX barcode dimensions - sized to fit within frame
          const dxBarWidth = 2;
          const dxBarGap = 1.5;
          const dxBarHeight = 10;
          
          photosInRow.forEach((p, col) => {
            const num = p.frame_number || String(rowIdx * COLUMNS + col + 1).padStart(2, '0');
            const frameX = padding + col * (frameWidth + frameGap);
            ctx.fillText(num, frameX + frameWidth / 2, rowY + rowHeight - 2);
            
            // DX barcode after each frame number on bottom edge - limit to stay within frame
            ctx.globalAlpha = 0.9;
            const barcodeStartX = frameX + frameWidth / 2 + 10;
            // Only draw if barcode fits within frame boundary
            const maxBarcodeEnd = frameX + frameWidth - 2;
            const frameIdx = rowIdx * COLUMNS + col;
            const dxCode = generateDXCode(roll, frameIdx);
            for (let i = 0; i < dxCode.length && i < 14; i++) {
              const barX = barcodeStartX + i * (dxBarWidth + dxBarGap);
              if (barX + dxBarWidth <= maxBarcodeEnd && dxCode[i]) {
                ctx.fillRect(barX, rowY + rowHeight - dxBarHeight - 2, dxBarWidth, dxBarHeight);
              }
            }
            ctx.globalAlpha = 1;
          });
        }
        
        // ===== DRAW PHOTOS =====
        const photoY = rowY + FILM.edgeTextHeight + FILM.sprocketHeight;
        photosInRow.forEach((photo, col) => {
          const frameX = padding + col * (frameWidth + frameGap);
          
          if (loadedImages[rowIdx * COLUMNS + col]) {
            const img = loadedImages[rowIdx * COLUMNS + col];
            const isPortrait = img.naturalHeight > img.naturalWidth;
            
            if (isPortrait) {
              // Rotate portrait image 90° clockwise
              ctx.save();
              ctx.translate(frameX + frameWidth / 2, photoY + frameHeight / 2);
              ctx.rotate(Math.PI / 2);
              // After rotation, swap width/height for drawing
              const drawW = frameHeight;
              const drawH = frameWidth;
              ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
              ctx.restore();
            } else {
              ctx.drawImage(img, frameX, photoY, frameWidth, frameHeight);
            }
          } else {
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(frameX, photoY, frameWidth, frameHeight);
          }
          
          // Minimal style: just frame number below
          if (selectedStyle === 'minimal') {
            const num = photo.frame_number || String(rowIdx * COLUMNS + col + 1).padStart(2, '0');
            ctx.fillStyle = colors.text;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(num, frameX + frameWidth / 2, photoY + frameHeight + 12);
          }
        });
      }
    };

    // Load images based on selected source
    photos.forEach((photo, index) => {
      const imgPath = getImagePath(photo);
      if (imgPath) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          loadedImages[index] = img;
          loadedCount++;
          if (loadedCount === photos.length) drawPhotos();
        };
        img.onerror = () => {
          loadedCount++;
          if (loadedCount === photos.length) drawPhotos();
        };
        img.src = buildUploadUrl(imgPath);
      } else {
        loadedCount++;
      }
    });

    drawPhotos();

  }, [isOpen, photos, selectedStyle, imageSource, rows, roll, getImagePath]);

  // Generate contact sheet
  const handleGenerate = async () => {
    if (!roll || photos.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress({ current: 0, total: photos.length, message: 'Starting...', percentage: 0 });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_BASE}/api/rolls/${roll.id}/contact-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: selectedStyle,
          imageSource: imageSource,
          columns: COLUMNS,
          maxTotalWidth: 4800,
          maxPhotoWidth: 400,
          quality: 95
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            if (data.type === 'progress') {
              setProgress({
                current: data.current,
                total: data.total,
                message: data.message,
                percentage: data.percentage
              });
            } else if (data.type === 'complete') {
              // Convert base64 to blob and trigger download
              const byteCharacters = atob(data.image);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: 'image/jpeg' });
              
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = data.filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              setProgress({
                current: data.photoCount,
                total: data.photoCount,
                message: 'Complete! Downloaded.',
                percentage: 100
              });

              setTimeout(() => {
                setIsGenerating(false);
                onClose();
              }, 1500);
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (parseError) {
            console.error('Failed to parse progress:', parseError);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Generation cancelled');
      } else {
        setError(err.message);
      }
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fg-modal-overlay" onClick={onClose}>
      <div 
        className="fg-modal-content" 
        style={{ maxWidth: 900, width: '90%' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="fg-modal-header">
          <h3>Export Contact Sheet</h3>
          <button className="fg-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="fg-modal-body" style={{ padding: 24 }}>
          {error && (
            <div className="fg-alert fg-alert-error" style={{ marginBottom: 20 }}>
              {error}
            </div>
          )}

          {/* Info */}
          <div style={{ marginBottom: 20, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#666' }}>
              <span><strong>{photos.length}</strong> photos</span>
              <span><strong>{COLUMNS}</strong> columns × <strong>{rows}</strong> rows</span>
              <span>Max size: <strong>4000px</strong></span>
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#333' }}>
              Preview
            </label>
            <div style={{ 
              background: '#000', 
              borderRadius: 8, 
              padding: 20, 
              display: 'flex', 
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 300
            }}>
              <canvas 
                ref={canvasRef} 
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto',
                  border: '1px solid #333'
                }}
              />
            </div>
          </div>

          {/* Style selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 12, fontWeight: 600, color: '#333' }}>
              Choose Style
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setSelectedStyle(key)}
                  disabled={isGenerating}
                  style={{
                    padding: 16,
                    border: selectedStyle === key ? `3px solid ${preset.preview}` : '2px solid #ddd',
                    borderRadius: 8,
                    background: selectedStyle === key ? '#f0f9ff' : '#fff',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    opacity: isGenerating ? 0.6 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div 
                      style={{ 
                        width: 20, 
                        height: 20, 
                        borderRadius: 4, 
                        background: preset.preview,
                        border: '1px solid #ccc'
                      }}
                    />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{preset.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Image source selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 12, fontWeight: 600, color: '#333' }}>
              Image Source
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(IMAGE_SOURCES).map(([key, source]) => (
                <button
                  key={key}
                  onClick={() => setImageSource(key)}
                  disabled={isGenerating}
                  style={{
                    padding: '10px 16px',
                    border: imageSource === key ? '2px solid #0ea5e9' : '2px solid #ddd',
                    borderRadius: 8,
                    background: imageSource === key ? '#f0f9ff' : '#fff',
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: isGenerating ? 0.6 : 1
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{source.name}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{source.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {isGenerating && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: '#666' }}>{progress.message}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0ea5e9' }}>
                  {progress.percentage}%
                </span>
              </div>
              <div style={{ 
                width: '100%', 
                height: 8, 
                background: '#e5e7eb', 
                borderRadius: 4,
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${progress.percentage}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #0ea5e9, #06b6d4)',
                  transition: 'width 0.3s ease',
                  borderRadius: 4
                }} />
              </div>
            </div>
          )}
        </div>

        <div className="fg-modal-footer" style={{ padding: 20, borderTop: '1px solid #e5e7eb' }}>
          <button 
            className="fg-btn" 
            onClick={isGenerating ? handleCancel : onClose}
            style={{ marginRight: 12 }}
          >
            {isGenerating ? 'Cancel' : 'Close'}
          </button>
          <button 
            className="fg-btn fg-btn-primary" 
            onClick={handleGenerate}
            disabled={isGenerating || photos.length === 0}
            style={{
              opacity: (isGenerating || photos.length === 0) ? 0.6 : 1,
              cursor: (isGenerating || photos.length === 0) ? 'not-allowed' : 'pointer'
            }}
          >
            {isGenerating ? 'Generating...' : 'Generate & Download'}
          </button>
        </div>
      </div>
    </div>
  );
}

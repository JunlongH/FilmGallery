import React, { useState, useEffect, useRef, useCallback } from 'react';
import { buildUploadUrl, getApiBase } from '../api';
import GlassModal from './ui/GlassModal';
import { Button } from '@heroui/react';
import { Grid } from 'lucide-react';
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

  // Theme detection
  const isDark = document.documentElement.classList.contains('dark') || 
                 document.documentElement.getAttribute('data-theme') === 'dark';

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
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/rolls/${roll.id}/contact-sheet`, {
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
    } catch (err) {
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
    <GlassModal
      isOpen={isOpen}
      onClose={isGenerating ? undefined : onClose}
      size="4xl"
      title="Export Contact Sheet"
      icon={<Grid className="w-5 h-5" />}
      isDismissable={!isGenerating}
      hideCloseButton={isGenerating}
      footer={
        <div className="flex gap-3 justify-end w-full">
            <Button 
                variant="flat" 
                onPress={isGenerating ? handleCancel : onClose}
                className="font-medium"
            >
                {isGenerating ? 'Cancel' : 'Close'}
            </Button>
            <Button 
                color="primary" 
                onPress={handleGenerate}
                isDisabled={isGenerating || photos.length === 0}
                isLoading={isGenerating}
                className="font-medium"
            >
                {isGenerating ? 'Generating...' : 'Generate & Download'}
            </Button>
        </div>
      }
    >
        <div className="flex flex-col gap-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm border border-red-200 dark:border-red-900/50">
              {error}
            </div>
          )}

          {/* Info */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-wrap justify-between gap-4 text-sm text-zinc-600 dark:text-zinc-400">
              <span><strong>{photos.length}</strong> photos</span>
              <span><strong>{COLUMNS}</strong> columns × <strong>{rows}</strong> rows</span>
              <span>Max size: <strong>4000px</strong></span>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
              Preview
            </label>
            <div className="bg-zinc-950 rounded-lg p-5 flex justify-center items-center min-h-[300px] border border-zinc-800">
              <canvas 
                ref={canvasRef} 
                className="max-w-full h-auto border border-zinc-800"
              />
            </div>
          </div>

          {/* Style selector */}
          <div>
            <label className="block mb-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Choose Style
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setSelectedStyle(key)}
                  disabled={isGenerating}
                  className={`
                    p-4 rounded-lg text-left transition-all border outline-none
                    ${selectedStyle === key 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-500 ring-1 ring-blue-500' 
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div 
                      className="w-5 h-5 rounded border border-zinc-200 dark:border-zinc-700 shadow-sm"
                      style={{ background: preset.preview }}
                    />
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{preset.name}</span>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Image source selector */}
          <div>
            <label className="block mb-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Image Source
            </label>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(IMAGE_SOURCES).map(([key, source]) => (
                <button
                  key={key}
                  onClick={() => setImageSource(key)}
                  disabled={isGenerating}
                  className={`
                    px-4 py-2.5 rounded-lg text-left transition-all border outline-none
                    ${imageSource === key 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-500' 
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{source.name}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{source.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          {isGenerating && (
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{progress.message}</span>
                <span className="text-sm font-semibold text-blue-500">
                  {progress.percentage}%
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
    </GlassModal>
  );
}

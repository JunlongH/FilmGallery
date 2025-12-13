/**
 * Contact Sheet Generator - Authentic 35mm Film Strip Style
 * 
 * Layout reference (真实35mm胶片):
 * ┌────────────────────────────────────────────────────────────────┐
 * │ KODAK 400TX  20  ◄►  21  ◄►  22  ◄►  23  ◄►  24  ◄►  25       │  <- 边缘文字区 (外侧)
 * │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │  <- 齿孔区
 * │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐               │
 * │ │     │ │     │ │     │ │     │ │     │ │     │               │  <- 照片区 (3:2)
 * │ │ 20  │ │ 21  │ │ 22  │ │ 23  │ │ 24  │ │ 25  │               │
 * │ │     │ │     │ │     │ │     │ │     │ │     │               │
 * │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘               │
 * │ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ ▢ │  <- 齿孔区
 * │ 20A  KODAK 5063  21A  KODAK 5063  22A  KODAK 5063  ...        │  <- 边缘文字区 (外侧)
 * └────────────────────────────────────────────────────────────────┘
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Load style templates
const STYLES = require('../assets/contact-sheet-styles.json');

// Configuration constants
const DEFAULT_COLUMNS = 6;
const DEFAULT_MAX_TOTAL_WIDTH = 4800;
const DEFAULT_MAX_PHOTO_WIDTH = 400;
const DEFAULT_STYLE = 'kodak';

// Film frame aspect ratio (3:2 landscape, standard 35mm)
const FRAME_ASPECT_RATIO = 3 / 2;

// Authentic 35mm film dimensions (in relative pixels)
const FILM = {
  edgeMargin: 16,         // 最外侧边距
  edgeTextHeight: 14,     // 边缘文字区高度 (齿孔外侧)
  sprocketHeight: 10,     // 齿孔高度
  sprocketWidth: 6,       // 齿孔宽度
  sprocketsPerFrame: 8,   // 每帧齿孔数
  frameGap: 2,            // 帧间距
  rowGap: 20              // 行间距
};

/**
 * Generate authentic film strip row with proper layout:
 * Edge text (outside) -> Sprockets -> Photos -> Sprockets -> Edge text (outside)
 */
function generateFilmStripRowSVG({
  frameWidth,
  frameHeight,
  photos,
  startIndex,
  columns,
  style,
  rollInfo
}) {
  const photosInRow = photos.slice(startIndex, startIndex + columns);
  const actualColumns = photosInRow.length;
  
  // Calculate dimensions
  const rowWidth = actualColumns * frameWidth + (actualColumns - 1) * FILM.frameGap;
  
  // Layer heights (from top to bottom):
  // 1. Top edge text (outside sprockets)
  // 2. Top sprocket holes
  // 3. Photo frames
  // 4. Bottom sprocket holes  
  // 5. Bottom edge text (outside sprockets)
  const topEdgeY = 0;
  const topSprocketY = FILM.edgeTextHeight;
  const photoY = topSprocketY + FILM.sprocketHeight;
  const bottomSprocketY = photoY + frameHeight;
  const bottomEdgeY = bottomSprocketY + FILM.sprocketHeight;
  const totalRowHeight = bottomEdgeY + FILM.edgeTextHeight;
  
  // Text color - unified as specified
  const textColor = style.frameNumberColor;
  
  let svg = '';
  
  // ===== TOP EDGE TEXT (outside sprockets) =====
  // Film stock name on the left, frame numbers+A near separators between photos
  const filmStock = rollInfo.film_name || 'KODAK';
  
  // Film stock label on the far left
  svg += `
    <text 
      x="4" 
      y="${topEdgeY + FILM.edgeTextHeight - 3}" 
      font-family="monospace" 
      font-size="10" 
      fill="${textColor}"
      letter-spacing="0.5"
    >${filmStock}</text>
  `;
  
  // Frame numbers+A positioned at the edge/separator area (between photos)
  photosInRow.forEach((photo, col) => {
    const frameNum = photo.frame_number || String(startIndex + col + 1).padStart(2, '0');
    const frameX = col * (frameWidth + FILM.frameGap);
    
    // ◄► separator and frameNum+A between frames
    if (col < photosInRow.length - 1) {
      const separatorX = frameX + frameWidth + FILM.frameGap / 2;
      // Frame number+A on the left of separator
      svg += `
        <text 
          x="${separatorX - 12}" 
          y="${topEdgeY + FILM.edgeTextHeight - 3}" 
          text-anchor="end"
          font-family="monospace" 
          font-size="9" 
          fill="${textColor}"
        >${frameNum}A</text>
      `;
      // Separator symbol
      svg += `
        <text 
          x="${separatorX}" 
          y="${topEdgeY + FILM.edgeTextHeight - 3}" 
          text-anchor="middle"
          font-family="monospace" 
          font-size="8" 
          fill="${textColor}"
        >◄►</text>
      `;
    } else {
      // Last photo: put frameNum+A at the right edge
      svg += `
        <text 
          x="${frameX + frameWidth - 4}" 
          y="${topEdgeY + FILM.edgeTextHeight - 3}" 
          text-anchor="end"
          font-family="monospace" 
          font-size="9" 
          fill="${textColor}"
        >${frameNum}A</text>
      `;
    }
  });
  
  // ===== TOP SPROCKET HOLES =====
  const sprocketSpacing = frameWidth / FILM.sprocketsPerFrame;
  for (let col = 0; col < actualColumns; col++) {
    const frameStartX = col * (frameWidth + FILM.frameGap);
    for (let s = 0; s < FILM.sprocketsPerFrame; s++) {
      const sx = frameStartX + s * sprocketSpacing + (sprocketSpacing - FILM.sprocketWidth) / 2;
      svg += `<rect x="${sx}" y="${topSprocketY}" width="${FILM.sprocketWidth}" height="${FILM.sprocketHeight}" rx="1" fill="${style.sprocketHoleColor}"/>`;
    }
  }
  
  // ===== BOTTOM SPROCKET HOLES =====
  for (let col = 0; col < actualColumns; col++) {
    const frameStartX = col * (frameWidth + FILM.frameGap);
    for (let s = 0; s < FILM.sprocketsPerFrame; s++) {
      const sx = frameStartX + s * sprocketSpacing + (sprocketSpacing - FILM.sprocketWidth) / 2;
      svg += `<rect x="${sx}" y="${bottomSprocketY}" width="${FILM.sprocketWidth}" height="${FILM.sprocketHeight}" rx="1" fill="${style.sprocketHoleColor}"/>`;
    }
  }
  
  // ===== BOTTOM EDGE TEXT (outside sprockets) =====
  // Frame numbers (without A) centered below each photo
  photosInRow.forEach((photo, col) => {
    const frameNum = photo.frame_number || String(startIndex + col + 1).padStart(2, '0');
    const frameX = col * (frameWidth + FILM.frameGap);
    const centerX = frameX + frameWidth / 2;
    
    svg += `
      <text 
        x="${centerX}" 
        y="${bottomEdgeY + FILM.edgeTextHeight - 3}" 
        text-anchor="middle"
        font-family="monospace" 
        font-size="9" 
        fill="${textColor}"
      >${frameNum}</text>
    `;
  });
  
  return { svg, totalRowHeight, photoY };
}

/**
 * Generate complete contact sheet overlay
 */
function generateContactSheetOverlay({
  totalWidth,
  totalHeight,
  frameWidth,
  frameHeight,
  photos,
  columns,
  rows,
  style,
  rollInfo,
  padding,
  rowHeightWithFilm
}) {
  let svg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background
  svg += `<rect width="${totalWidth}" height="${totalHeight}" fill="${style.background}"/>`;
  
  // Generate each row
  for (let row = 0; row < rows; row++) {
    const startIndex = row * columns;
    const yOffset = padding + row * (rowHeightWithFilm + FILM.rowGap);
    
    if (style.showSprockets) {
      const { svg: rowSvg } = generateFilmStripRowSVG({
        frameWidth,
        frameHeight,
        photos,
        startIndex,
        columns,
        style,
        rollInfo
      });
      
      svg += `<g transform="translate(${padding}, ${yOffset})">${rowSvg}</g>`;
    } else {
      // Minimal style - just frame numbers below photos
      const photosInRow = photos.slice(startIndex, startIndex + columns);
      svg += `<g transform="translate(${padding}, ${yOffset})">`;
      photosInRow.forEach((photo, col) => {
        const frameNum = photo.frame_number || String(startIndex + col + 1).padStart(2, '0');
        const x = col * (frameWidth + FILM.frameGap) + frameWidth / 2;
        svg += `
          <text 
            x="${x}" 
            y="${frameHeight + 12}" 
            text-anchor="middle" 
            font-family="${style.frameNumberFont.family}" 
            font-size="${style.frameNumberFont.size}" 
            fill="${style.frameNumberColor}"
          >${frameNum}</text>
        `;
      });
      svg += `</g>`;
    }
  }
  
  svg += '</svg>';
  return svg;
}

/**
 * Main contact sheet generator
 */
async function generateContactSheet({
  photos = [],
  rollMetadata = {},
  uploadsDir,
  columns = DEFAULT_COLUMNS,
  maxTotalWidth = DEFAULT_MAX_TOTAL_WIDTH,
  maxPhotoWidth = DEFAULT_MAX_PHOTO_WIDTH,
  styleName = DEFAULT_STYLE,
  quality = 95,
  onProgress = () => {}
}) {
  if (photos.length === 0) {
    throw new Error('No photos to generate contact sheet');
  }
  
  const style = STYLES[styleName] || STYLES[DEFAULT_STYLE];
  
  // Calculate dimensions
  const rows = Math.ceil(photos.length / columns);
  const padding = FILM.edgeMargin;
  
  // Calculate frame size (3:2 aspect ratio)
  const availableWidth = maxTotalWidth - 2 * padding - (columns - 1) * FILM.frameGap;
  let frameWidth = Math.min(Math.floor(availableWidth / columns), maxPhotoWidth);
  let frameHeight = Math.round(frameWidth / FRAME_ASPECT_RATIO);
  
  // Row height includes: edge text + sprockets + photo + sprockets + edge text
  const rowHeightWithFilm = style.showSprockets 
    ? FILM.edgeTextHeight * 2 + FILM.sprocketHeight * 2 + frameHeight
    : frameHeight + 20; // Minimal style just has frame numbers
  
  const totalWidth = 2 * padding + columns * frameWidth + (columns - 1) * FILM.frameGap;
  const totalHeight = 2 * padding + rows * rowHeightWithFilm + (rows - 1) * FILM.rowGap;
  
  console.log(`[ContactSheet] Config: ${photos.length} photos, ${columns}x${rows}, frame ${frameWidth}x${frameHeight}, total ${totalWidth}x${totalHeight}`);
  
  onProgress(0, photos.length, 'Initializing...');
  
  const composites = [];
  
  // Calculate photo position offset
  const photoOffsetY = style.showSprockets 
    ? FILM.edgeTextHeight + FILM.sprocketHeight 
    : 0;
  
  // Process each photo
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const row = Math.floor(i / columns);
    const col = i % columns;
    
    onProgress(i + 1, photos.length, `Processing photo ${i + 1}/${photos.length}`);
    
    // Determine photo path
    let photoPath = null;
    const fullPath = photo.full_rel_path;
    const thumbPath = photo.thumb_rel_path;
    
    // Prefer full path for better quality
    const relPath = fullPath || thumbPath;
    if (relPath) {
      // Handle both forward and back slashes, remove leading slashes
      const normalizedPath = relPath.replace(/^\/+/, '').replace(/\//g, path.sep);
      photoPath = path.join(uploadsDir, normalizedPath);
    }
    
    if (!photoPath) {
      console.warn(`[ContactSheet] Photo ${photo.id} has no path, skipping`);
      continue;
    }
    
    try {
      await fs.access(photoPath);
      
      // Process image with 3:2 landscape crop
      const processedImage = await sharp(photoPath)
        .resize(frameWidth, frameHeight, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      
      // Calculate position
      const left = padding + col * (frameWidth + FILM.frameGap);
      const top = padding + row * (rowHeightWithFilm + FILM.rowGap) + photoOffsetY;
      
      composites.push({
        input: processedImage,
        left: Math.round(left),
        top: Math.round(top)
      });
    } catch (err) {
      console.error(`[ContactSheet] Failed: ${photoPath}:`, err.message);
    }
  }
  
  if (composites.length === 0) {
    throw new Error('No valid photos could be processed. Check file paths.');
  }
  
  onProgress(photos.length, photos.length, 'Generating film overlay...');
  
  // Generate overlay SVG
  const overlaySVG = generateContactSheetOverlay({
    totalWidth,
    totalHeight,
    frameWidth,
    frameHeight,
    photos,
    columns,
    rows,
    style,
    rollInfo: {
      title: rollMetadata.title,
      film_name: rollMetadata.film_name_joined || rollMetadata.film_type || 'FILM',
      iso: rollMetadata.iso || rollMetadata.film_iso_joined,
      camera: rollMetadata.camera
    },
    padding,
    rowHeightWithFilm
  });
  
  onProgress(photos.length, photos.length, 'Compositing...');
  
  // Parse background color
  const bgRGB = hexToRgb(style.background || '#1a1a1a');
  
  // Create final composite
  const result = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: bgRGB
    }
  })
  .composite([
    { input: Buffer.from(overlaySVG), top: 0, left: 0 },
    ...composites
  ])
  .jpeg({ quality })
  .toBuffer();
  
  onProgress(photos.length, photos.length, 'Complete');
  
  return result;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 26, g: 26, b: 26 };
}

module.exports = {
  generateContactSheet,
  STYLES,
  DEFAULT_COLUMNS,
  DEFAULT_MAX_TOTAL_WIDTH,
  DEFAULT_MAX_PHOTO_WIDTH
};

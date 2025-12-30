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

// Base dimensions (designed for frameWidth = 120px, will scale proportionally)
const BASE_FRAME_WIDTH = 120;
const FILM_BASE = {
  edgeMargin: 16,
  edgeTextHeight: 14,
  sprocketHeight: 10,
  sprocketWidth: 6,
  sprocketsPerFrame: 8,
  frameGap: 2,
  rowGap: 8
};

// Helper to get scaled FILM dimensions based on actual frameWidth and style
function getScaledFilm(frameWidth, styleName = DEFAULT_STYLE) {
  const scale = frameWidth / BASE_FRAME_WIDTH;
  return {
    edgeMargin: Math.round(FILM_BASE.edgeMargin * scale),
    edgeTextHeight: Math.round(FILM_BASE.edgeTextHeight * scale),
    sprocketHeight: Math.round(FILM_BASE.sprocketHeight * scale),
    sprocketWidth: Math.round(FILM_BASE.sprocketWidth * scale),
    sprocketsPerFrame: FILM_BASE.sprocketsPerFrame,
    frameGap: Math.round(FILM_BASE.frameGap * scale),
    // minimal模式下行间距更大，防止编号被遮挡
    rowGap: styleName === 'minimal' ? Math.max(18, Math.round(FILM_BASE.rowGap * scale)) : Math.round(FILM_BASE.rowGap * scale),
    // Font sizes (scaled)
    filmNameFontSize: Math.round(9 * scale),
    frameNumFontSize: Math.round(8 * scale),
    separatorFontSize: Math.round(7 * scale),
    // DX barcode dimensions (scaled)
    dxBarWidth: Math.round(2 * scale),
    dxBarGap: Math.round(1.5 * scale),
    dxBarHeight: Math.round(10 * scale)
  };
}

/**
 * Generate DX code barcode pattern based on real film information
 * DX码结构 (14位):
 * - 位1-6: 胶片品牌/型号编码 (基于film_name的hash)
 * - 位7-10: ISO感光度编码 (标准DX ISO编码)
 * - 位11-14: 曝光格数编码 (基于photo_count)
 * 
 * @param {Object} rollInfo - Roll metadata containing film_name, iso, photo_count
 * @param {number} frameIndex - Current frame index for variation
 * @returns {boolean[]} - Array of 14 booleans representing bar/no-bar
 */
function generateDXCode(rollInfo, frameIndex = 0) {
  const filmName = (rollInfo.film_name || 'KODAK').toUpperCase();
  const iso = parseInt(rollInfo.iso) || 400;
  const photoCount = rollInfo.photo_count || 36;
  
  // 1. Film brand/model encoding (6 bits) - hash based on film name
  const filmHash = filmName.split('').reduce((acc, char, i) => {
    return acc + char.charCodeAt(0) * (i + 1);
  }, 0);
  const brandBits = [];
  for (let i = 0; i < 6; i++) {
    brandBits.push(((filmHash >> i) & 1) === 1);
  }
  
  // 2. ISO encoding (4 bits) - based on DX ISO standard
  // ISO 25=0000, 50=0001, 100=0010, 200=0011, 400=0100, 800=0101, 1600=0110, 3200=0111
  const isoMap = {
    25: 0, 50: 1, 64: 1, 100: 2, 125: 2, 160: 3, 200: 3, 
    250: 4, 320: 4, 400: 4, 500: 5, 640: 5, 800: 5, 
    1000: 6, 1250: 6, 1600: 6, 2000: 7, 2500: 7, 3200: 7
  };
  // Find closest ISO
  const isoValues = Object.keys(isoMap).map(Number).sort((a, b) => a - b);
  let closestIso = isoValues.reduce((prev, curr) => 
    Math.abs(curr - iso) < Math.abs(prev - iso) ? curr : prev
  );
  const isoCode = isoMap[closestIso] || 4; // Default to 400
  const isoBits = [];
  for (let i = 0; i < 4; i++) {
    isoBits.push(((isoCode >> i) & 1) === 1);
  }
  
  // 3. Exposure count encoding (4 bits)
  // 12=0000, 24=0001, 36=0010, 48=0011, etc.
  const countCode = Math.floor(photoCount / 12);
  const countBits = [];
  for (let i = 0; i < 4; i++) {
    countBits.push(((countCode >> i) & 1) === 1);
  }
  
  // Combine all bits with some frame-based variation for visual interest
  const allBits = [...brandBits, ...isoBits, ...countBits];
  
  // Add slight variation per frame (toggle some bits based on frame index)
  const variedBits = allBits.map((bit, i) => {
    // Every few frames, vary the last few bits slightly
    if (i >= 10 && (frameIndex + i) % 7 === 0) {
      return !bit;
    }
    return bit;
  });
  
  return variedBits;
}

/**
 * Process photo with intelligent aspect ratio handling
 * For portrait orientation (height > width), rotate 90° clockwise to landscape
 * For landscape orientation, use as-is
 */
async function processPhotoForFrame(photoPath, frameWidth, frameHeight) {
  // Get image metadata first to determine orientation
  const metadata = await sharp(photoPath).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;
  
  console.log(`[ContactSheet] Processing: ${path.basename(photoPath)}, dimensions: ${imageWidth}x${imageHeight}`);
  
  // Determine if portrait (height > width)
  const isPortrait = imageHeight > imageWidth;
  
  let pipeline;
  
  if (isPortrait) {
    // Portrait image: rotate 90° clockwise to make it landscape
    console.log(`[ContactSheet] Portrait detected, rotating 90° clockwise`);
    pipeline = sharp(photoPath)
      .rotate(90)  // Rotate 90° clockwise
      .resize(frameWidth, frameHeight, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 });
  } else {
    // Landscape or square: no rotation needed
    pipeline = sharp(photoPath)
      .resize(frameWidth, frameHeight, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 });
  }
  
  const processed = await pipeline.toBuffer();
  return processed;
}

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
  rollInfo,
  FILM  // Scaled FILM dimensions
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
  
  // Film stock label on the far left - using monospace for film strip look
  svg += `
    <text 
      x="${Math.round(FILM.frameGap * 2)}" 
      y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
      font-family="'Courier New', Courier, monospace" 
      font-weight="bold"
      font-size="${Math.round(FILM.filmNameFontSize * 0.9)}" 
      fill="${textColor}"
      letter-spacing="1.2"
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
          x="${separatorX - Math.round(FILM.frameGap * 4)}" 
          y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
          text-anchor="end"
          font-family="'Courier New', Courier, monospace" 
          font-weight="bold"
          font-size="${Math.round(FILM.frameNumFontSize * 1.1)}" 
          fill="${textColor}"
          letter-spacing="0.8"
        >${frameNum}A</text>
      `;
      // Separator symbol
      svg += `
        <text 
          x="${separatorX}" 
          y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
          text-anchor="middle"
          font-family="'Courier New', Courier, monospace" 
          font-weight="bold"
          font-size="${Math.round(FILM.separatorFontSize * 1.2)}" 
          fill="${textColor}"
        >◄►</text>
      `;
    } else {
      // Last photo: put frameNum+A at the right edge
      svg += `
        <text 
          x="${frameX + frameWidth - Math.round(FILM.frameGap * 2)}" 
          y="${topEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.2)}" 
          text-anchor="end"
          font-family="'Courier New', Courier, monospace" 
          font-weight="bold"
          font-size="${Math.round(FILM.frameNumFontSize * 1.1)}" 
          fill="${textColor}"
          letter-spacing="0.8"
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
        y="${bottomEdgeY + FILM.edgeTextHeight - Math.round(FILM.edgeTextHeight * 0.15)}" 
        text-anchor="middle"
        font-family="'Courier New', Courier, monospace" 
        font-weight="bold"
        font-size="${Math.round(FILM.frameNumFontSize * 1.1)}" 
        fill="${textColor}"
        letter-spacing="0.6"
      >${frameNum}</text>
    `;
  });
  
  // DX code barcode patterns on bottom edge (based on real film info)
  for (let col = 0; col < actualColumns; col++) {
    const frameX = col * (frameWidth + FILM.frameGap);
    // Position barcode to the right of center (after frame number) - limit to stay within frame
    const barcodeX = frameX + frameWidth / 2 + Math.round(FILM.frameNumFontSize * 1.2);
    const bottomDxBarY = bottomEdgeY + Math.round(FILM.edgeTextHeight * 0.15);
    const maxBarcodeEnd = frameX + frameWidth - FILM.frameGap;
    
    // Generate DX code based on film info and frame index
    const frameIndex = startIndex + col;
    const dxBits = generateDXCode(rollInfo, frameIndex);
    
    // Draw barcode based on DX bits
    for (let i = 0; i < dxBits.length; i++) {
      const barX = barcodeX + i * (FILM.dxBarWidth + FILM.dxBarGap);
      if (barX + FILM.dxBarWidth <= maxBarcodeEnd && dxBits[i]) {
        svg += `<rect x="${barX}" y="${bottomDxBarY}" width="${FILM.dxBarWidth}" height="${FILM.dxBarHeight}" fill="${textColor}" opacity="0.85"/>`;
      }
    }
  }
  
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
  rowHeightWithFilm,
  FILM  // Scaled FILM dimensions
}) {
  let svg = `<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background
  svg += `<rect width="${totalWidth}" height="${totalHeight}" fill="${style.background}"/>`;
  
  // Row total height includes gap between rows
  const rowTotalHeight = rowHeightWithFilm + FILM.rowGap;
  
  // Generate each row
  for (let row = 0; row < rows; row++) {
    const startIndex = row * columns;
    const yOffset = padding + row * rowTotalHeight;
    
    if (style.showSprockets) {
      // Draw film strip row background (slightly different from main bg for visual separation)
      const filmBgColor = adjustBrightness(style.background, 1.15);
      svg += `<rect x="${padding - 4}" y="${yOffset - 2}" width="${totalWidth - 2*padding + 8}" height="${rowHeightWithFilm + 4}" fill="${filmBgColor}" rx="2"/>`;
      
      const { svg: rowSvg } = generateFilmStripRowSVG({
        frameWidth,
        frameHeight,
        photos,
        startIndex,
        columns,
        style,
        rollInfo,
        FILM
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
 * Generate barcode separator between film strip rows
 */
function generateBarcodeSVG({ x, y, width, height, style, rollInfo, rowIndex }) {
  let svg = '';
  
  // Barcode background (darker than film strip)
  const barcodeBg = adjustBrightness(style.background, 0.6);
  svg += `<rect x="${x - 4}" y="${y}" width="${width + 8}" height="${height}" fill="${barcodeBg}"/>`;
  
  const textColor = style.frameNumberColor;
  const barcodeY = y + height / 2;
  
  // Left side: DX code style barcode pattern
  let barcodeX = x + 8;
  const barWidth = 2;
  const barGap = 1.5;
  const barHeight = height - 8;
  const barY = y + 4;
  
  // Generate pseudo-random barcode pattern based on roll info
  const seed = (rollInfo.id || 0) + rowIndex * 7;
  for (let i = 0; i < 24; i++) {
    const isBar = ((seed * (i + 1) * 17) % 5) > 1;
    if (isBar) {
      svg += `<rect x="${barcodeX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="${textColor}" opacity="0.8"/>`;
    }
    barcodeX += barWidth + barGap;
  }
  
  // Center: Film info text
  const filmName = rollInfo.film_name || 'KODAK';
  const frameRange = `${(rowIndex * 6 + 1).toString().padStart(2, '0')}-${((rowIndex + 1) * 6).toString().padStart(2, '0')}`;
  svg += `
    <text x="${x + width / 2}" y="${barcodeY + 4}" text-anchor="middle" font-family="monospace" font-size="11" fill="${textColor}" opacity="0.9">
      ${filmName}  ${frameRange}  ${rollInfo.iso || '400'}
    </text>
  `;
  
  // Right side: Another barcode pattern
  barcodeX = x + width - 8 - 24 * (barWidth + barGap);
  for (let i = 0; i < 24; i++) {
    const isBar = ((seed * (i + 3) * 13) % 5) > 1;
    if (isBar) {
      svg += `<rect x="${barcodeX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="${textColor}" opacity="0.8"/>`;
    }
    barcodeX += barWidth + barGap;
  }
  
  return svg;
}

/**
 * Adjust color brightness
 */
function adjustBrightness(hexColor, factor) {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.substr(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.substr(2, 2), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.substr(4, 2), 16) * factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
  
  // First pass: calculate frame width using base values
  const baseAvailableWidth = maxTotalWidth - 2 * FILM_BASE.edgeMargin - (columns - 1) * FILM_BASE.frameGap;
  let frameWidth = Math.min(Math.floor(baseAvailableWidth / columns), maxPhotoWidth);
  let frameHeight = Math.round(frameWidth / FRAME_ASPECT_RATIO);
  
  // Get scaled FILM dimensions based on actual frameWidth
  const FILM = getScaledFilm(frameWidth, styleName);
  
  // Recalculate with scaled values
  const padding = FILM.edgeMargin;
  
  // Row height includes: edge text + sprockets + photo + sprockets + edge text
  const rowHeightWithFilm = style.showSprockets 
    ? FILM.edgeTextHeight * 2 + FILM.sprocketHeight * 2 + frameHeight
    : frameHeight + 20; // Minimal style just has frame numbers
  
  // Row total height includes gap between rows
  const rowTotalHeight = rowHeightWithFilm + FILM.rowGap;
  
  const totalWidth = 2 * padding + columns * frameWidth + (columns - 1) * FILM.frameGap;
  // Total height: rows * rowHeight + (rows-1) * rowGap
  const totalHeight = 2 * padding + rows * rowHeightWithFilm + (rows - 1) * FILM.rowGap;
  
  console.log(`[ContactSheet] Config: ${photos.length} photos, ${columns}x${rows}, frame ${frameWidth}x${frameHeight}, scale ${(frameWidth/BASE_FRAME_WIDTH).toFixed(2)}x, total ${totalWidth}x${totalHeight}`);
  
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
      
      // Process image: rotate portrait photos to landscape, then resize to fit frame
      const processedImage = await processPhotoForFrame(photoPath, frameWidth, frameHeight);
      
      // Calculate position (use rowTotalHeight which includes barcode)
      const left = padding + col * (frameWidth + FILM.frameGap);
      const top = padding + row * rowTotalHeight + photoOffsetY;
      
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
    rowHeightWithFilm,
    FILM
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

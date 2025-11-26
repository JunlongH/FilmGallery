// Monotone Cubic Spline Interpolation
export const createSpline = (xs, ys) => {
  const n = xs.length;
  const dys = [], dxs = [], ms = [];
  
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    dys.push(ys[i + 1] - ys[i]);
    ms.push(dys[i] / dxs[i]);
  }

  const c1s = [ms[0]];
  for (let i = 0; i < n - 2; i++) {
    const m = ms[i], mNext = ms[i + 1];
    if (m * mNext <= 0) {
      c1s.push(0);
    } else {
      const dx = dxs[i], dxNext = dxs[i + 1];
      const common = dx + dxNext;
      c1s.push((3 * common) / ((common + dxNext) / m + (common + dx) / mNext));
    }
  }
  c1s.push(ms[ms.length - 1]);

  const c2s = [], c3s = [];
  for (let i = 0; i < n - 1; i++) {
    const c1 = c1s[i], m = ms[i], invDx = 1 / dxs[i];
    const common = c1 + c1s[i + 1] - 2 * m;
    c2s.push((m - c1 - common) * invDx);
    c3s.push(common * invDx * invDx);
  }

  return (x) => {
    // Find segment
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    
    const diff = x - xs[i];
    return ys[i] + c1s[i] * diff + c2s[i] * diff * diff + c3s[i] * diff * diff * diff;
  };
};

// Spline Interpolation for Curve LUT
export const getCurveLUT = (points) => {
  const lut = new Uint8Array(256);
  // Ensure points are sorted
  const sortedPoints = [...points].sort((a, b) => a.x - b.x);
  
  if (sortedPoints.length < 2) {
    for(let i=0; i<256; i++) lut[i] = i;
    return lut;
  }

  const xs = sortedPoints.map(p => p.x);
  const ys = sortedPoints.map(p => p.y);
  const spline = createSpline(xs, ys);

  for (let i = 0; i < 256; i++) {
    if (i <= sortedPoints[0].x) {
      lut[i] = sortedPoints[0].y;
    } else if (i >= sortedPoints[sortedPoints.length - 1].x) {
      lut[i] = sortedPoints[sortedPoints.length - 1].y;
    } else {
      const val = spline(i);
      lut[i] = Math.min(255, Math.max(0, Math.round(val)));
    }
  }
  
  return lut;
};

// Helper to parse .cube file
export const parseCubeLUT = (text) => {
  const lines = text.split('\n');
  let size = 33; // Default
  const data = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]);
      continue;
    }
    
    // Data lines
    const parts = line.split(/\s+/).map(parseFloat);
    if (parts.length >= 3 && !isNaN(parts[0])) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }
  
  return { size, data: new Float32Array(data) };
};

// Helper for trilinear interpolation
export const sampleLUT = (r, g, b, lut) => {
  const { size, data } = lut;
  // r, g, b are 0-1
  const maxIndex = size - 1;
  
  const rPos = r * maxIndex;
  const gPos = g * maxIndex;
  const bPos = b * maxIndex;
  
  const r0 = Math.floor(rPos);
  const g0 = Math.floor(gPos);
  const b0 = Math.floor(bPos);
  
  const r1 = Math.min(maxIndex, r0 + 1);
  const g1 = Math.min(maxIndex, g0 + 1);
  const b1 = Math.min(maxIndex, b0 + 1);
  
  const fr = rPos - r0;
  const fg = gPos - g0;
  const fb = bPos - b0;
  
  // Helper to get index in flat array
  // Standard .cube order is usually: for B { for G { for R { ... } } }
  // index = r + g*size + b*size*size
  const getIdx = (ri, gi, bi) => (ri + gi * size + bi * size * size) * 3;
  
  // We need 8 samples
  const idx000 = getIdx(r0, g0, b0);
  const idx100 = getIdx(r1, g0, b0);
  const idx010 = getIdx(r0, g1, b0);
  const idx110 = getIdx(r1, g1, b0);
  const idx001 = getIdx(r0, g0, b1);
  const idx101 = getIdx(r1, g0, b1);
  const idx011 = getIdx(r0, g1, b1);
  const idx111 = getIdx(r1, g1, b1);
  
  const interp = (v000, v100, v010, v110, v001, v101, v011, v111) => {
    const c00 = v000 * (1 - fr) + v100 * fr;
    const c10 = v010 * (1 - fr) + v110 * fr;
    const c01 = v001 * (1 - fr) + v101 * fr;
    const c11 = v011 * (1 - fr) + v111 * fr;
    
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    
    return c0 * (1 - fb) + c1 * fb;
  };
  
  const rOut = interp(data[idx000], data[idx100], data[idx010], data[idx110], data[idx001], data[idx101], data[idx011], data[idx111]);
  const gOut = interp(data[idx000+1], data[idx100+1], data[idx010+1], data[idx110+1], data[idx001+1], data[idx101+1], data[idx011+1], data[idx111+1]);
  const bOut = interp(data[idx000+2], data[idx100+2], data[idx010+2], data[idx110+2], data[idx001+2], data[idx101+2], data[idx011+2], data[idx111+2]);
  
  return [rOut, gOut, bOut];
};

import React, { useEffect, useRef, useState } from 'react';
import { setRollPreset, listPresets, createPreset, updatePreset, deletePreset as deletePresetApi } from '../../api';
import { getCurveLUT, parseCubeLUT, sampleLUT } from './utils';
import FilmLabControls from './FilmLabControls';
import FilmLabCanvas from './FilmLabCanvas';
import { isWebGLAvailable, processImageWebGL } from './FilmLabWebGL';

export default function FilmLab({ imageUrl, onClose, onSave, rollId }) {
  const canvasRef = useRef(null);
  const origCanvasRef = useRef(null); // Original (unprocessed) canvas for compare mode
  const [image, setImage] = useState(null);
  
  // Parameters
  const [inverted, setInverted] = useState(false); // Default to false as requested
  const [inversionMode, setInversionMode] = useState('linear'); // 'linear' | 'log'
  const [isPicking, setIsPicking] = useState(false);
  const [isPickingBase, setIsPickingBase] = useState(false);
  const [isPickingWB, setIsPickingWB] = useState(false);
  const [pickedColor, setPickedColor] = useState(null);
  const [exposure, setExposure] = useState(0); // -100 to 100
  const [contrast, setContrast] = useState(0); // -100 to 100
  const [highlights, setHighlights] = useState(0); // -100 to 100
  const [shadows, setShadows] = useState(0); // -100 to 100
  const [whites, setWhites] = useState(0); // -100 to 100
  const [blacks, setBlacks] = useState(0); // -100 to 100
  const [temp, setTemp] = useState(0); // -100 to 100 (Blue <-> Yellow)
  const [tint, setTint] = useState(0); // -100 to 100 (Green <-> Magenta)
  
  // RGB Gains (for manual color balance)
  const [red, setRed] = useState(1.0);
  const [green, setGreen] = useState(1.0);
  const [blue, setBlue] = useState(1.0);

  // Rotation
  const [rotation, setRotation] = useState(0);
  const [orientation, setOrientation] = useState(0); // 0, 90, 180, 270

  // Crop
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 1, h: 1 }); // Normalized 0-1
  const [keepRatio, setKeepRatio] = useState(false);

  // Curve Points: Object with arrays for each channel
  const defaultCurve = [{x:0, y:0}, {x:255, y:255}];
  const [curves, setCurves] = useState({
    rgb: [...defaultCurve],
    red: [...defaultCurve],
    green: [...defaultCurve],
    blue: [...defaultCurve]
  });
  const [activeChannel, setActiveChannel] = useState('rgb'); // 'rgb', 'red', 'green', 'blue'

  // Zoom & Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [histograms, setHistograms] = useState({
    rgb: new Array(256).fill(0),
    red: new Array(256).fill(0),
    green: new Array(256).fill(0),
    blue: new Array(256).fill(0)
  });
  
  // LUTs
  const [lut1, setLut1] = useState(null); // { name, data, size, intensity: 1.0 }
  const [lut2, setLut2] = useState(null);
  const [lutExportSize, setLutExportSize] = useState(33); // 33 or 65
  const [useGPU, setUseGPU] = useState(isWebGLAvailable());

  // Compare Mode
  // compareMode: 'off' | 'original' | 'split'
  const [compareMode, setCompareMode] = useState('off');
  const [compareSlider, setCompareSlider] = useState(0.5); // 0-1 split position for 'split' mode

  // Presets (stored in backend DB, mirrored to local state)
  const [presets, setPresets] = useState([]); // [{ id?, name, params: { ... } }]
  const processRafRef = useRef(null);

  // Load presets from backend on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await listPresets();
        if (res && Array.isArray(res.presets)) {
          // Normalize shape: keep id, name, params
          setPresets(res.presets.map(p => ({ id: p.id, name: p.name, params: p.params })));
        }
      } catch (e) {
        console.warn('Failed to load presets from backend', e);
        // Fallback: try localStorage if backend unreachable
        try {
          const raw = localStorage.getItem('filmLabPresets');
          if (raw) setPresets(JSON.parse(raw));
        } catch (e2) {
          console.warn('Failed to load presets from localStorage', e2);
        }
      }
    })();
  }, []);

  // Keep localStorage as a lightweight cache/backup
  const persistPresets = (next) => {
    setPresets(next);
    try { localStorage.setItem('filmLabPresets', JSON.stringify(next)); } catch(e){ console.warn('Persist presets failed', e); }
  };

  const savePreset = async (name) => {
    if (!name) return;
    const params = {
      inverted, inversionMode, exposure, contrast, highlights, shadows, whites, blacks,
      temp, tint, red, green, blue, curves: JSON.parse(JSON.stringify(curves))
    };

    const existing = presets.find(p => p.name === name);
    try {
      if (existing && existing.id) {
        await updatePreset(existing.id, { name, category: 'filmlab', description: '', params });
        const next = presets.map(p => p.name === name ? { ...p, params } : p);
        persistPresets(next);
      } else {
        const created = await createPreset({ name, category: 'filmlab', description: '', params });
        const withId = existing && existing.id ? presets : presets.filter(p => p.name !== name);
        const next = [...withId, { id: created.id, name, params }];
        persistPresets(next);
      }
    } catch (e) {
      console.error('Failed to save preset to backend, falling back to local only', e);
      const exists = presets.some(p => p.name === name);
      let next;
      if (exists) {
        next = presets.map(p => p.name === name ? { ...p, params } : p);
      } else {
        next = [...presets, { name, params }];
      }
      persistPresets(next);
    }
  };

  const applyPreset = (preset) => {
    if (!preset) return;
    const { params } = preset;
    pushToHistory();
    setInverted(params.inverted);
    setInversionMode(params.inversionMode);
    setExposure(params.exposure);
    setContrast(params.contrast);
    setHighlights(params.highlights);
    setShadows(params.shadows);
    setWhites(params.whites);
    setBlacks(params.blacks);
    setTemp(params.temp);
    setTint(params.tint);
    setRed(params.red);
    setGreen(params.green);
    setBlue(params.blue);
    setCurves(JSON.parse(JSON.stringify(params.curves)));
  };

  const deletePreset = async (name) => {
    const target = presets.find(p => p.name === name);
    if (target && target.id) {
      try {
        await deletePresetApi(target.id);
      } catch (e) {
        console.warn('Failed to delete preset in backend, still removing locally', e);
      }
    }
    persistPresets(presets.filter(p => p.name !== name));
  };

  // Placeholder for applying preset to entire roll (requires parent context)
  const applyPresetToRoll = async (preset) => {
    if (!preset) return;
    if (!rollId) {
      applyPreset(preset);
      if (typeof window !== 'undefined') alert('未提供 rollId，已仅对当前图像应用预设。');
      return;
    }
    try {
      const res = await setRollPreset(rollId, { name: preset.name, params: preset.params });
      applyPreset(preset);
      if (res && res.ok && typeof window !== 'undefined') {
        alert(`预设 "${preset.name}" 已保存到整卷（roll ${rollId}）。后续可在访问该卷时默认加载。`);
      }
    } catch (e) {
      console.error('Set roll preset failed', e);
      if (typeof window !== 'undefined') alert('保存整卷预设失败: ' + e.message);
    }
  };

  // History
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const pushToHistory = () => {
    setHistory(prev => [...prev, {
      inverted, exposure, contrast, highlights, shadows, whites, blacks, temp, tint, red, green, blue, curves, rotation, cropRect,
      lut1: lut1 ? { ...lut1 } : null,
      lut2: lut2 ? { ...lut2 } : null
    }]);
    setFuture([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const current = { inverted, exposure, contrast, highlights, shadows, whites, blacks, temp, tint, red, green, blue, curves, rotation, cropRect };
    
    setFuture(prev => [...prev, current]);
    setHistory(prev => prev.slice(0, -1));
    
    setInverted(previous.inverted);
    setExposure(previous.exposure);
    setContrast(previous.contrast);
    setHighlights(previous.highlights || 0);
    setShadows(previous.shadows || 0);
    setWhites(previous.whites || 0);
    setBlacks(previous.blacks || 0);
    setTemp(previous.temp);
    setTint(previous.tint);
    setRed(previous.red);
    setGreen(previous.green);
    setBlue(previous.blue);
    setCurves(previous.curves);
    setRotation(previous.rotation || 0);
    setCropRect(previous.cropRect || { x: 0, y: 0, w: 1, h: 1 });
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    const current = { inverted, exposure, contrast, highlights, shadows, whites, blacks, temp, tint, red, green, blue, curves, rotation, cropRect };
    
    setHistory(prev => [...prev, current]);
    setFuture(prev => prev.slice(0, -1));
    
    setInverted(next.inverted);
    setExposure(next.exposure);
    setContrast(next.contrast);
    setHighlights(next.highlights || 0);
    setShadows(next.shadows || 0);
    setWhites(next.whites || 0);
    setBlacks(next.blacks || 0);
    setTemp(next.temp);
    setTint(next.tint);
    setRed(next.red);
    setGreen(next.green);
    setBlue(next.blue);
    setCurves(next.curves);
    setRotation(next.rotation || 0);
    setCropRect(next.cropRect || { x: 0, y: 0, w: 1, h: 1 });
  };

  const handleReset = () => {
    pushToHistory();
    setInverted(false); // Reset to false
    setExposure(0);
    setContrast(0);
    setHighlights(0);
    setShadows(0);
    setWhites(0);
    setBlacks(0);
    setTemp(0);
    setTint(0);
    setRed(1.0);
    setGreen(1.0);
    setBlue(1.0);
    setRotation(0);
    setOrientation(0);
    setCropRect({ x: 0, y: 0, w: 1, h: 1 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLut1(null);
    setLut2(null);
    setCurves({
      rgb: [{x:0, y:0}, {x:255, y:255}],
      red: [{x:0, y:0}, {x:255, y:255}],
      green: [{x:0, y:0}, {x:255, y:255}],
      blue: [{x:0, y:0}, {x:255, y:255}]
    });
  };

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    img.onload = () => {
      setImage(img);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    if (processRafRef.current) {
      cancelAnimationFrame(processRafRef.current);
    }

    processRafRef.current = requestAnimationFrame(() => {
      processImage();
    });

    return () => {
      if (processRafRef.current) {
        cancelAnimationFrame(processRafRef.current);
        processRafRef.current = null;
      }
    };
  }, [image, inverted, inversionMode, exposure, contrast, highlights, shadows, whites, blacks, temp, tint, red, green, blue, curves, rotation, orientation, cropRect, isCropping, lut1, lut2]);

  // Render original (unprocessed) image for compare modes when geometry changes or image loads
  useEffect(() => {
    if (!image || !origCanvasRef.current) return;
    if (compareMode === 'off') return;
    renderOriginal();
  }, [image, rotation, orientation, cropRect, isCropping, compareMode]);

  const handleCanvasClick = (e) => {
    if ((!isPicking && !isPickingBase && !isPickingWB) || !image || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Replicate processImage transforms
    const maxWidth = 1200;
    const scale = Math.min(1, maxWidth / image.width);
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const scaledW = image.width * scale;
    const scaledH = image.height * scale;
    const rotatedW = scaledW * cos + scaledH * sin;
    const rotatedH = scaledW * sin + scaledH * cos;

    // Shift coordinate system so that (x,y) becomes (0,0)
    ctx.translate(-x, -y);

    if (isCropping) {
      ctx.translate(rotatedW / 2, rotatedH / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
    } else {
      const cropX = cropRect.x * rotatedW;
      const cropY = cropRect.y * rotatedH;
      
      ctx.translate(-cropX, -cropY);
      ctx.translate(rotatedW / 2, rotatedH / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
    }

    const p = ctx.getImageData(0, 0, 1, 1).data;
    let r = p[0], g = p[1], b = p[2];

    if (isPickingBase) {
      // Film Base Sampler Logic
      // We want this color (r,g,b) to become White (255,255,255) in the negative space
      // So that when inverted, it becomes Black (0,0,0)
      // Gain = Target / Source
      // We use a safety clamp to avoid division by zero or extreme gains
      const safeR = Math.max(1, r);
      const safeG = Math.max(1, g);
      const safeB = Math.max(1, b);
      
      pushToHistory();
      setRed(255 / safeR);
      setGreen(255 / safeG);
      setBlue(255 / safeB);
      // Reset Temp/Tint as we are doing manual WB
      setTemp(0);
      setTint(0);
      
      setIsPickingBase(false);
      return;
    }

    if (isPickingWB) {
      // White Balance Picker Logic
      // We want this color (r,g,b) to become Neutral Grey (avg, avg, avg)
      // We will adjust Temp/Tint to achieve this
      // Simplified model:
      // r' = r * (1 + (T+t)/200)
      // g' = g * (1 + (T-t)/200)
      // b' = b * (1 - T/200)
      // We want r' = g' = b' = avg
      
      const avg = (r + g + b) / 3;
      
      // Calculate required gains
      const kR = avg / Math.max(1, r);
      const kG = avg / Math.max(1, g);
      const kB = avg / Math.max(1, b);
      
      // Reverse engineer Temp/Tint
      // kB = 1 - T/200 => T = (1 - kB) * 200
      const newTemp = (1 - kB) * 200;
      
      // kR = 1 + (T + t)/200 => t = (kR - 1)*200 - T
      const newTint = (kR - 1) * 200 - newTemp;
      
      pushToHistory();
      setTemp(Math.max(-100, Math.min(100, newTemp)));
      setTint(Math.max(-100, Math.min(100, newTint)));
      
      // Reset manual gains as we are using Temp/Tint now
      setRed(1.0);
      setGreen(1.0);
      setBlue(1.0);
      
      setIsPickingWB(false);
      return;
    }

    // Apply Pre-Curve Pipeline
    if (inverted) {
      if (inversionMode === 'log') {
        r = 255 * (1 - Math.log(r + 1) / Math.log(256));
        g = 255 * (1 - Math.log(g + 1) / Math.log(256));
        b = 255 * (1 - Math.log(b + 1) / Math.log(256));
      } else {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }
    }

    const rBal = red + (temp / 200) + (tint / 200);
    const gBal = green + (temp / 200) - (tint / 200);
    const bBal = blue - (temp / 200);
    r *= rBal;
    g *= gBal;
    b *= bBal;

    const expFactor = Math.pow(2, exposure / 50);
    r *= expFactor;
    g *= expFactor;
    b *= expFactor;

    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // Tone Mapping (Highlights, Shadows, Whites, Blacks)
    // Normalize to 0-1 for easier calculation
    let rN = r / 255;
    let gN = g / 255;
    let bN = b / 255;

    const applyTone = (val) => {
      // Blacks & Whites (Linear Stretch)
      // Blacks: -100 to 100. If < 0, clip blacks. If > 0, lift blacks.
      // Whites: -100 to 100. If < 0, dim whites. If > 0, clip whites.
      // Simple approach: Map [blackPoint, whitePoint] to [0, 1]
      const blackPoint = -blacks * 0.002; // +/- 0.2
      const whitePoint = 1 - whites * 0.002; // +/- 0.2
      
      // Avoid division by zero
      if (whitePoint !== blackPoint) {
        val = (val - blackPoint) / (whitePoint - blackPoint);
      }

      // Shadows & Highlights (Curve Shaping)
      // Shadows: Boost darks (0-0.5)
      if (shadows !== 0) {
        const sFactor = shadows * 0.005; // Strength
        // Simple quadratic boost for shadows: val + s * (1-val)^2 * val
        // Or Luma mask: (1-val)^2
        val += sFactor * Math.pow(1 - val, 2) * val * 4; 
      }

      // Highlights: Recover brights (0.5-1)
      if (highlights !== 0) {
        const hFactor = highlights * 0.005;
        // Simple quadratic cut for highlights: val - h * val^2 * (1-val)
        // Or Luma mask: val^2
        // Note: highlights slider usually recovers (negative value dims highlights)
        // If highlights > 0, we want to push highlights up? No, usually "Highlights" slider recovers detail (negative) or boosts (positive).
        // Let's assume standard behavior: +Highlights boosts brights, -Highlights recovers (dims) brights.
        val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
      }
      
      return val;
    };

    rN = applyTone(rN);
    gN = applyTone(gN);
    bN = applyTone(bN);

    r = rN * 255;
    g = gN * 255;
    b = bN * 255;

    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));

    setPickedColor({ r, g, b });
    setIsPicking(false); // Auto-exit picker mode after pick
  };

  // Generate Tone Mapping LUT (Exposure, Contrast, H/S/B/W)
  const getToneLUT = () => {
    const lut = new Uint8Array(256);
    const expFactor = Math.pow(2, exposure / 50);
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    const blackPoint = -blacks * 0.002; 
    const whitePoint = 1 - whites * 0.002;
    const sFactor = shadows * 0.005;
    const hFactor = highlights * 0.005;

    for (let i = 0; i < 256; i++) {
      let val = i / 255;

      // 1. Exposure
      val *= expFactor;

      // 2. Contrast
      val = (val - 0.5) * contrastFactor + 0.5;

      // 3. Blacks & Whites
      if (whitePoint !== blackPoint) {
        val = (val - blackPoint) / (whitePoint - blackPoint);
      }

      // 4. Shadows
      if (shadows !== 0) {
        val += sFactor * Math.pow(1 - val, 2) * val * 4;
      }

      // 5. Highlights
      if (highlights !== 0) {
        val += hFactor * Math.pow(val, 2) * (1 - val) * 4;
      }

      lut[i] = Math.min(255, Math.max(0, Math.round(val * 255)));
    }
    return lut;
  };

  const processImage = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // If GPU requested and available, try WebGL fast path (basic pipeline).
    // We still run the CPU path afterwards to keep histograms in sync.
    if (useGPU && isWebGLAvailable()) {
      try {
        const rBal = red + (temp / 200) + (tint / 200);
        const gBal = green + (temp / 200) - (tint / 200);
        const bBal = blue - (temp / 200);
        const gains = [rBal, gBal, bBal];
        
        // Create a separate WebGL canvas (cannot mix 2D and WebGL contexts)
        const webglCanvas = document.createElement('canvas');
        processImageWebGL(webglCanvas, image, {
          inverted,
          inversionMode,
          gains,
          exposure,
          contrast,
          highlights,
          shadows,
          whites,
          blacks,
          curves: {
            rgb: getCurveLUT(curves.rgb),
            red: getCurveLUT(curves.red),
            green: getCurveLUT(curves.green),
            blue: getCurveLUT(curves.blue)
          }
        });
        
        // Copy WebGL result to main 2D canvas first for visual speed,
        // but DO NOT return so CPU path can compute histograms.
        canvas.width = webglCanvas.width;
        canvas.height = webglCanvas.height;
        ctx.drawImage(webglCanvas, 0, 0);
        // fall through intentionally
      } catch (err) {
        console.warn('WebGL processing failed, falling back to CPU pipeline', err);
      }
    }
    
    // Resize canvas to match image (or limit size for performance)
    // Downscale a bit and use histogram subsampling to improve realtime FPS.
    const maxWidth = 1000;
    const scale = Math.min(1, maxWidth / image.width);
    
    // Calculate rotated dimensions
    const totalRotation = rotation + orientation;
    const rad = (totalRotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const scaledW = image.width * scale;
    const scaledH = image.height * scale;
    
    const rotatedW = scaledW * cos + scaledH * sin;
    const rotatedH = scaledW * sin + scaledH * cos;

    if (isCropping) {
      // Show full rotated image for cropping
      canvas.width = rotatedW;
      canvas.height = rotatedH;
      
      ctx.save();
      ctx.translate(rotatedW / 2, rotatedH / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      ctx.restore();
    } else {
      // Show cropped image
      const cropX = cropRect.x * rotatedW;
      const cropY = cropRect.y * rotatedH;
      const cropW = cropRect.w * rotatedW;
      const cropH = cropRect.h * rotatedH;

      // Ensure valid dimensions
      canvas.width = Math.max(1, cropW);
      canvas.height = Math.max(1, cropH);

      ctx.save();
      // Translate so that (cropX, cropY) is at (0,0)
      ctx.translate(-cropX, -cropY);
      // Standard rotation draw
      ctx.translate(rotatedW / 2, rotatedH / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      ctx.restore();
    }
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Pre-calculate lookup tables
    const toneLUT = getToneLUT();
    const lutRGB = getCurveLUT(curves.rgb);
    const lutR = getCurveLUT(curves.red);
    const lutG = getCurveLUT(curves.green);
    const lutB = getCurveLUT(curves.blue);
    
    // Temp/Tint adjustments
    const rBal = red + (temp / 200) + (tint / 200);
    const gBal = green + (temp / 200) - (tint / 200);
    const bBal = blue - (temp / 200);

    // Histogram buckets
    const histRGB = new Array(256).fill(0);
    const histR = new Array(256).fill(0);
    const histG = new Array(256).fill(0);
    const histB = new Array(256).fill(0);
    let maxCount = 0;

    // Downsample histogram & processing for speed: skip every other pixel in X/Y.
    const stride = 2; // samples every 2 pixels (approx 1/4 of total)
    const width = canvas.width;
    const height = canvas.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // Skip transparent pixels (from rotation)
        if (data[idx + 3] === 0) continue;

        // For histograms, only sample every `stride` pixels in both directions
        const shouldSampleHist = (x % stride === 0) && (y % stride === 0);

        let r = data[idx];
        let g = data[idx + 1];
        let b = data[idx + 2];

      // 1. Invert (if enabled)
      if (inverted) {
        if (inversionMode === 'log') {
          r = 255 * (1 - Math.log(r + 1) / Math.log(256));
          g = 255 * (1 - Math.log(g + 1) / Math.log(256));
          b = 255 * (1 - Math.log(b + 1) / Math.log(256));
        } else {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }
      }

      // 2. Color Balance (White Balance)
      r *= rBal;
      g *= gBal;
      b *= bBal;

      // Clamp before LUT
      let rC = Math.min(255, Math.max(0, r));
      let gC = Math.min(255, Math.max(0, g));
      let bC = Math.min(255, Math.max(0, b));

      // 3. Tone Mapping (Exposure, Contrast, H/S/B/W) via LUT
      rC = toneLUT[Math.floor(rC)];
      gC = toneLUT[Math.floor(gC)];
      bC = toneLUT[Math.floor(bC)];
      
      // 4. Curves (Apply RGB LUT first, then Channel LUTs)
      rC = lutRGB[rC];
      gC = lutRGB[gC];
      bC = lutRGB[bC];

      rC = lutR[rC];
      gC = lutG[gC];
      bC = lutB[bC];

      // 5. Loaded LUTs
      if (lut1) {
        const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut1);
        rC = rC * (1 - lut1.intensity) + lr * 255 * lut1.intensity;
        gC = gC * (1 - lut1.intensity) + lg * 255 * lut1.intensity;
        bC = bC * (1 - lut1.intensity) + lb * 255 * lut1.intensity;
      }
      if (lut2) {
        const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut2);
        rC = rC * (1 - lut2.intensity) + lr * 255 * lut2.intensity;
        gC = gC * (1 - lut2.intensity) + lg * 255 * lut2.intensity;
        bC = bC * (1 - lut2.intensity) + lb * 255 * lut2.intensity;
      }

      // Clamp after LUTs
      rC = Math.min(255, Math.max(0, rC));
      gC = Math.min(255, Math.max(0, gC));
      bC = Math.min(255, Math.max(0, bC));

      // Update Histograms only for subsampled pixels
      if (shouldSampleHist) {
        const rIdx = Math.round(rC);
        const gIdx = Math.round(gC);
        const bIdx = Math.round(bC);

        histR[rIdx]++;
        histG[gIdx]++;
        histB[bIdx]++;

        // Calculate luminance for RGB histogram
        const lum = Math.round(0.299 * rC + 0.587 * gC + 0.114 * bC);
        histRGB[lum]++;

        // Track max for normalization across all channels
        maxCount = Math.max(maxCount, histR[rIdx], histG[gIdx], histB[bIdx], histRGB[lum]);
      }

      // Final Clamp and write back full-resolution pixel
      data[idx] = rC;
      data[idx + 1] = gC;
      data[idx + 2] = bC;
    }
    }

    // Normalize histograms
    if (maxCount > 0) {
      for(let i=0; i<256; i++) {
        histRGB[i] /= maxCount;
        histR[i] /= maxCount;
        histG[i] /= maxCount;
        histB[i] /= maxCount;
      }
    }
    setHistograms({ rgb: histRGB, red: histR, green: histG, blue: histB });

	ctx.putImageData(imageData, 0, 0);
  } // <-- Close processImage function

  const renderOriginal = () => {
    if (!image || !origCanvasRef.current) return;
    const canvas = origCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const maxWidth = 1200;
    const scale = Math.min(1, maxWidth / image.width);
    const totalRotation = rotation + orientation;
    const rad = (totalRotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const scaledW = image.width * scale;
    const scaledH = image.height * scale;
    const rotatedW = scaledW * cos + scaledH * sin;
    const rotatedH = scaledW * sin + scaledH * cos;

    if (isCropping) {
      canvas.width = rotatedW;
      canvas.height = rotatedH;
      ctx.save();
      ctx.translate(rotatedW / 2, rotatedH / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      ctx.restore();
    } else {
      const cropX = cropRect.x * rotatedW;
      const cropY = cropRect.y * rotatedH;
      const cropW = cropRect.w * rotatedW;
      const cropH = cropRect.h * rotatedH;
      canvas.width = Math.max(1, cropW);
      canvas.height = Math.max(1, cropH);
      ctx.save();
      ctx.translate(-cropX, -cropY);
      ctx.translate(rotatedW / 2, rotatedH / 2);
      ctx.rotate(rad);
      ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      ctx.restore();
    }
  };

  const handleAutoLevels = () => {
    if (!image) return;
    pushToHistory();
    
    // Use current histograms to find min/max
    // We want to stretch the histogram to fill 0-255
    // We will update the curves to do this
    
    const findLevels = (hist) => {
      let min = 0;
      let max = 255;
      
      // Find min (0.1% threshold)
      // Histograms are normalized (0-1), so sum is ~1 (or maxCount normalized)
      // Actually my histogram logic normalizes by maxCount, not sum.
      // So values are 0-1 relative to the peak.
      // We need to be careful. Let's just look for the first non-zero bucket with some noise tolerance.
      
      // Simple approach: First value > 0.005 (0.5% of peak)
      const threshold = 0.005;
      
      for (let i = 0; i < 256; i++) {
        if (hist[i] > threshold) {
          min = i;
          break;
        }
      }
      
      for (let i = 255; i >= 0; i--) {
        if (hist[i] > threshold) {
          max = i;
          break;
        }
      }
      
      return { min, max };
    };

    const rLevels = findLevels(histograms.red);
    const gLevels = findLevels(histograms.green);
    const bLevels = findLevels(histograms.blue);

    setCurves(prev => ({
      ...prev,
      red: [{x: rLevels.min, y: 0}, {x: rLevels.max, y: 255}],
      green: [{x: gLevels.min, y: 0}, {x: gLevels.max, y: 255}],
      blue: [{x: bLevels.min, y: 0}, {x: bLevels.max, y: 255}]
    }));
  };

  const handleAutoColor = () => {
    if (!image) return;
    pushToHistory();
    
    // Create temp canvas to read raw pixels (downscaled for speed)
    const canvas = document.createElement('canvas');
    const size = 256;
    const scale = Math.min(1, size / image.width);
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let rSum = 0, gSum = 0, bSum = 0;
    let count = 0;
    
    // Sample pixels
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i+1];
      let b = data[i+2];
      
      if (inverted) {
        if (inversionMode === 'log') {
          r = 255 * (1 - Math.log(r + 1) / Math.log(256));
          g = 255 * (1 - Math.log(g + 1) / Math.log(256));
          b = 255 * (1 - Math.log(b + 1) / Math.log(256));
        } else {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }
      }
      
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }
    
    const rAvg = rSum / count;
    const gAvg = gSum / count;
    const bAvg = bSum / count;
    
    // Target is average of averages (Grey)
    const avg = (rAvg + gAvg + bAvg) / 3;
    
    // Calculate required gains to reach neutral grey
    const kR = rAvg > 0 ? avg / rAvg : 1;
    const kG = gAvg > 0 ? avg / gAvg : 1;
    const kB = bAvg > 0 ? avg / bAvg : 1;

    // Reverse engineer Temp/Tint from gains
    // kB = 1 - T/200 => T = (1 - kB) * 200
    const newTemp = (1 - kB) * 200;
    
    // kR = 1 + (T + t)/200 => t = (kR - 1)*200 - T
    const newTint = (kR - 1) * 200 - newTemp;

    setTemp(Math.max(-100, Math.min(100, newTemp)));
    setTint(Math.max(-100, Math.min(100, newTint)));
    setRed(1);
    setGreen(1);
    setBlue(1);
  };

  // Curve Editor Constants
  const curveWidth = 260;
  const curveHeight = 150;

  // Crop Interaction
  const [cropDragAction, setCropDragAction] = useState(null);

  useEffect(() => {
    if (!cropDragAction) return;

    const handleWindowMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      // Current mouse pos in normalized coords
      const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const my = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      
      setCropRect(prev => {
        let { x, y, w, h } = prev;
        const { type, handle, startRect, startMx, startMy } = cropDragAction;
        const dx = mx - startMx;
        const dy = my - startMy;

        if (type === 'move') {
          x = Math.max(0, Math.min(1 - w, startRect.x + dx));
          y = Math.max(0, Math.min(1 - h, startRect.y + dy));
        } else if (type === 'resize') {
          if (handle.includes('e')) w = Math.max(0.05, startRect.w + dx);
          if (handle.includes('s')) h = Math.max(0.05, startRect.h + dy);
          if (handle.includes('w')) {
            const newW = Math.max(0.05, startRect.w - dx);
            x = startRect.x + (startRect.w - newW);
            w = newW;
          }
          if (handle.includes('n')) {
            const newH = Math.max(0.05, startRect.h - dy);
            y = startRect.y + (startRect.h - newH);
            h = newH;
          }
        }
        
        if (keepRatio && type === 'resize' && image) {
           // Calculate rotated dimensions to determine correct aspect ratio in normalized space
           const rad = (rotation * Math.PI) / 180;
           const sin = Math.abs(Math.sin(rad));
           const cos = Math.abs(Math.cos(rad));
           const rotW = image.width * cos + image.height * sin;
           const rotH = image.width * sin + image.height * cos;
           
           // Determine target ratio (flip if rotated sideways)
           let targetRatio = image.width / image.height;
           const isRotatedSideways = (Math.abs(rotation) % 180) > 45 && (Math.abs(rotation) % 180) < 135;
           if (isRotatedSideways) {
             targetRatio = 1 / targetRatio;
           }

           // Calculate the factor to convert normalized width to normalized height
           // h_norm = w_norm * (rotW / (rotH * targetRatio))
           const ratioFactor = rotW / (rotH * targetRatio);

           // Drive Height from Width for all corner handles
           h = w * ratioFactor;

           // If dragging North, we need to adjust Y because H changed to maintain bottom anchor
           if (handle.includes('n')) {
              y = (startRect.y + startRect.h) - h;
           }
        }

        return { x, y, w, h };
      });
    };

    const handleWindowUp = () => {
      setCropDragAction(null);
      pushToHistory();
    };

    window.addEventListener('mousemove', handleWindowMove);
    window.addEventListener('mouseup', handleWindowUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);
    };
  }, [cropDragAction, keepRatio, image, rotation]);

  // Pan Interaction
  useEffect(() => {
    if (!isPanning) return;

    const handleWindowMove = (e) => {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    };

    const handleWindowUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleWindowMove);
    window.addEventListener('mouseup', handleWindowUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);
    };
  }, [isPanning, panStart]);

  const startCropDrag = (e, type, handle) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    
    setCropDragAction({
      type,
      handle,
      startRect: { ...cropRect },
      startMx: mx,
      startMy: my
    });
  };

  const handleWheel = (e) => {
    // Only zoom if hovering over canvas area
    if (e.target.closest('.iv-sidebar')) return;
    
    const scaleBy = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
    setZoom(Math.min(Math.max(0.1, newZoom), 10));
  };

  const handlePanStart = (e) => {
    // Don't pan if clicking on controls or crop handles (handled by stopPropagation)
    if (e.button !== 0) return; // Only left click
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const prevRotationRef = useRef(rotation);

  // Auto-crop on rotation
  useEffect(() => {
    if (!image) return;

    const oldRot = prevRotationRef.current;
    const newRot = rotation;
    prevRotationRef.current = rotation;

    // Helper to get bounding box dimensions
    const getBB = (deg) => {
      const isSideways = (Math.abs(orientation) % 180) === 90;
      const effectiveW = isSideways ? image.height : image.width;
      const effectiveH = isSideways ? image.width : image.height;

      const rad = (deg * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rad));
      const cos = Math.abs(Math.cos(rad));
      return {
        w: effectiveW * cos + effectiveH * sin,
        h: effectiveW * sin + effectiveH * cos
      };
    };

    const oldBB = getBB(oldRot);
    const newBB = getBB(newRot);

    // Calculate max inscribed rectangle for NEW rotation (Safe Zone)
    const isSideways = (Math.abs(orientation) % 180) === 90;
    const W = isSideways ? image.height : image.width;
    const H = isSideways ? image.width : image.height;
    
    const Wbb = newBB.w;
    const Hbb = newBB.h;

    const h1 = (W * H) / Wbb;
    const h2 = (H * H) / Hbb;
    const h_crop = Math.min(h1, h2);
    const w_crop = h_crop * (W / H); // Max inscribed width in pixels

    setCropRect(prev => {
      // 1. Current crop size in pixels (based on OLD bounding box)
      const currentW_px = prev.w * oldBB.w;
      const currentH_px = prev.h * oldBB.h;

      // 2. Current center offset from image center in pixels
      // We want to preserve the crop's position relative to the center of rotation
      const centerX_px = (prev.x + prev.w / 2 - 0.5) * oldBB.w;
      const centerY_px = (prev.y + prev.h / 2 - 0.5) * oldBB.h;

      // 3. Determine scaling factor to fit in max inscribed
      // We only shrink if necessary. We don't grow.
      const scaleW = w_crop / currentW_px;
      const scaleH = h_crop / currentH_px;
      const scale = Math.min(1, scaleW, scaleH);
      
      const newW_px = currentW_px * scale;
      const newH_px = currentH_px * scale;
      
      const newNormW = newW_px / newBB.w;
      const newNormH = newH_px / newBB.h;
      
      // 4. Calculate new center in normalized coords (preserving pixel offset from center)
      const newCenterX = 0.5 + (centerX_px / newBB.w);
      const newCenterY = 0.5 + (centerY_px / newBB.h);

      // 5. Calculate new Top-Left
      let newX = newCenterX - newNormW / 2;
      let newY = newCenterY - newNormH / 2;

      // 6. Clamp to bounds [0, 1] to ensure we don't go outside the canvas
      newX = Math.max(0, Math.min(1 - newNormW, newX));
      newY = Math.max(0, Math.min(1 - newNormH, newY));
      
      return {
        x: newX,
        y: newY,
        w: newNormW,
        h: newNormH
      };
    });

  }, [rotation, image, orientation]);

  const handleLutUpload = (e, index) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const parsed = parseCubeLUT(text);
      const lutObj = { name: file.name, ...parsed, intensity: 1.0 };
      
      pushToHistory();
      if (index === 1) setLut1(lutObj);
      else setLut2(lutObj);
    };
    reader.readAsText(file);
  };

  const generateOutputLUT = () => {
    const size = lutExportSize;
    let content = `LUT_3D_SIZE ${size}\n`;
    
    // Get current 1D LUTs
    const toneLUT = getToneLUT();
    const lutRGB = getCurveLUT(curves.rgb);
    const lutR = getCurveLUT(curves.red);
    const lutG = getCurveLUT(curves.green);
    const lutB = getCurveLUT(curves.blue);
    
    const rBal = red + (temp / 200) + (tint / 200);
    const gBal = green + (temp / 200) - (tint / 200);
    const bBal = blue - (temp / 200);

    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          // Original normalized color
          let rN = r / (size - 1);
          let gN = g / (size - 1);
          let bN = b / (size - 1);
          
          // Convert to 0-255
          let rC = rN * 255;
          let gC = gN * 255;
          let bC = bN * 255;
          
          // 1. Invert
          if (inverted) {
            if (inversionMode === 'log') {
              rC = 255 * (1 - Math.log(rC + 1) / Math.log(256));
              gC = 255 * (1 - Math.log(gC + 1) / Math.log(256));
              bC = 255 * (1 - Math.log(bC + 1) / Math.log(256));
            } else {
              rC = 255 - rC;
              gC = 255 - gC;
              bC = 255 - bC;
            }
          }
          
          // 2. WB
          rC *= rBal;
          gC *= gBal;
          bC *= bBal;
          
          // Clamp
          rC = Math.min(255, Math.max(0, rC));
          gC = Math.min(255, Math.max(0, gC));
          bC = Math.min(255, Math.max(0, bC));
          
          // 3. Tone LUT
          rC = toneLUT[Math.floor(rC)];
          gC = toneLUT[Math.floor(gC)];
          bC = toneLUT[Math.floor(bC)];
          
          // 4. Curves
          rC = lutRGB[rC];
          gC = lutRGB[gC];
          bC = lutRGB[bC];

          rC = lutR[rC];
          gC = lutG[gC];
          bC = lutB[bC];
          
          // 5. Loaded LUTs
          if (lut1) {
             const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut1);
             rC = rC * (1 - lut1.intensity) + lr * 255 * lut1.intensity;
             gC = gC * (1 - lut1.intensity) + lg * 255 * lut1.intensity;
             bC = bC * (1 - lut1.intensity) + lb * 255 * lut1.intensity;
          }
          if (lut2) {
             const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut2);
             rC = rC * (1 - lut2.intensity) + lr * 255 * lut2.intensity;
             gC = gC * (1 - lut2.intensity) + lg * 255 * lut2.intensity;
             bC = bC * (1 - lut2.intensity) + lb * 255 * lut2.intensity;
          }
          
          // Output normalized
          content += `${(rC/255).toFixed(6)} ${(gC/255).toFixed(6)} ${(bC/255).toFixed(6)}\n`;
        }
      }
    }
    
    // Download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'film-lab-export.cube';
    a.click();
  };

  const handleExportLUT = () => {
    pushToHistory();
    generateOutputLUT();
  };

  const handleSave = () => {
    if (!image) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Use higher resolution for saving
    const maxSaveWidth = 4000; 
    const scale = Math.min(1, maxSaveWidth / image.width);
    
    const totalRotation = rotation + orientation;
    const rad = (totalRotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const scaledW = image.width * scale;
    const scaledH = image.height * scale;
    
    const rotatedW = scaledW * cos + scaledH * sin;
    const rotatedH = scaledW * sin + scaledH * cos;

    const cropX = cropRect.x * rotatedW;
    const cropY = cropRect.y * rotatedH;
    const cropW = cropRect.w * rotatedW;
    const cropH = cropRect.h * rotatedH;

    canvas.width = Math.max(1, cropW);
    canvas.height = Math.max(1, cropH);

    ctx.save();
    ctx.translate(-cropX, -cropY);
    ctx.translate(rotatedW / 2, rotatedH / 2);
    ctx.rotate(rad);
    ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
    ctx.restore();
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Pre-calculate lookup tables
    const toneLUT = getToneLUT();
    const lutRGB = getCurveLUT(curves.rgb);
    const lutR = getCurveLUT(curves.red);
    const lutG = getCurveLUT(curves.green);
    const lutB = getCurveLUT(curves.blue);
    
    const rBal = red + (temp / 200) + (tint / 200);
    const gBal = green + (temp / 200) - (tint / 200);
    const bBal = blue - (temp / 200);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] === 0) continue;

      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (inverted) {
        if (inversionMode === 'log') {
          r = 255 * (1 - Math.log(r + 1) / Math.log(256));
          g = 255 * (1 - Math.log(g + 1) / Math.log(256));
          b = 255 * (1 - Math.log(b + 1) / Math.log(256));
        } else {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }
      }

      r *= rBal;
      g *= gBal;
      b *= bBal;

      let rC = Math.min(255, Math.max(0, r));
      let gC = Math.min(255, Math.max(0, g));
      let bC = Math.min(255, Math.max(0, b));

      rC = toneLUT[Math.floor(rC)];
      gC = toneLUT[Math.floor(gC)];
      bC = toneLUT[Math.floor(bC)];
      
      rC = lutRGB[rC];
      gC = lutRGB[gC];
      bC = lutRGB[bC];

      rC = lutR[rC];
      gC = lutG[gC];
      bC = lutB[bC];

      if (lut1) {
        const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut1);
        rC = rC * (1 - lut1.intensity) + lr * 255 * lut1.intensity;
        gC = gC * (1 - lut1.intensity) + lg * 255 * lut1.intensity;
        bC = bC * (1 - lut1.intensity) + lb * 255 * lut1.intensity;
      }
      if (lut2) {
        const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut2);
        rC = rC * (1 - lut2.intensity) + lr * 255 * lut2.intensity;
        gC = gC * (1 - lut2.intensity) + lg * 255 * lut2.intensity;
        bC = bC * (1 - lut2.intensity) + lb * 255 * lut2.intensity;
      }

      rC = Math.min(255, Math.max(0, rC));
      gC = Math.min(255, Math.max(0, gC));
      bC = Math.min(255, Math.max(0, bC));

      data[i] = rC;
      data[i + 1] = gC;
      data[i + 2] = bC;
    }

    ctx.putImageData(imageData, 0, 0);
    
    canvas.toBlob((blob) => {
      if (onSave) onSave(blob);
    }, 'image/jpeg', 1.0);
  };

  const handleDownload = () => {
    if (!image) return;
    
    // Reuse the logic from handleSave but trigger download instead of callback
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const maxSaveWidth = 4000; 
    const scale = Math.min(1, maxSaveWidth / image.width);
    
    const totalRotation = rotation + orientation;
    const rad = (totalRotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const scaledW = image.width * scale;
    const scaledH = image.height * scale;
    
    const rotatedW = scaledW * cos + scaledH * sin;
    const rotatedH = scaledW * sin + scaledH * cos;

    const cropX = cropRect.x * rotatedW;
    const cropY = cropRect.y * rotatedH;
    const cropW = cropRect.w * rotatedW;
    const cropH = cropRect.h * rotatedH;

    canvas.width = Math.max(1, cropW);
    canvas.height = Math.max(1, cropH);

    ctx.save();
    ctx.translate(-cropX, -cropY);
    ctx.translate(rotatedW / 2, rotatedH / 2);
    ctx.rotate(rad);
    ctx.drawImage(image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
    ctx.restore();
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Pre-calculate lookup tables
    const toneLUT = getToneLUT();
    const lutRGB = getCurveLUT(curves.rgb);
    const lutR = getCurveLUT(curves.red);
    const lutG = getCurveLUT(curves.green);
    const lutB = getCurveLUT(curves.blue);
    
    const rBal = red + (temp / 200) + (tint / 200);
    const gBal = green + (temp / 200) - (tint / 200);
    const bBal = blue - (temp / 200);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] === 0) continue;

      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (inverted) {
        if (inversionMode === 'log') {
          r = 255 * (1 - Math.log(r + 1) / Math.log(256));
          g = 255 * (1 - Math.log(g + 1) / Math.log(256));
          b = 255 * (1 - Math.log(b + 1) / Math.log(256));
        } else {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
        }
      }

      r *= rBal;
      g *= gBal;
      b *= bBal;

      let rC = Math.min(255, Math.max(0, r));
      let gC = Math.min(255, Math.max(0, g));
      let bC = Math.min(255, Math.max(0, b));

      rC = toneLUT[Math.floor(rC)];
      gC = toneLUT[Math.floor(gC)];
      bC = toneLUT[Math.floor(bC)];
      
      rC = lutRGB[rC];
      gC = lutRGB[gC];
      bC = lutRGB[bC];

      rC = lutR[rC];
      gC = lutG[gC];
      bC = lutB[bC];

      if (lut1) {
        const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut1);
        rC = rC * (1 - lut1.intensity) + lr * 255 * lut1.intensity;
        gC = gC * (1 - lut1.intensity) + lg * 255 * lut1.intensity;
        bC = bC * (1 - lut1.intensity) + lb * 255 * lut1.intensity;
      }
      if (lut2) {
        const [lr, lg, lb] = sampleLUT(rC/255, gC/255, bC/255, lut2);
        rC = rC * (1 - lut2.intensity) + lr * 255 * lut2.intensity;
        gC = gC * (1 - lut2.intensity) + lg * 255 * lut2.intensity;
        bC = bC * (1 - lut2.intensity) + lb * 255 * lut2.intensity;
      }

      rC = Math.min(255, Math.max(0, rC));
      gC = Math.min(255, Math.max(0, gC));
      bC = Math.min(255, Math.max(0, bC));

      data[i] = rC;
      data[i + 1] = gC;
      data[i + 2] = bC;
    }

    ctx.putImageData(imageData, 0, 0);
    
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `film-lab-export-${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 1.0);
  };

  const handleAutoBase = () => {
    if (!image) return;
    pushToHistory();

    // Create temp canvas to read raw pixels
    const canvas = document.createElement('canvas');
    const size = 256;
    const scale = Math.min(1, size / image.width);
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Find max luminance
    let maxLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
      if (lum > maxLum) maxLum = lum;
    }

    // Average pixels within top 5% of brightness (Film Base candidates)
    const threshold = maxLum * 0.95;
    let rSum = 0, gSum = 0, bSum = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;

      if (lum >= threshold) {
        rSum += r;
        gSum += g;
        bSum += b;
        count++;
      }
    }

    if (count > 0) {
      const rAvg = rSum / count;
      const gAvg = gSum / count;
      const bAvg = bSum / count;

      // Apply Base Correction (Gain = 255 / BaseColor)
      // This maps the base color to White (255,255,255)
      const safeR = Math.max(1, rAvg);
      const safeG = Math.max(1, gAvg);
      const safeB = Math.max(1, bAvg);

      setRed(255 / safeR);
      setGreen(255 / safeG);
      setBlue(255 / safeB);
      
      // Reset Temp/Tint as this is a base calibration
      setTemp(0);
      setTint(0);
    }
  };


  return (
    <div className="iv-overlay" style={{ background: 'rgba(10,10,10,0.98)', display: 'flex', flexDirection: 'row', color: '#eee' }}>
      <style>{`
        .iv-sidebar {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .iv-control-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #888;
          font-weight: 600;
        }
        .iv-btn {
          background: #333;
          border: 1px solid #444;
          color: #eee;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
          font-weight: 500;
        }
        .iv-btn:hover {
          background: #444;
          border-color: #555;
        }
        .iv-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .iv-btn-primary {
          background: #2e7d32;
          border-color: #1b5e20;
          color: white;
        }
        .iv-btn-primary:hover {
          background: #388e3c;
        }
        .iv-btn-danger {
          background: #c62828;
          border-color: #b71c1c;
        }
        .iv-btn-danger:hover {
          background: #d32f2f;
        }
        .iv-btn-icon {
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          font-size: 14px;
          line-height: 1;
        }
        .iv-btn-icon:hover {
          background: #333;
          color: #fff;
        }
        input[type=range] {
          -webkit-appearance: none;
          width: 100%;
          background: transparent;
        }
        input[type=range]:focus {
          outline: none;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #eee;
          cursor: pointer;
          margin-top: -4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5);
          border: 1px solid #000;
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: #444;
          border-radius: 2px;
        }
        input[type=checkbox] {
          accent-color: #2e7d32;
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        /* Scrollbar */
        .iv-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .iv-scroll::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .iv-scroll::-webkit-scrollbar-thumb {
          background: #444;
          border-radius: 3px;
        }
        .iv-scroll::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>

      <FilmLabCanvas
        canvasRef={canvasRef}
        origCanvasRef={origCanvasRef}
        zoom={zoom} setZoom={setZoom}
        pan={pan} setPan={setPan}
        isPanning={isPanning}
        handleWheel={handleWheel}
        handlePanStart={handlePanStart}
        isCropping={isCropping}
        rotation={rotation} setRotation={setRotation}
        pushToHistory={pushToHistory}
        handleCanvasClick={handleCanvasClick}
        isPicking={isPicking || isPickingBase || isPickingWB}
        cropRect={cropRect}
        startCropDrag={startCropDrag}
        compareMode={compareMode}
        compareSlider={compareSlider}
        setCompareSlider={setCompareSlider}
      />

      <FilmLabControls
        inverted={inverted} setInverted={setInverted}
        useGPU={useGPU} setUseGPU={setUseGPU}
        inversionMode={inversionMode} setInversionMode={setInversionMode}
        isPickingBase={isPickingBase} setIsPickingBase={setIsPickingBase}
        handleAutoBase={handleAutoBase}
        isPickingWB={isPickingWB} setIsPickingWB={setIsPickingWB}
        handleAutoColor={handleAutoColor}
        handleUndo={handleUndo} handleRedo={handleRedo} handleReset={handleReset}
        history={history} future={future}
        handleAutoLevels={handleAutoLevels}
        isCropping={isCropping} setIsCropping={setIsCropping}
        keepRatio={keepRatio} setKeepRatio={setKeepRatio}
        rotation={rotation} setRotation={setRotation}
        setOrientation={setOrientation}
        exposure={exposure} setExposure={setExposure}
        contrast={contrast} setContrast={setContrast}
        highlights={highlights} setHighlights={setHighlights}
        shadows={shadows} setShadows={setShadows}
        whites={whites} setWhites={setWhites}
        blacks={blacks} setBlacks={setBlacks}
        temp={temp} setTemp={setTemp}
        tint={tint} setTint={setTint}
        curves={curves} setCurves={setCurves}
        activeChannel={activeChannel} setActiveChannel={setActiveChannel}
        isPicking={isPicking} setIsPicking={setIsPicking}
        pickedColor={pickedColor}
        histograms={histograms}
        pushToHistory={pushToHistory}
        lut1={lut1} setLut1={setLut1}
        lut2={lut2} setLut2={setLut2}
        lutExportSize={lutExportSize} setLutExportSize={setLutExportSize}
        generateOutputLUT={generateOutputLUT}
        handleLutUpload={handleLutUpload}
        compareMode={compareMode} setCompareMode={setCompareMode}
        compareSlider={compareSlider} setCompareSlider={setCompareSlider}
        presets={presets}
        onSavePreset={savePreset}
        onApplyPreset={applyPreset}
        onDeletePreset={deletePreset}
        onApplyPresetToRoll={applyPresetToRoll}
        handleDownload={handleDownload} handleSave={handleSave} onClose={onClose}
      />
    </div>
  );
}

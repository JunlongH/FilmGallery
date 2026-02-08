/**
 * Try to evaluate the minified FilmLab function V and detect any TDZ error.
 */
const fs = require('fs');
const data = fs.readFileSync('client/build_debug/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

const vStart = line2.indexOf('function V({imageUrl:e');
const varGPos = line2.indexOf('var G=n(', vStart + 100);

// Extract just function V
const funcCode = line2.substring(vStart, varGPos);

// Try to parse it and check for V8 issues
// Create a test that mocks React and runs the function
const testCode = `
'use strict';
const r = {
  useRef: (v) => ({ current: v }),
  useState: (v) => [v, () => {}],
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useCallback: (fn) => fn,
  memo: (c) => c,
};
const f = {
  computeWBGains: () => ({ r: 1, g: 1, b: 1 }),
  PREVIEW_MAX_WIDTH_CLIENT: 2000,
  EXPORT_MAX_WIDTH: 4000,
  getEffectiveInverted: () => false,
  isRawFile: () => false,
  requiresServerDecode: () => false,
  RenderCore: class { processPixel() { return [0,0,0]; } processPixelFloat() { return [0,0,0]; } },
  DEFAULT_HSL_PARAMS: {},
  DEFAULT_SPLIT_TONE_PARAMS: {},
  buildCompositeFloatCurveLUT: () => null,
  buildCombinedLUT: () => null,
  solveTempTintFromSample: () => ({}),
  isDefaultHSLParams: () => true,
  isDefaultSplitToneParams: () => true,
};
const i = { nk: async () => null, m3: async () => null };
const a = { bf: async () => ({}) };
const n = (id) => ({});
const s = { jsx: () => null, jsxs: () => null, Fragment: 'fragment' };
function z() { return true; } // isWebGLAvailable
const l = { processImageWebGL: () => null, isWebGLAvailable: () => true };
const c = { getCurveLUT: () => new Float32Array(256), parseCubeLUT: () => null, getMaxSafeRect: () => ({x:0,y:0,w:1,h:1}), getPresetRatio: () => null, getExifOrientation: () => 0 };
const d = () => null; // FilmLabControls
const U = () => null; // FilmLabCanvas
const j = () => null; // PhotoSwitcher
const smartFilmlabPreview = async () => ({ ok: false });
const smartRenderPositive = async () => ({});
const smartExportPositive = async () => ({});
const getCurveLUT = () => new Float32Array(256);
const parseCubeLUT = () => null;
const getMaxSafeRect = () => ({x:0,y:0,w:1,h:1});
const getPresetRatio = () => null;
const getExifOrientation = () => 0;

try {
  ${funcCode}
  
  // Try to call V with minimal props
  const result = V({ 
    imageUrl: 'test.jpg',
    onClose: () => {},
    onSave: () => {},
    rollId: 1,
    photoId: 1,
    onPhotoUpdate: () => {},
  });
  console.log('V executed successfully');
  console.log('Result type:', typeof result);
} catch (err) {
  console.error('ERROR:', err.constructor.name, '-', err.message);
  console.error('Stack:', err.stack?.split('\\n').slice(0, 5).join('\\n'));
}
`;

try {
  eval(testCode);
} catch (err) {
  console.error('Outer error:', err.message);
}

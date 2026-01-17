
try {
  const libraw = require('libraw-wasm');
  console.log('Type of libraw:', typeof libraw);
  console.log('Keys of libraw:', Object.keys(libraw));
  if (typeof libraw === 'object') {
      console.log('libraw prototype:', Object.getPrototypeOf(libraw));
  }
} catch (e) {
  console.error('Error requiring libraw-wasm:', e);
}


try {
  const libraw = require('libraw-wasm');
  console.log('libraw.default:', libraw.default);
  console.log('Type of libraw.default:', typeof libraw.default);
  
  if (libraw.default) {
      console.log('Keys of libraw.default:', Object.keys(libraw.default));
      if (typeof libraw.default === 'object' && libraw.default.init) {
          console.log('Has init method');
      }
  }
} catch (e) {
  console.error('Error:', e);
}

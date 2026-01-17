
try {
  const librawPkg = require('libraw-wasm');
  const LibRaw = librawPkg.default || librawPkg;
  
  console.log('Attempting to instantiate...');
  const instance = new LibRaw();
  console.log('Instance created:', instance);
  console.log('Instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(instance)));

} catch (e) {
  console.error('Error:', e);
}

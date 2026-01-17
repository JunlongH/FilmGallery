
try {
  // Mock Worker
  class Worker {
      constructor(script) {
          console.log('Worker created with script:', script);
      }
      postMessage(msg) { console.log('Worker postMessage', msg); }
      terminate() {}
  }
  global.Worker = Worker;

  const librawPkg = require('libraw-wasm');
  const LibRaw = librawPkg.default || librawPkg;
  
  console.log('Attempting to instantiate with Mock Worker...');
  const instance = new LibRaw();
  console.log('Instance created successfully');

} catch (e) {
  console.error('Error:', e);
}

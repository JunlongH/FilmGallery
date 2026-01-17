
try {
  if (typeof global.Worker === 'undefined') {
    global.Worker = require('web-worker');
  }
} catch (e) {
  console.warn('Failed to polyfill Worker:', e);
}

const fs = require('fs');

async function test() {
  try {
    const librawPkg = require('libraw-wasm');
    const LibRaw = librawPkg.default || librawPkg;
    
    console.log('Instantiating LibRaw...');
    const instance = new LibRaw();
    
    console.log('Instance keys:', Object.keys(instance));
    
    const proto = Object.getPrototypeOf(instance);
    console.log('Prototype methods:', Object.getOwnPropertyNames(proto));
    
    // Check deep prototype chain just in case
    let currentProto = proto;
    while (currentProto && currentProto !== Object.prototype) {
        console.log('Proto chain methods:', Object.getOwnPropertyNames(currentProto));
        currentProto = Object.getPrototypeOf(currentProto);
    }

  } catch (e) {
    console.error('Error:', e);
  }
}

test();

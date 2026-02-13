const fs = require('fs');
const data = fs.readFileSync('client/build/static/js/main.db78f254.js', 'utf8');

// Find function K's body and check for 'K' being redeclared within
const start = data.indexOf('function K({imageUrl:e,');
console.log('Function K starts at offset:', start);

// Find the end of function K by counting braces (simplified - skip strings)
let depth = 0, i = start;
for (; i < data.length; i++) {
  const c = data[i];
  if (c === '{') depth++;
  if (c === '}') { depth--; if (depth === 0) break; }
}
const funcBody = data.substring(start, i + 1);
console.log('Function K length:', funcBody.length);

// Search for const/let/var K within the function body
const re = /\b(const|let|var)\s+(\[.*?\bK\b.*?\]|K)\s*=/g;
let m;
let count = 0;
while ((m = re.exec(funcBody)) !== null) {
  count++;
  console.log('Found K declaration at offset', m.index, ':', funcBody.substring(m.index, m.index + 80));
}
console.log('Total K declarations found:', count);

// Now check for 'e' declarations at the top level of function K
// Get the first statement (the massive const declaration)
const bodyStart = funcBody.indexOf('{') + 1;
console.log('\nFirst 500 chars of function body:');
console.log(funcBody.substring(bodyStart, bodyStart + 500));

// Check if 'e' appears as a destructured variable in the top-level const
// The giant const starts right after the opening brace
const constStart = funcBody.indexOf('const ', bodyStart);
if (constStart !== -1) {
  // Find where this const declaration ends (at the matching semicolon)
  console.log('\nConst declaration starts at offset:', constStart - start);
  console.log('Const start:', funcBody.substring(constStart, constStart + 100));
}

// Check for collapse_vars/reduce_vars patterns:
// Look for any place where 'e' is used before declaration in the top scope
// Specifically look for patterns like: ...e... const [...,e,...] = ...
// Or: e = something; ... const e = ...

// Also search for the exact old error pattern
const oldBuild = fs.existsSync('client/build_debug/static/js/main.1c49ed4b.js');
console.log('\nOld build exists:', oldBuild);

// Try to run function K in isolation (like we did with V)
console.log('\n=== Attempting to execute function K in isolation ===');

// Extract K function
const funcStr = funcBody;

// Create mock environment
const mockCode = `
const React = {
  useState: (init) => [init, () => {}],
  useRef: (init) => ({ current: init }),
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useContext: () => ({}),
  createContext: () => ({}),
  memo: (c) => c,
  forwardRef: (c) => c,
  Fragment: 'Fragment',
  createElement: (...args) => ({ type: args[0], props: args[1] }),
};
const r = React;
const a = { createContext: () => ({}), useContext: () => ({}) };
const s = { A: () => ['/test', () => {}], M: () => ({}) };
const l = { B: () => ({}), I: () => ({}) };
const c = { c: () => ({}) };
const d = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
const p = d;
const u = () => ({});
const h = () => ({});

// Try calling K
try {
  ${funcStr}
  console.log('Function K defined successfully');
  K({ imageUrl: 'test.jpg', onClose: ()=>{}, onSave: ()=>{} });
  console.log('Function K executed without TDZ error!');
} catch(err) {
  console.log('Error:', err.constructor.name, err.message);
  if (err instanceof ReferenceError) {
    console.log('>>> TDZ ERROR DETECTED! <<<');
  }
}
`;

try {
  const vm = require('vm');
  const script = new vm.Script(mockCode);
  script.runInNewContext({
    console,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
  });
} catch (err) {
  console.log('VM Error:', err.message);
}

/**
 * Find block-level (only {}) let/const 'e' declarations in function V
 * that could shadow the parameter 'e' at the function body level.
 */
const fs = require('fs');

const data = fs.readFileSync('client/build/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

const bodyStart = 982608; // '{' of function V body
const vEnd = 1025422;     // start of function W

// Track only { } for block depth. Depth 0 = function V's body level
let depth = 0;
let inString = false;
let stringChar = '';
const topLevelDecls = [];
const firstEUses = [];

for (let i = bodyStart + 1; i < vEnd; i++) {
  const c = line2[i];
  
  // Handle strings (simple approach)
  if (inString) {
    if (c === stringChar && line2[i - 1] !== '\\') {
      inString = false;
    }
    continue;
  }
  
  if (c === '"' || c === "'" || c === '`') {
    inString = true;
    stringChar = c;
    continue;
  }
  
  // Track only braces
  if (c === '{') depth++;
  if (c === '}') depth--;
  
  // At the function body's top-level block scope (depth 0)
  if (depth === 0) {
    const sub = line2.substring(i, i + 10);
    // Check for let e, const e, var e as standalone declarations
    if (sub.startsWith('let e') && /[=,;)]/.test(line2[i + 5])) {
      topLevelDecls.push({
        col: i,
        type: 'let',
        context: line2.substring(Math.max(0, i - 40), i + 50)
      });
    }
    if (sub.startsWith('const e') && /[=,;)]/.test(line2[i + 7])) {
      topLevelDecls.push({
        col: i,
        type: 'const',
        context: line2.substring(Math.max(0, i - 40), i + 50)
      });
    }
    if (sub.startsWith('var e') && /[=,;)]/.test(line2[i + 5])) {
      topLevelDecls.push({
        col: i,
        type: 'var',
        context: line2.substring(Math.max(0, i - 40), i + 50)
      });
    }
    
    // Check for destructuring declarations containing e: const [e,...] or const {e:...}
    // Only flag if we see ',e=' or ',e,' pattern after a const/let
    if (sub.startsWith(',e=') || sub.startsWith(',e,') || sub.startsWith(',e;')) {
      topLevelDecls.push({
        col: i,
        type: 'destructured-comma',
        context: line2.substring(Math.max(0, i - 40), i + 50)
      });
    }
  }
}

console.log('Block-level (depth 0, {} only) declarations of "e" in function V body:');
console.log('Found:', topLevelDecls.length);
topLevelDecls.forEach((d, i) => {
  console.log(`  ${i}: col=${d.col} type=${d.type}`);
  console.log(`     ${d.context}`);
});

// Now scan for uses of 'e' at depth 1 (inside first-level blocks like useMemo callbacks)
// where 'e' might be in TDZ due to a const/let e declaration later in that block
console.log('\n--- Checking for const/let e pattern in depth-1 blocks ---');
depth = 0;
inString = false;
let blockStack = [];

for (let i = bodyStart + 1; i < vEnd; i++) {
  const c = line2[i];
  
  if (inString) {
    if (c === stringChar && line2[i - 1] !== '\\') inString = false;
    continue;
  }
  
  if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; continue; }
  
  if (c === '{') {
    depth++;
    blockStack.push(i);
  }
  if (c === '}') {
    depth--;
    blockStack.pop();
  }
}

// Also check: is there a module-level 'let e' or 'const e' BEFORE function V?
console.log('\n--- Module-level let/const e BEFORE function V ---');
const regionBefore = line2.substring(Math.max(0, 982400), 982448);
let beforeDecls = [];
for (let i = 0; i < regionBefore.length; i++) {
  if (regionBefore.substring(i, i + 6) === 'let e=' || 
      regionBefore.substring(i, i + 8) === 'const e=') {
    beforeDecls.push(regionBefore.substring(Math.max(0, i - 20), i + 20));
  }
}
console.log('Found before V:', beforeDecls.length);
beforeDecls.forEach(d => console.log(' ', d));

// Check module-level 'let e' or 'const e' AFTER function V
console.log('\n--- Module-level let/const e AFTER function V ---');
const regionAfter = line2.substring(1025422, Math.min(line2.length, 1030000));
let afterDecls = [];
for (let i = 0; i < regionAfter.length; i++) {
  if (regionAfter.substring(i, i + 6) === 'let e=' || 
      regionAfter.substring(i, i + 8) === 'const e=') {
    afterDecls.push({
      col: 1025422 + i,
      ctx: regionAfter.substring(Math.max(0, i - 20), i + 20)
    });
  }
}
console.log('Found after V:', afterDecls.length);
afterDecls.forEach(d => console.log(`  col=${d.col}: ${d.ctx}`));

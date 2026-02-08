/**
 * Find top-level let/const declarations of 'e' inside function V in the minified bundle.
 * This tracks brace depth to distinguish top-level vs nested declarations.
 */
const fs = require('fs');

const data = fs.readFileSync('client/build/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

// Function V body starts after the parameter list closing ')'
// V parameters: {imageUrl:e,...,showPhotoSwitcher:A=!1}
const paramEnd = line2.indexOf('showPhotoSwitcher:A=!1})', 982448);
const bodyStart = paramEnd + 'showPhotoSwitcher:A=!1})'.length; // points to '{'
console.log('Body starts at column:', bodyStart);
console.log('Context:', line2.substring(bodyStart, bodyStart + 50));

// Find function W to know where V ends
const wStart = line2.indexOf('function W(', 982448);
console.log('Function W starts at column:', wStart);

const vEnd = wStart;

// Track brace depth (start at 0 since we're inside the function body at depth 0)
let depth = 0;
let inString = false;
let stringChar = '';
const topLevelDecls = [];

for (let i = bodyStart + 1; i < vEnd; i++) {
  const c = line2[i];
  
  // Handle strings
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
  
  // Track braces
  if (c === '{' || c === '(' || c === '[') depth++;
  if (c === '}' || c === ')' || c === ']') depth--;
  
  // At top level (depth 0), look for let/const declarations of 'e'
  if (depth === 0) {
    const sub = line2.substring(i, i + 10);
    if (sub.startsWith('let e') && (line2[i + 5] === '=' || line2[i + 5] === ',' || line2[i + 5] === ';')) {
      topLevelDecls.push({
        col: i,
        type: 'let',
        context: line2.substring(Math.max(0, i - 30), i + 40)
      });
    }
    if (sub.startsWith('const e') && (line2[i + 7] === '=' || line2[i + 7] === ',' || line2[i + 7] === ';')) {
      topLevelDecls.push({
        col: i,
        type: 'const',
        context: line2.substring(Math.max(0, i - 30), i + 40)
      });
    }
    // Also check for 'var e'
    if (sub.startsWith('var e') && (line2[i + 5] === '=' || line2[i + 5] === ',' || line2[i + 5] === ';')) {
      topLevelDecls.push({
        col: i,
        type: 'var',
        context: line2.substring(Math.max(0, i - 30), i + 40)
      });
    }
  }
}

console.log('\nTop-level (depth 0) declarations of "e" in function V body:');
console.log('Found:', topLevelDecls.length);
topLevelDecls.forEach((d, i) => {
  console.log(`  ${i}: col=${d.col} type=${d.type}`);
  console.log(`     ${d.context}`);
});

// Also find ALL top-level references to just 'e' (not as part of other identifiers)
// This is harder but let's at least check for common patterns
console.log('\nFirst 10 uses of standalone "e" at depth 0:');
let eUses = 0;
depth = 0;
inString = false;
for (let i = bodyStart + 1; i < vEnd && eUses < 10; i++) {
  const c = line2[i];
  if (inString) {
    if (c === stringChar && line2[i - 1] !== '\\') inString = false;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; continue; }
  if (c === '{' || c === '(' || c === '[') depth++;
  if (c === '}' || c === ')' || c === ']') depth--;
  
  if (depth === 0 && c === 'e') {
    // Check it's a standalone 'e' (not part of another identifier)
    const prev = line2[i - 1];
    const next = line2[i + 1];
    const isIdChar = ch => /[a-zA-Z0-9_$]/.test(ch);
    if (!isIdChar(prev) && !isIdChar(next)) {
      eUses++;
      console.log(`  Use ${eUses}: col=${i} context: ...${line2.substring(Math.max(0, i - 15), i + 15)}...`);
    }
  }
}

const fs = require('fs');
const data = fs.readFileSync('client/build_debug/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

// Search with multi-char variable names too
const regex = /(?:const|let) ([a-zA-Z_$][a-zA-Z0-9_$]*)=\1(?![=>a-zA-Z_$0-9])/g;
let match;
const results = [];
while ((match = regex.exec(line2)) !== null) {
  results.push({
    col: match.index,
    varName: match[1],
    ctx: line2.substring(Math.max(0, match.index - 20), match.index + 80)
  });
}

console.log('Found', results.length, 'self-referencing const/let patterns:');
results.forEach(r => {
  console.log(`  col=${r.col} var=${r.varName}`);
  console.log(`  ctx: ${r.ctx}`);
  console.log();
});

// Also specifically check the pattern that user reported: 'e' before initialization
// Let's scan for any location where 'e' is used at module/scope level before its
// let/const declaration in the same scope
// Specifically look at the webpack module boundaries and check for scope-hoisting issues
console.log('\n--- Checking for webpack scope-hoisting TDZ for "e" ---');

// Find all top-level (not inside any function) variable declarations of 'e'
// In webpack scope-hoisted bundles, multiple modules share the same scope
// So if module A declares 'const e = ...' and module B (evaluated before A) references 'e', 
// that's a TDZ

// For this, we need to find ALL top-level scopes
// Let's look for patterns like: }()), or similar module boundary markers
// In CRA webpack 5, the bundle starts with a self-executing function

// Let's specifically check: is there a `const e` or `let e` at the webpack chunk's
// top level that could be accessed before initialization?
const topLevelPattern = /;(const|let|var) (e)[=,;]/g;
let topResults = [];
while ((match = topLevelPattern.exec(line2)) !== null) {
  if (topResults.length >= 20) break;
  topResults.push({
    col: match.index,
    kind: match[1],
    ctx: line2.substring(Math.max(0, match.index - 10), match.index + 40)
  });
}
console.log('Module-level-ish declarations of e:', topResults.length);
topResults.forEach(r => console.log(`  col=${r.col} ${r.kind}: ${r.ctx}`));

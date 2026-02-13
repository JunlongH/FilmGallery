/**
 * Search the ENTIRE minified bundle for `const e = e` or `let e = e` patterns
 * that could cause TDZ, excluding arrow functions (e => ...) which are safe.
 */
const fs = require('fs');
const data = fs.readFileSync('client/build_debug/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

// Find all 'const e=' or 'let e=' patterns
const results = [];
const regex = /(?:const|let)\s+e\s*=\s*e(?![=>])/g;
let match;
while ((match = regex.exec(line2)) !== null) {
  results.push({
    col: match.index,
    ctx: line2.substring(match.index, Math.min(match.index + 50, line2.length))
  });
}

console.log('Found', results.length, 'TDZ-candidate patterns (const/let e = e, NOT followed by =>):');
results.forEach(r => console.log(r.col, r.ctx));

// Also check for patterns like: const e=someFunc(e) where e hasn't been declared yet
// This would be: const e = ... ( e ... where e is an identifier being used before declared
// Let's check for 'const e=' followed by usage of 'e' that ISN'T in an arrow function
const regex2 = /(?:const|let)\s+e\s*=\s*[^;]*?\(e[,\)]/g;
const results2 = [];
while ((match = regex2.exec(line2)) !== null) {
  // Skip if 'e=>' or 'e =>' appears (arrow function)
  const snippet = line2.substring(match.index, match.index + 80);
  if (/e\s*=>/.test(snippet.substring(0, snippet.indexOf('(e')))) continue;
  if (results2.length >= 20) break;
  results2.push({
    col: match.index,
    ctx: snippet
  });
}

console.log('\nPatterns const/let e = ...(e...) :', results2.length);
results2.forEach(r => console.log(r.col, r.ctx));

// Broader check: Find any pattern in the whole bundle where a variable
// might reference itself in its initializer
// Pattern: (const|let) X = X where X is a single character
const regex3 = /(?:const|let) ([a-zA-Z_$])=\1(?![=>a-zA-Z_$])/g;
const results3 = [];
while ((match = regex3.exec(line2)) !== null) {
  results3.push({
    col: match.index,
    varName: match[1],
    ctx: line2.substring(match.index - 5, match.index + 40)
  });
  if (results3.length >= 30) break;
}

console.log('\nAll self-referencing const/let patterns (excluding arrows):');
console.log('Found:', results3.length);
results3.forEach(r => console.log(`  col=${r.col} var=${r.varName}: ${r.ctx}`));

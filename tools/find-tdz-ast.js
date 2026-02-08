/**
 * Use Acorn AST parser to find variable declarations that could cause TDZ
 * for the 'e' binding inside function V.
 */
const acorn = require('acorn');
const fs = require('fs');

const data = fs.readFileSync('client/build/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

// Extract function V's body (from start to end)
const vStart = line2.indexOf('function V({imageUrl:e', 982400);
// Find where function V ends - look for 'var G=n(' which is module-level code after V
const varGPos = line2.indexOf('var G=n(', vStart);
// V's closing brace is right before 'var G'
const vEndPos = varGPos;

// We need the full function V code
const funcVCode = '(' + line2.substring(vStart, vEndPos) + ')';
console.log('End chars:', line2.substring(vEndPos - 5, vEndPos + 5));

console.log('Parsing function V from column', vStart, 'to', vEndPos);
console.log('Code length:', funcVCode.length);

try {
  const ast = acorn.parse(funcVCode, {
    ecmaVersion: 2022,
    sourceType: 'script',
  });
  
  // Find the function declaration
  const exprStmt = ast.body[0];
  const func = exprStmt.expression; // The function expression wrapped in ()
  
  if (func.type !== 'FunctionDeclaration' && func.type !== 'FunctionExpression') {
    console.log('Unexpected type:', func.type);
    process.exit(1);
  }
  
  console.log('\nFunction name:', func.id?.name || '(anonymous)');
  console.log('Parameters:', func.params.length);
  
  // Get parameter names (from destructuring)
  const paramNames = new Set();
  func.params.forEach(p => {
    if (p.type === 'ObjectPattern') {
      p.properties.forEach(prop => {
        if (prop.value?.type === 'Identifier') paramNames.add(prop.value.name);
        if (prop.value?.type === 'AssignmentPattern' && prop.value.left?.type === 'Identifier') {
          paramNames.add(prop.value.left.name);
        }
      });
    }
    if (p.type === 'Identifier') paramNames.add(p.name);
  });
  console.log('Parameter names:', [...paramNames].join(', '));
  console.log('Has "e" as parameter:', paramNames.has('e'));
  
  // Check body for top-level let/const declarations
  const body = func.body;
  console.log('\nBody statements:', body.body.length);
  
  // Find any top-level (non-nested) VariableDeclaration with 'e'
  const topLevelEDecls = [];
  body.body.forEach((stmt, idx) => {
    if (stmt.type === 'VariableDeclaration') {
      stmt.declarations.forEach(decl => {
        const names = extractNames(decl.id);
        if (names.includes('e')) {
          topLevelEDecls.push({
            stmtIndex: idx,
            kind: stmt.kind,
            start: stmt.start,
            code: funcVCode.substring(stmt.start, Math.min(stmt.end, stmt.start + 100))
          });
        }
      });
    }
  });
  
  console.log('\nTop-level declarations containing "e":');
  console.log('Found:', topLevelEDecls.length);
  topLevelEDecls.forEach(d => {
    console.log(`  stmt #${d.stmtIndex}, kind: ${d.kind}, start: ${d.start}`);
    console.log(`  code: ${d.code}...`);
  });
  
  // Also list ALL top-level statement types
  console.log('\nAll', body.body.length, 'top-level statements:');
  body.body.forEach((stmt, i) => {
    let desc = stmt.type;
    if (stmt.type === 'VariableDeclaration') {
      const names = [];
      stmt.declarations.forEach(d => names.push(...extractNames(d.id)));
      desc += ` (${stmt.kind}) [${names.join(',')}]`;
    }
    if (stmt.type === 'ExpressionStatement') {
      desc += ` (${stmt.expression.type})`;
    }
    if (stmt.type === 'ReturnStatement') {
      desc += ' (JSX return)';
    }
    console.log(`  ${i}: ${desc}`);
  });
  
  // CRITICAL: Check ALL variable declarations in the entire function V AST 
  // for any that declare 'e' (at any depth)
  console.log('\n--- All "e" declarations at any depth ---');
  let allEDecls = [];
  function walkForEDecl(node, depth, path) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        const names = extractNames(decl.id);
        if (names.includes('e')) {
          allEDecls.push({
            depth,
            kind: node.kind,
            path,
            start: node.start,
            end: node.end,
            code: funcVCode.substring(node.start, Math.min(node.end, node.start + 80))
          });
        }
      }
    }
    // Also check catch clauses
    if (node.type === 'CatchClause' && node.param) {
      const names = extractNames(node.param);
      if (names.includes('e')) {
        allEDecls.push({
          depth,
          kind: 'catch',
          path,
          start: node.start,
          end: node.end,
          code: funcVCode.substring(node.start, Math.min(node.param.end + 5, node.start + 40))
        });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((item, idx) => {
          if (item && typeof item === 'object' && item.type) {
            walkForEDecl(item, depth + 1, path + '.' + key + '[' + idx + ']');
          }
        });
      } else if (child && typeof child === 'object' && child.type) {
        walkForEDecl(child, depth + 1, path + '.' + key);
      }
    }
  }
  walkForEDecl(func.body, 0, 'body');
  console.log('Total declarations containing "e":', allEDecls.length);
  // Show only catch clauses
  const catchDecls = allEDecls.filter(d => d.kind === 'catch');
  console.log('Catch clauses with "e":', catchDecls.length);
  catchDecls.forEach((d, i) => {
    console.log(`  ${i}: depth=${d.depth} code: ${d.code}`);
  });
  // Show non-for-loop, non-catch declarations
  const otherDecls = allEDecls.filter(d => d.kind !== 'catch');
  console.log('\nNon-catch declarations with "e":', otherDecls.length);
  otherDecls.slice(0, 20).forEach((d, i) => {
    console.log(`  ${i}: depth=${d.depth} kind=${d.kind} code: ${d.code}`);
  });
  
} catch (err) {
  console.error('Parse error:', err.message);
  console.error('At position:', err.pos);
  if (err.pos) {
    console.error('Context:', funcVCode.substring(err.pos - 30, err.pos + 30));
  }
}

function extractNames(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'ArrayPattern') {
    return node.elements.flatMap(el => el ? extractNames(el) : []);
  }
  if (node.type === 'ObjectPattern') {
    return node.properties.flatMap(p => extractNames(p.value));
  }
  if (node.type === 'AssignmentPattern') {
    return extractNames(node.left);
  }
  if (node.type === 'RestElement') {
    return extractNames(node.argument);
  }
  return [];
}

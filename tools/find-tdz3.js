/**
 * Analyze the OLD minified bundle (from build_debug) to find the actual 
 * runtime TDZ issue. We know the error is:
 *   ReferenceError: Cannot access 'e' before initialization
 * 
 * Let's look at the React error boundary stack trace components:
 *   V (FilmLab) -> W (ImageViewer?)
 * 
 * The error occurs during rendering. Let's check if 'e' is used in the 
 * return statement's JSX or in callback closures that run during render.
 */
const fs = require('fs');
const acorn = require('acorn');

const data = fs.readFileSync('client/build_debug/static/js/main.1c49ed4b.js', 'utf8');
const line2 = data.split('\n')[1];

const vStart = line2.indexOf('function V({imageUrl:e');
const varGPos = line2.indexOf('var G=n(', vStart + 100);

const funcCode = '(' + line2.substring(vStart, varGPos) + ')';
const ast = acorn.parse(funcCode, { ecmaVersion: 2022 });
const func = ast.body[0].expression;

// Get ALL body statements 
const body = func.body.body;
console.log('Total body statements:', body.length);

// The return statement is the last one - check for patterns where
// 'e' (imageUrl) is referenced
const returnStmt = body[body.length - 1];
console.log('Last statement type:', returnStmt.type);

// Let's look at the const declarations that use destructuring
// and see if any use the name 'e' in a way that could shadow
const stmt0 = body[0]; // The big const declaration
console.log('\nStmt 0 type:', stmt0.type, 'kind:', stmt0.kind);
console.log('Stmt 0 has', stmt0.declarations.length, 'declarators');

// Extract ALL variable names from stmt0
function extractNames(node) {
  if (!node) return [];
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'ArrayPattern') return node.elements.flatMap(el => el ? extractNames(el) : []);
  if (node.type === 'ObjectPattern') return node.properties.flatMap(p => extractNames(p.value));
  if (node.type === 'AssignmentPattern') return extractNames(node.left);
  if (node.type === 'RestElement') return extractNames(node.argument);
  return [];
}

const allNames = [];
stmt0.declarations.forEach(d => allNames.push(...extractNames(d.id)));
console.log('\nAll variable names in stmt0 (the big const):');
console.log(allNames.join(', '));
console.log('\nHas "e":', allNames.includes('e'));
console.log('Has "V":', allNames.includes('V'));

// This is critical: if the function is named V and a const declaration
// inside creates a variable V, we have a hoisting issue
if (allNames.includes('V')) {
  // Find which declarator has V
  for (let i = 0; i < stmt0.declarations.length; i++) {
    const names = extractNames(stmt0.declarations[i].id);
    if (names.includes('V')) {
      console.log('\n!!! FOUND V in declarator', i);
      const code = funcCode.substring(stmt0.declarations[i].start, stmt0.declarations[i].end);
      console.log('Code:', code.substring(0, 100));
      break;
    }
  }
}

// Check if 'e' is used in the initializer of any const declaration
// BEFORE any const/let 'e' declaration in the same block
// This is the classic TDZ pattern
console.log('\n--- Checking for TDZ in nested scopes ---');

// Let's check the useMemo/useEffect callbacks for patterns like:
// const e = someFunc(e) where e refers to the outer 'e' (imageUrl) 
// but a const e in the same callback scope creates TDZ

function findTDZPatterns(node, scopeVars = new Set(), path = '') {
  if (!node || typeof node !== 'object') return;
  
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    // New scope - collect all const/let declarations
    const bodyNode = node.body.type === 'BlockStatement' ? node.body : null;
    if (bodyNode) {
      const declaredVars = new Set();
      bodyNode.body.forEach(stmt => {
        if (stmt.type === 'VariableDeclaration' && (stmt.kind === 'let' || stmt.kind === 'const')) {
          stmt.declarations.forEach(d => {
            extractNames(d.id).forEach(n => declaredVars.add(n));
          });
        }
      });
      
      if (declaredVars.has('e')) {
        // Check if 'e' is used in this scope before its declaration
        // For simplicity, just report it
        const funcStart = node.start;
        const declStart = bodyNode.body.find(s => 
          s.type === 'VariableDeclaration' && 
          s.declarations.some(d => extractNames(d.id).includes('e'))
        )?.start || 0;
        
        console.log(`  Found 'e' declaration in scope at ${path}`);
        console.log(`  Function starts at: ${funcStart}, 'e' declared at: ${declStart}`);
        console.log(`  Code around declaration: ${funcCode.substring(declStart, declStart + 80)}`);
      }
    }
  }
  
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item, idx) => {
        if (item && typeof item === 'object' && item.type) {
          findTDZPatterns(item, scopeVars, `${path}.${key}[${idx}]`);
        }
      });
    } else if (child && typeof child === 'object' && child.type) {
      findTDZPatterns(child, scopeVars, `${path}.${key}`);
    }
  }
}

findTDZPatterns(func.body, new Set(), 'body');

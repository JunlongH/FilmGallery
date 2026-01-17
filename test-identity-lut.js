/**
 * 生成恒等 LUT（identity LUT）用于测试
 * 
 * 恒等 LUT 的特性：输入什么颜色，输出就是什么颜色
 * 如果 WebGL 使用恒等 LUT 后图像发生变化，说明 LUT 采样有问题
 */

const fs = require('fs');

function generateIdentityLUT(size = 17) {
  let content = `# Identity LUT for testing\n`;
  content += `LUT_3D_SIZE ${size}\n\n`;
  
  // .cube 格式：外层 B，中层 G，内层 R
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rNorm = r / (size - 1);
        const gNorm = g / (size - 1);
        const bNorm = b / (size - 1);
        content += `${rNorm.toFixed(6)} ${gNorm.toFixed(6)} ${bNorm.toFixed(6)}\n`;
      }
    }
  }
  
  return content;
}

// 生成红蓝互换 LUT 用于测试
function generateRedBlueSwapLUT(size = 17) {
  let content = `# Red-Blue Swap LUT for testing\n`;
  content += `LUT_3D_SIZE ${size}\n\n`;
  
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rNorm = r / (size - 1);
        const gNorm = g / (size - 1);
        const bNorm = b / (size - 1);
        // 交换 R 和 B
        content += `${bNorm.toFixed(6)} ${gNorm.toFixed(6)} ${rNorm.toFixed(6)}\n`;
      }
    }
  }
  
  return content;
}

// 生成
const identityLUT = generateIdentityLUT(17);
const rbSwapLUT = generateRedBlueSwapLUT(17);

fs.writeFileSync('test-identity.cube', identityLUT);
fs.writeFileSync('test-rb-swap.cube', rbSwapLUT);

console.log('Generated:');
console.log('  - test-identity.cube (should not change image)');
console.log('  - test-rb-swap.cube (should swap R and B channels)');
console.log('\nUse these files to test the LUT system:');
console.log('1. Load test-identity.cube - if image changes, LUT sampling is wrong');
console.log('2. Load test-rb-swap.cube - if R and B are NOT swapped, there is an issue');

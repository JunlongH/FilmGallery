/**
 * Hough Transform for Line Detection
 * 
 * 实现 Hough 变换检测直线
 * 
 * @module packages/shared/edgeDetection/houghTransform
 */

/**
 * Hough 变换检测直线
 * 
 * @param {Uint8Array} edges - 边缘图 (255=边缘, 0=非边缘)
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} threshold - 投票阈值 (默认 100)
 * @param {number} thetaResolution - 角度分辨率 (度，默认 1)
 * @param {number} rhoResolution - 距离分辨率 (像素，默认 1)
 * @returns {Array<{rho: number, theta: number, votes: number}>} 检测到的直线
 */
function detect(edges, width, height, threshold = 100, thetaResolution = 1, rhoResolution = 1) {
  // 参数空间
  const diagLen = Math.ceil(Math.sqrt(width * width + height * height));
  const numRhos = Math.ceil(diagLen * 2 / rhoResolution);
  const numThetas = Math.ceil(180 / thetaResolution);
  
  // 累加器
  const accumulator = new Int32Array(numRhos * numThetas);
  
  // 预计算 sin/cos 查找表
  const cosTheta = new Float32Array(numThetas);
  const sinTheta = new Float32Array(numThetas);
  const thetaValues = new Float32Array(numThetas);
  
  for (let t = 0; t < numThetas; t++) {
    const theta = (t * thetaResolution - 90) * Math.PI / 180;
    thetaValues[t] = theta;
    cosTheta[t] = Math.cos(theta);
    sinTheta[t] = Math.sin(theta);
  }
  
  // 投票
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 0) continue;
      
      for (let t = 0; t < numThetas; t++) {
        const rho = x * cosTheta[t] + y * sinTheta[t];
        const rhoIndex = Math.round((rho + diagLen) / rhoResolution);
        
        if (rhoIndex >= 0 && rhoIndex < numRhos) {
          accumulator[rhoIndex * numThetas + t]++;
        }
      }
    }
  }
  
  // 提取峰值 (局部最大值)
  const lines = [];
  const neighborhoodSize = 5;
  
  for (let r = neighborhoodSize; r < numRhos - neighborhoodSize; r++) {
    for (let t = neighborhoodSize; t < numThetas - neighborhoodSize; t++) {
      const votes = accumulator[r * numThetas + t];
      
      if (votes < threshold) continue;
      
      // 检查是否为局部最大值
      let isMax = true;
      for (let dr = -neighborhoodSize; dr <= neighborhoodSize && isMax; dr++) {
        for (let dt = -neighborhoodSize; dt <= neighborhoodSize && isMax; dt++) {
          if (dr === 0 && dt === 0) continue;
          if (accumulator[(r + dr) * numThetas + (t + dt)] > votes) {
            isMax = false;
          }
        }
      }
      
      if (isMax) {
        const rho = (r * rhoResolution) - diagLen;
        const theta = thetaValues[t];
        lines.push({ rho, theta, votes });
      }
    }
  }
  
  // 按票数降序排序
  lines.sort((a, b) => b.votes - a.votes);
  
  return lines;
}

/**
 * 合并相似的直线
 * 
 * @param {Array} lines - 直线列表
 * @param {number} rhoThreshold - rho 合并阈值 (像素)
 * @param {number} thetaThreshold - theta 合并阈值 (度)
 * @returns {Array} 合并后的直线列表
 */
function mergeLines(lines, rhoThreshold = 20, thetaThreshold = 10) {
  if (lines.length === 0) return [];
  
  const thetaThresholdRad = thetaThreshold * Math.PI / 180;
  const merged = [];
  const used = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    
    const line = lines[i];
    let rhoSum = line.rho * line.votes;
    let thetaSum = line.theta * line.votes;
    let votesSum = line.votes;
    let count = 1;
    
    used.add(i);
    
    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;
      
      const other = lines[j];
      const rhoDiff = Math.abs(line.rho - other.rho);
      let thetaDiff = Math.abs(line.theta - other.theta);
      
      // 处理角度周期性
      if (thetaDiff > Math.PI) {
        thetaDiff = 2 * Math.PI - thetaDiff;
      }
      
      if (rhoDiff <= rhoThreshold && thetaDiff <= thetaThresholdRad) {
        // 加权平均
        rhoSum += other.rho * other.votes;
        thetaSum += other.theta * other.votes;
        votesSum += other.votes;
        count++;
        used.add(j);
      }
    }
    
    merged.push({
      rho: rhoSum / votesSum,
      theta: thetaSum / votesSum,
      votes: votesSum,
      mergedCount: count
    });
  }
  
  return merged;
}

/**
 * 将直线分类为水平和垂直两组
 * 
 * @param {Array} lines - 直线列表
 * @param {number} tolerance - 角度容差 (度)
 * @returns {Object} { horizontal: [], vertical: [] }
 */
function classifyLines(lines, tolerance = 20) {
  const horizontal = [];
  const vertical = [];
  const toleranceRad = tolerance * Math.PI / 180;
  
  for (const line of lines) {
    // theta 接近 0 或 π 为垂直线 (x*cos(0) + y*sin(0) = x = rho)
    // theta 接近 π/2 或 -π/2 为水平线 (y = rho)
    const absTheta = Math.abs(line.theta);
    
    if (absTheta < toleranceRad || Math.abs(absTheta - Math.PI) < toleranceRad) {
      // 接近垂直
      vertical.push(line);
    } else if (Math.abs(absTheta - Math.PI / 2) < toleranceRad) {
      // 接近水平
      horizontal.push(line);
    }
    // 其他斜线暂时忽略
  }
  
  return { horizontal, vertical };
}

/**
 * 获取两条平行线之间的距离
 * 
 * @param {Object} line1 - 直线 1
 * @param {Object} line2 - 直线 2
 * @returns {number} 距离
 */
function parallelLineDistance(line1, line2) {
  // 对于平行线，距离 = |rho1 - rho2| / sqrt(cos²θ + sin²θ) = |rho1 - rho2|
  return Math.abs(line1.rho - line2.rho);
}

/**
 * 计算直线的端点 (在图像边界内)
 * 
 * @param {Object} line - 直线 {rho, theta}
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @returns {Array<{x: number, y: number}>} 两个端点
 */
function getLineEndpoints(line, width, height) {
  const { rho, theta } = line;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  
  const points = [];
  
  // 检查与四条边的交点
  // 左边 (x=0): 0*cos + y*sin = rho => y = rho/sin
  if (Math.abs(sin) > 1e-10) {
    const y = rho / sin;
    if (y >= 0 && y <= height) {
      points.push({ x: 0, y });
    }
  }
  
  // 右边 (x=width): width*cos + y*sin = rho => y = (rho - width*cos)/sin
  if (Math.abs(sin) > 1e-10) {
    const y = (rho - width * cos) / sin;
    if (y >= 0 && y <= height) {
      points.push({ x: width, y });
    }
  }
  
  // 上边 (y=0): x*cos + 0*sin = rho => x = rho/cos
  if (Math.abs(cos) > 1e-10) {
    const x = rho / cos;
    if (x >= 0 && x <= width) {
      points.push({ x, y: 0 });
    }
  }
  
  // 下边 (y=height): x*cos + height*sin = rho => x = (rho - height*sin)/cos
  if (Math.abs(cos) > 1e-10) {
    const x = (rho - height * sin) / cos;
    if (x >= 0 && x <= width) {
      points.push({ x, y: height });
    }
  }
  
  // 去重并返回前两个点
  const unique = [];
  for (const p of points) {
    const isDuplicate = unique.some(u => 
      Math.abs(u.x - p.x) < 1 && Math.abs(u.y - p.y) < 1
    );
    if (!isDuplicate) {
      unique.push(p);
    }
    if (unique.length >= 2) break;
  }
  
  return unique;
}

module.exports = {
  detect,
  mergeLines,
  classifyLines,
  parallelLineDistance,
  getLineEndpoints
};

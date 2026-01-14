/**
 * useExposureMonitorSimple Hook - TypeScript Migration
 * 
 * 最简化实现：只使用Camera的onPreviewStarted回调
 * 不需要Frame Processor，不需要native plugin
 * 缺点：更新频率较低，数据可能不准确
 */

import { useState, useCallback } from 'react';

interface ExposureData {
  iso: number;
  shutterSpeed: number;
  aperture: number;
  ev: string | null;
  compensation: string | null;
}

interface CameraMetadata {
  iso?: number;
  sensitivity?: number;
  exposureTime?: number | string;
  exposure?: number | string;
  aperture?: number;
  fNumber?: number;
}

interface UseExposureMonitorSimpleResult {
  exposureData: ExposureData | null;
  updateCount: number;
  handleCameraUpdate: (metadata: CameraMetadata) => void;
}

export function useExposureMonitorSimple(filmIso: number = 400): UseExposureMonitorSimpleResult {
  const [exposureData, setExposureData] = useState<ExposureData | null>(null);
  const [updateCount, setUpdateCount] = useState(0);

  // 从Camera的onPreviewStarted或其他回调中调用
  const handleCameraUpdate = useCallback((metadata: CameraMetadata) => {
    console.log('[ExposureMonitor-Simple] Camera update:', metadata);
    
    try {
      // 尝试从metadata中提取曝光信息
      // 注意：不同设备可能提供不同的字段
      const iso = metadata?.iso || metadata?.sensitivity;
      const exposure = metadata?.exposureTime || metadata?.exposure;
      const aperture = metadata?.aperture || metadata?.fNumber || 1.8; // 默认值
      
      if (iso && exposure) {
        const shutterSpeed = typeof exposure === 'number' ? exposure : parseFloat(exposure);
        
        // 计算EV
        const evCalc = Math.log2((iso / 100) * (1 / shutterSpeed) * (aperture * aperture));
        const evValue = isFinite(evCalc) ? evCalc.toFixed(1) : null;
        
        // 计算补偿
        const filmEV = Math.log2((filmIso / 100) * (1 / shutterSpeed) * (aperture * aperture));
        const compensation = isFinite(filmEV) ? (filmEV - evCalc).toFixed(1) : null;
        
        setExposureData({
          iso,
          shutterSpeed,
          aperture,
          ev: evValue,
          compensation,
        });
        
        setUpdateCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('[ExposureMonitor-Simple] Error:', err);
    }
  }, [filmIso]);

  return {
    exposureData,
    updateCount,
    handleCameraUpdate,
  };
}

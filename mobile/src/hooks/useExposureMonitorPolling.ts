/**
 * useExposureMonitorPolling Hook - TypeScript Migration
 * 
 * 备用方案：使用定时轮询而不是Frame Processor
 * 如果Frame Processor无法工作，可以切换到这个实现
 */

import { useEffect, useState, useRef } from 'react';
import { NativeModules } from 'react-native';

const { ExposureModule } = NativeModules as {
  ExposureModule?: {
    getCurrentExposure: () => Promise<{
      iso: number;
      exposureDuration: number;
      aperture: number;
    } | null>;
  };
};

interface ExposureData {
  iso: number;
  shutterSpeed: number;
  aperture: number;
  ev: string | null;
  compensation: string | null;
}

interface UseExposureMonitorPollingResult {
  exposureData: ExposureData | null;
  frameCount: number;
  error: string | null;
  isPolling: boolean;
}

export function useExposureMonitorPolling(
  filmIso: number = 400,
  interval: number = 200
): UseExposureMonitorPollingResult {
  const [exposureData, setExposureData] = useState<ExposureData | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    console.log('[ExposureMonitor-Polling] Starting with ISO:', filmIso);
    
    // 检查native module是否可用
    if (!ExposureModule) {
      console.error('[ExposureMonitor-Polling] ExposureModule not available');
      setError('Native module not found');
      return;
    }

    // 启动定时轮询
    timerRef.current = setInterval(async () => {
      try {
        // 调用native方法获取当前曝光数据
        const data = await ExposureModule.getCurrentExposure();
        
        if (data && data.iso) {
          const { iso, exposureDuration, aperture } = data;
          
          // 计算EV值
          const evCalc = Math.log2((iso / 100) * (1 / exposureDuration) * (aperture * aperture));
          const evValue = isFinite(evCalc) ? evCalc.toFixed(1) : null;
          
          // 计算补偿
          const filmEV = Math.log2((filmIso / 100) * (1 / exposureDuration) * (aperture * aperture));
          const compensation = isFinite(filmEV) ? (filmEV - evCalc).toFixed(1) : null;
          
          setExposureData({
            iso,
            shutterSpeed: exposureDuration,
            aperture,
            ev: evValue,
            compensation,
          });
          
          setFrameCount(prev => {
            const newCount = prev + 1;
            if (newCount % 30 === 0) {
              console.log(`[ExposureMonitor-Polling] Frame ${newCount}: ISO=${iso}, Shutter=${exposureDuration}, Aperture=${aperture}, EV=${evValue}`);
            }
            return newCount;
          });
        }
      } catch (err) {
        console.error('[ExposureMonitor-Polling] Error:', err);
        setError((err as Error).message);
      }
    }, interval);

    // 清理
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        console.log('[ExposureMonitor-Polling] Stopped');
      }
    };
  }, [filmIso, interval]);

  return { 
    exposureData, 
    frameCount, 
    error,
    isPolling: !!timerRef.current 
  };
}

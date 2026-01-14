/**
 * useExposurePolling Hook - TypeScript Migration
 * 
 * 轮询版本曝光监控
 * 完全绕过Frame Processor，使用定时器轮询native module
 * 
 * 优点：
 * - 不依赖Frame Processor / Worklets
 * - 简单可靠
 * - 兼容性好
 * 
 * 缺点：
 * - 更新频率略低（但对测光足够）
 * - 轻微性能开销
 */

import { useEffect, useState, useRef } from 'react';
import { NativeModules } from 'react-native';

interface ExposureReaderModule {
  getCurrentExposure: () => Promise<{
    iso?: number;
    exposureDuration?: number;
    aperture?: number;
  } | null>;
  getDebugInfo: () => Promise<Record<string, unknown>>;
  startLightSensor?: () => void;
  stopLightSensor?: () => void;
  startCameraX?: () => Promise<void>;
  stopCameraX?: () => Promise<void>;
}

const { ExposureReaderSimple } = NativeModules as {
  ExposureReaderSimple?: ExposureReaderModule;
};

interface ExposureData {
  iso: number;
  shutterSpeed: number;
  aperture: number;
  ev: number | null;
  compensation: number | null;
}

interface UseExposurePollingResult {
  exposureData: ExposureData | null;
  frameCount: number;
  lastUpdate: number | null;
  isActive: boolean;
}

export function useExposurePolling(
  filmIso: number = 400,
  intervalMs: number = 200
): UseExposurePollingResult {
  const [exposureData, setExposureData] = useState<ExposureData | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    console.log('[ExposurePolling] Starting with ISO:', filmIso, 'interval:', intervalMs);
    
    // 检查native module
    if (!ExposureReaderSimple) {
      console.error('[ExposurePolling] ExposureReaderSimple module not found!');
      console.error('[ExposurePolling] Available modules:', Object.keys(NativeModules));
      return;
    }

    // 启动光线传感器作为回退方案
    ExposureReaderSimple.startLightSensor?.();

    // 获取调试信息
    ExposureReaderSimple.getDebugInfo()
      .then(info => {
        console.log('[ExposurePolling] Native module debug info:', info);
      })
      .catch(err => {
        console.error('[ExposurePolling] Failed to get debug info:', err);
      });

    let successCount = 0;
    let failCount = 0;

    // 启动轮询
    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return;

      ExposureReaderSimple.getCurrentExposure()
        .then(data => {
          if (!mountedRef.current) return;

          if (data && data.iso && data.exposureDuration) {
            successCount++;
            
            const { iso, exposureDuration, aperture = 1.8 } = data;
            
            // 计算EV值
            const ev100 = Math.log2((aperture * aperture) / exposureDuration) - Math.log2(iso / 100);
            const targetEV = ev100 + Math.log2(filmIso / 100);
            
            // 计算补偿
            const compensation = targetEV - ev100;
            
            const newData: ExposureData = {
              iso,
              shutterSpeed: exposureDuration,
              aperture,
              ev: Number.isFinite(targetEV) ? parseFloat(targetEV.toFixed(1)) : null,
              compensation: Number.isFinite(compensation) ? parseFloat(compensation.toFixed(1)) : null,
            };
            
            setExposureData(newData);
            setFrameCount(prev => prev + 1);
            setLastUpdate(Date.now());
            
            // 每10次成功打印一次
            if (successCount % 10 === 1) {
              console.log(`[ExposurePolling] #${successCount}: ISO=${iso}, Shutter=${exposureDuration.toFixed(4)}s, Aperture=${aperture}, EV=${targetEV.toFixed(1)}`);
            }
            
          } else {
            // 没有数据，但不是错误
            failCount++;
            if (failCount % 30 === 1) {
              console.warn(`[ExposurePolling] No exposure data (${failCount} times). Native module may not have access to camera.`);
            }
          }
        })
        .catch(err => {
          failCount++;
          if (failCount % 30 === 1) {
            console.error('[ExposurePolling] Error:', err);
          }
        });
    }, intervalMs);

    console.log(`[ExposurePolling] Timer started (interval: ${intervalMs}ms)`);

    // 清理
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        console.log(`[ExposurePolling] Stopped. Success: ${successCount}, Fail: ${failCount}`);
      }
      // 停止光线传感器
      ExposureReaderSimple?.stopLightSensor?.();
      // 停止 CameraX
      ExposureReaderSimple?.stopCameraX?.().catch(() => {});
    };
  }, [filmIso, intervalMs]);

  return {
    exposureData,
    frameCount,
    lastUpdate,
    isActive: !!timerRef.current,
  };
}

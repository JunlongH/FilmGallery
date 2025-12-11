import { useState, useEffect } from 'react';
import { APERTURES, parseShutter, findClosestShutter } from './cameraUtils';

/**
 * Hook to calculate EV and target settings based on camera readings
 * @param {object} cameraData - { iso, shutterSpeed, aperture }
 * @param {number} filmIso - Target Film ISO
 * @param {string} mode - 'av' | 'tv' | 'ps'
 * @param {number|string} selectedValue - Selected Aperture (for Av) or Shutter (for Tv)
 */
export function useExposureCalculator(cameraData, filmIso, mode, selectedValue) {
  const [result, setResult] = useState({
    ev: 0,
    displayEv: '0.0',
    targetAperture: 5.6,
    targetShutter: '1/125',
    isValid: false
  });

  useEffect(() => {
    if (!cameraData || !cameraData.iso || !cameraData.shutterSpeed) {
      setResult(prev => ({ ...prev, isValid: false }));
      return;
    }

    const { iso, shutterSpeed, aperture } = cameraData;

    // 1. Calculate Scene EV (EV100)
    // Formula: EV = log2(N^2 / t) - log2(ISO/100)
    // N = aperture, t = shutter speed
    const ev100 = Math.log2((aperture * aperture) / shutterSpeed) - Math.log2(iso / 100);
    
    // 2. Calculate Target EV for Film ISO
    // Target EV = EV100 + log2(FilmISO / 100)
    const targetEV = ev100 + Math.log2(filmIso / 100);

    let finalAperture = 5.6;
    let finalShutter = '1/125';

    if (mode === 'av') {
      // Aperture Priority: User sets Aperture (N), we calc Shutter (t)
      // t = N^2 / 2^EV
      finalAperture = Number(selectedValue);
      const t = (finalAperture * finalAperture) / Math.pow(2, targetEV);
      finalShutter = findClosestShutter(t);
    } else if (mode === 'tv') {
      // Shutter Priority: User sets Shutter (t), we calc Aperture (N)
      // N = sqrt(t * 2^EV)
      const t = parseShutter(selectedValue);
      const N_sq = t * Math.pow(2, targetEV);
      const N = Math.sqrt(N_sq);
      
      // Find closest standard aperture
      finalAperture = APERTURES.reduce((prev, curr) => 
        Math.abs(curr - N) < Math.abs(prev - N) ? curr : prev
      );
      finalShutter = selectedValue;
    } else {
      // P&S (Program): Just show current camera settings or a balanced pair
      // For simplicity, let's just show what the camera is doing, adjusted for ISO difference
      // But usually P&S means "give me a good pair".
      // Let's default to f/5.6 and calculate shutter
      finalAperture = 5.6;
      const t = (finalAperture * finalAperture) / Math.pow(2, targetEV);
      finalShutter = findClosestShutter(t);
    }

    setResult({
      ev: targetEV,
      displayEv: targetEV.toFixed(1),
      targetAperture: finalAperture,
      targetShutter: finalShutter,
      isValid: true
    });

  }, [cameraData, filmIso, mode, selectedValue]);

  return result;
}

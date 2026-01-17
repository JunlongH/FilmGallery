import { useState, useEffect } from 'react';
import { generatePreview } from '../utils/previewUtils';

/**
 * Hook to generate preview URLs for a list of files.
 * Handles RAW/TIFF thumbnail extraction asynchronously.
 * Automatically manages URL cleanup (revokeObjectURL).
 * 
 * @param {File[]} files 
 * @returns {Array<{url: string, name: string}>}
 */
export function useFilePreviews(files) {
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    let isActive = true;
    const generatedUrls = [];

    const loadPreviews = async () => {
      if (!files || files.length === 0) {
        if (isActive) setPreviews([]);
        return;
      }

      // Create placeholders / promises
      const promises = files.map(async (file) => {
        try {
          const url = await generatePreview(file);
          return { url, name: file.name };
        } catch (e) {
          console.error('Preview error', e);
          return { url: null, name: file.name };
        }
      });

      const results = await Promise.all(promises);

      if (isActive) {
        // Filter out nulls if needed, or keep them with placeholders? 
        // Current existing logic assumes {url, name}
        // We'll keep them, maybe UI handles broken images gracefully.
        setPreviews(results);

        // Track blob URLs for cleanup
        results.forEach(item => {
          if (item.url && item.url.startsWith('blob:')) {
            generatedUrls.push(item.url);
          }
        });
      } else {
        // If component unmounted or files changed before we finished, cleanup immediately
        results.forEach(item => {
          if (item.url && item.url.startsWith('blob:')) {
            URL.revokeObjectURL(item.url);
          }
        });
      }
    };

    loadPreviews();

    // Cleanup function
    return () => {
      isActive = false;
      generatedUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [files]);

  return previews;
}

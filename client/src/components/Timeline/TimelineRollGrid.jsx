/**
 * TimelineRollGrid - Photo grid showing roll covers
 * Uses HeroUI Card for modern, consistent styling
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@heroui/react';
import { Camera } from 'lucide-react';
import { buildUploadUrl } from '../../api';
import { addCacheKey } from '../../utils/imageOptimization';
import { useTimeline } from './TimelineContext';

// Animation variants for future Framer Motion integration
// eslint-disable-next-line no-unused-vars
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

// eslint-disable-next-line no-unused-vars
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function TimelineRollGrid() {
  const { selectedRolls, isLoading, getRollColor } = useTimeline();
  const navigate = useNavigate();

  // Get thumbs based on selection
  const thumbs = useMemo(() => {
    if (!selectedRolls || selectedRolls.length === 0) return [];
    
    return selectedRolls.map(r => ({
      id: r.id,
      title: r.title,
      cover: r.coverPath || r.cover_photo,
      displaySeq: r.display_seq,
      photoCount: r.photo_count || r.photos?.length || 0,
      updatedAt: r.updated_at || r.cover_updated_at
    }));
  }, [selectedRolls]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-6">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
            <Skeleton className="aspect-square" />
          </div>
        ))}
      </div>
    );
  }

  // Debug log
  console.log('[TimelineRollGrid] selectedRolls:', selectedRolls?.length, 'thumbs:', thumbs.length);

  if (thumbs.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
        <Camera size={48} className="mx-auto mb-4 opacity-50" />
        <p>No rolls found for this period (selectedRolls: {selectedRolls?.length || 0})</p>
      </div>
    );
  }

  // Debug - ensure we are reaching here
  console.log('[TimelineRollGrid] Rendering grid with', thumbs.length, 'items');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-6">
      {thumbs.map(item => {
        const url = addCacheKey(buildUploadUrl(item.cover), item.updatedAt);
        const color = getRollColor(item.id);

        return (
          <div 
            key={item.id} 
            onClick={() => navigate(`/rolls/${item.id}`)}
            className="rounded-xl overflow-hidden cursor-pointer 
                       bg-white dark:bg-zinc-900
                       hover:shadow-lg hover:scale-[1.02]
                       transition-all duration-200"
          >
            {/* Cover Image - 1:1 aspect ratio */}
            <div className="aspect-square relative overflow-hidden">
              {url ? (
                <img
                  src={url}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div 
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: color + '30' }}
                >
                  <Camera size={32} className="text-zinc-400 dark:text-zinc-500" />
                </div>
              )}
              
              {/* Bottom overlay with number and title */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent pt-8 pb-2 px-2">
                <div className="flex items-center gap-1.5">
                  <span 
                    className="px-1.5 py-0.5 rounded text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    #{item.displaySeq ?? item.id}
                  </span>
                  <p className="text-sm font-medium text-white truncate">
                    {item.title || 'Untitled'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

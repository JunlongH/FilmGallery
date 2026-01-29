/**
 * TimelineRollGrid - Photo grid showing roll covers
 * Uses HeroUI Card for modern, consistent styling
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardFooter, Skeleton } from '@heroui/react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Camera } from 'lucide-react';
import 'react-lazy-load-image-component/src/effects/opacity.css';
import { buildUploadUrl } from '../../api';
import { useTimeline } from './TimelineContext';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function TimelineRollGrid() {
  const { selectedYear, selectedMonth, selectedRolls, isLoading, getRollColor } = useTimeline();
  const navigate = useNavigate();

  // Get thumbs based on selection
  const thumbs = useMemo(() => {
    if (!selectedRolls || selectedRolls.length === 0) return [];
    
    return selectedRolls.map(r => ({
      id: r.id,
      title: r.title,
      cover: r.coverPath || r.cover_photo,
      displaySeq: r.display_seq,
      photoCount: r.photo_count || r.photos?.length || 0
    }));
  }, [selectedRolls]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="bg-content1/60">
            <Skeleton className="aspect-[4/3] rounded-lg" />
            <CardFooter className="pt-2">
              <Skeleton className="h-4 w-3/4 rounded" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (thumbs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 text-default-500"
      >
        <Camera size={48} className="mx-auto mb-4 opacity-50" />
        <p>No rolls found for this period</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-6"
    >
      {thumbs.map(item => {
        const url = buildUploadUrl(item.cover);
        const color = getRollColor(item.id);

        return (
          <motion.div key={item.id} variants={itemVariants}>
            <Card
              isPressable
              onPress={() => navigate(`/rolls/${item.id}`)}
              className="bg-content1/60 backdrop-blur-sm border border-divider 
                         hover:border-primary/50 hover:shadow-lg transition-all duration-200"
            >
              {/* Cover Image */}
              <div className="aspect-[4/3] relative overflow-hidden rounded-t-lg">
                {url ? (
                  <LazyLoadImage
                    src={url}
                    alt={item.title}
                    effect="opacity"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: color + '30' }}
                  >
                    <Camera size={32} className="text-default-400" />
                  </div>
                )}
                
                {/* Roll number badge */}
                <div 
                  className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold text-white shadow-md"
                  style={{ backgroundColor: color }}
                >
                  #{item.displaySeq ?? item.id}
                </div>

                {/* Photo count badge */}
                {item.photoCount > 0 && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full 
                                  text-xs bg-black/60 text-white backdrop-blur-sm">
                    {item.photoCount} photos
                  </div>
                )}
              </div>

              {/* Title */}
              <CardFooter className="pt-2 pb-3 px-3">
                <p className="text-sm font-medium text-default-700 truncate w-full">
                  {item.title || 'Untitled'}
                </p>
              </CardFooter>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

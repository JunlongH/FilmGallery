/**
 * TagCard - 标签/主题卡片组件
 * 
 * 使用 HeroUI Card + LazyImage 展示单个标签
 * 显示封面图和照片数量
 */

import React, { memo } from 'react';
import { Card, CardBody } from '@heroui/react';
import { motion } from 'framer-motion';
import { Tag, Image as ImageIcon } from 'lucide-react';
import LazyImage from '../common/LazyImage';
import { buildUploadUrl } from '../../api';

const getCoverUrl = (tag) => {
  const coverPath = tag.cover_thumb || tag.cover_full;
  if (!coverPath) return null;
  
  const path = coverPath.startsWith('/') ? coverPath : `/uploads/${coverPath}`;
  return buildUploadUrl(path);
};

const TagCard = memo(function TagCard({
  tag,
  onSelect
}) {
  const coverUrl = getCoverUrl(tag);

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        isPressable
        onPress={() => onSelect?.(tag)}
        className="group overflow-hidden border border-zinc-200/50 dark:border-zinc-700/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
      >
        <CardBody className="p-0">
          <div className="relative aspect-[4/3] overflow-hidden">
            {/* Cover Image - 使用优化的 LazyImage */}
            {coverUrl ? (
              <LazyImage
                src={coverUrl}
                alt={tag.name}
                aspectRatio="4/3"
                className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                objectFit="cover"
                fadeInDuration={0.3}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-default-100 to-default-200 flex items-center justify-center">
                <Tag className="w-12 h-12 text-default-300" />
              </div>
            )}
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            
            {/* Info Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-semibold text-lg mb-1 line-clamp-1">
                {tag.name}
              </h3>
              <div className="flex items-center gap-1 text-white/80 text-sm">
                <ImageIcon className="w-4 h-4" />
                <span>{tag.photos_count || 0} photos</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
});

export default TagCard;

/**
 * TagCard - 标签/主题卡片组件
 * 
 * 使用 HeroUI Card 展示单个标签
 * 显示封面图和照片数量
 */

import React from 'react';
import { Card, CardBody, Image } from '@heroui/react';
import { motion } from 'framer-motion';
import { Tag, Image as ImageIcon } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { buildUploadUrl } from '../../api';
import 'react-lazy-load-image-component/src/effects/opacity.css';

const getCoverUrl = (tag) => {
  const coverPath = tag.cover_thumb || tag.cover_full;
  if (!coverPath) return null;
  
  const path = coverPath.startsWith('/') ? coverPath : `/uploads/${coverPath}`;
  return buildUploadUrl(path);
};

export default function TagCard({
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
        className="group overflow-hidden border border-divider/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
      >
        <CardBody className="p-0">
          <div className="relative aspect-[4/3] overflow-hidden">
            {/* Cover Image */}
            {coverUrl ? (
              <LazyLoadImage
                src={coverUrl}
                alt={tag.name}
                effect="opacity"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
}

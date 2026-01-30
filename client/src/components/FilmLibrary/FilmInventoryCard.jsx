/**
 * FilmInventoryCard - 胶片库存卡片组件
 * 
 * 使用 HeroUI Card 展示单个胶片库存项
 * 支持展开/收起详情，状态徽章，快捷操作
 */

import React, { useState } from 'react';
import { Card, CardBody, Image, Chip, Button, Tooltip, Divider } from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  Disc3, 
  Package, 
  FlaskConical, 
  Archive,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
  Eye,
  BookOpen,
  AlertTriangle,
  Calendar,
  Store,
  DollarSign,
  Hash,
  CheckCircle2
} from 'lucide-react';
import { buildUploadUrl } from '../../api';

// Status configuration with colors and icons
const STATUS_CONFIG = {
  in_stock: { 
    label: 'In Stock', 
    color: 'success', 
    icon: Package,
    description: 'Ready to use'
  },
  loaded: { 
    label: 'Loaded', 
    color: 'primary', 
    icon: Camera,
    description: 'In camera'
  },
  shot: { 
    label: 'Shot', 
    color: 'warning', 
    icon: Disc3,
    description: 'Waiting for development'
  },
  sent_to_lab: { 
    label: 'At Lab', 
    color: 'secondary', 
    icon: FlaskConical,
    description: 'Being developed'
  },
  developed: { 
    label: 'Developed', 
    color: 'success', 
    icon: CheckCircle2,
    description: 'Ready to scan'
  },
  archived: { 
    label: 'Archived', 
    color: 'default', 
    icon: Archive,
    description: 'Stored away'
  }
};

const formatMoney = (value) => {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return `¥${num.toFixed(2)}`;
};

const getFilmThumbUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.includes('/') || path.includes('\\')) {
    return buildUploadUrl(path);
  }
  return buildUploadUrl(`/uploads/films/${path}`);
};

export default function FilmInventoryCard({
  item,
  film,
  onLoad,
  onUnload,
  onLogShots,
  onDevelop,
  onCreateRoll,
  onArchive,
  onEdit,
  onDelete,
  onViewRoll,
  onToggleNegativeArchived
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.in_stock;
  const StatusIcon = statusConfig.icon;
  const thumbUrl = film?.thumbPath ? getFilmThumbUrl(film.thumbPath) : null;
  const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date();
  
  // Status label with camera info for loaded items
  const statusLabel = item.status === 'loaded' && item.loaded_camera
    ? `On ${item.loaded_camera}`
    : statusConfig.label;

  return (
    <Card 
      className="group overflow-hidden bg-content1/60 backdrop-blur-sm border border-divider/50 hover:border-primary/30 transition-all duration-300"
      isPressable
      onPress={() => setIsExpanded(!isExpanded)}
    >
      <CardBody className="p-0 gap-0">
        {/* Thumbnail Section */}
        <div className="relative aspect-[4/3] overflow-hidden">
          {thumbUrl ? (
            <Image
              src={thumbUrl}
              alt={film?.name || 'Film'}
              classNames={{
                wrapper: 'w-full h-full',
                img: 'object-cover w-full h-full group-hover:scale-105 transition-transform duration-500'
              }}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-default-100 to-default-200 flex items-center justify-center">
              <Disc3 className="w-12 h-12 text-default-400" />
            </div>
          )}
          
          {/* Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {/* Expiry Badge */}
          {item.expiry_date && (
            <Chip
              size="sm"
              variant="flat"
              color={isExpired ? 'danger' : 'warning'}
              className="absolute top-2 left-2 text-xs"
              startContent={isExpired ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
            >
              {isExpired ? 'Expired' : `Exp: ${item.expiry_date}`}
            </Chip>
          )}
          
          {/* Status Badge */}
          <Chip
            size="sm"
            variant="solid"
            color={statusConfig.color}
            className="absolute top-2 right-2"
            startContent={<StatusIcon className="w-3 h-3" />}
          >
            {statusLabel}
          </Chip>
          
          {/* Film Info Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <div className="text-white">
              <div className="font-semibold text-sm line-clamp-1">
                {film?.brand && <span className="opacity-80">{film.brand} </span>}
                {film?.name || 'Unknown Film'}
              </div>
              {film?.format && film.format !== '135' && (
                <span className="text-xs opacity-70 bg-white/20 px-1.5 py-0.5 rounded mt-1 inline-block">
                  {film.format}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Expandable Details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-3">
                {/* Purchase Info */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-default-500">
                    <Store className="w-3.5 h-3.5" />
                    <span className="truncate">{item.purchase_channel || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-default-500">
                    <span className="truncate">{item.purchase_vendor || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-default-500">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>{formatMoney(item.purchase_price)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-default-500">
                    <span>+ {formatMoney(item.purchase_shipping_share)} shipping</span>
                  </div>
                </div>
                
                {item.batch_number && (
                  <div className="flex items-center gap-2 text-sm text-default-500">
                    <Hash className="w-3.5 h-3.5" />
                    <span>Batch: {item.batch_number}</span>
                  </div>
                )}
                
                {(item.label || item.purchase_note) && (
                  <p className="text-xs text-default-400 italic bg-default-100 p-2 rounded-lg">
                    {item.label || item.purchase_note}
                  </p>
                )}
                
                <Divider className="my-2" />
                
                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 justify-end">
                  {/* Status-based Actions */}
                  {item.status === 'in_stock' && (
                    <Button
                      size="sm"
                      color="primary"
                      variant="solid"
                      startContent={<Camera className="w-3.5 h-3.5" />}
                      onPress={(e) => { e.stopPropagation(); onLoad?.(item); }}
                    >
                      Load
                    </Button>
                  )}
                  
                  {item.status === 'loaded' && (
                    <>
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<BookOpen className="w-3.5 h-3.5" />}
                        onPress={(e) => { e.stopPropagation(); onLogShots?.(item); }}
                      >
                        Log Shots
                      </Button>
                      <Button
                        size="sm"
                        color="warning"
                        variant="flat"
                        onPress={(e) => { e.stopPropagation(); onUnload?.(item); }}
                      >
                        Unload
                      </Button>
                    </>
                  )}
                  
                  {item.status === 'shot' && (
                    <Button
                      size="sm"
                      color="secondary"
                      variant="solid"
                      startContent={<FlaskConical className="w-3.5 h-3.5" />}
                      onPress={(e) => { e.stopPropagation(); onDevelop?.(item); }}
                    >
                      Develop
                    </Button>
                  )}
                  
                  {item.status === 'sent_to_lab' && (
                    <Button
                      size="sm"
                      color="success"
                      variant="solid"
                      onPress={(e) => { e.stopPropagation(); onCreateRoll?.(item); }}
                    >
                      Create Roll
                    </Button>
                  )}
                  
                  {/* View Roll for developed/archived */}
                  {(item.status === 'developed' || item.status === 'archived') && item.roll_id && (
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      startContent={<Eye className="w-3.5 h-3.5" />}
                      onPress={(e) => { e.stopPropagation(); onViewRoll?.(item.roll_id); }}
                    >
                      View Roll
                    </Button>
                  )}
                  
                  {/* Negative Archive Toggle */}
                  {(item.status === 'developed' || item.status === 'archived') && (
                    <Tooltip content={item.negative_archived ? 'Negatives stored' : 'Mark negatives as archived'}>
                      <Button
                        size="sm"
                        variant={item.negative_archived ? 'solid' : 'bordered'}
                        color={item.negative_archived ? 'success' : 'default'}
                        isIconOnly
                        onPress={(e) => { e.stopPropagation(); onToggleNegativeArchived?.(item); }}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </Tooltip>
                  )}
                  
                  {item.status === 'developed' && (
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={(e) => { e.stopPropagation(); onArchive?.(item); }}
                    >
                      Archive
                    </Button>
                  )}
                  
                  {/* Common Actions */}
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onPress={(e) => { e.stopPropagation(); onEdit?.(item); }}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  
                  {!item.roll_id && (
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      isIconOnly
                      onPress={(e) => { e.stopPropagation(); onDelete?.(item); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Expand Indicator */}
        <div className="flex justify-center py-1 text-default-400 border-t border-divider/30">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

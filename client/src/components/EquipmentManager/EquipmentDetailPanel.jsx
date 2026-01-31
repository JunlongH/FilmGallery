/**
 * EquipmentDetailPanel - 设备详情面板
 * 
 * 展示选中设备的详细信息
 * 支持图片上传、编辑、删除操作
 */

import React, { useRef, useState } from 'react';
import { 
  Card, 
  CardBody, 
  CardHeader,
  Image, 
  Button, 
  Chip, 
  Divider,
  Tooltip,
  Skeleton
} from '@heroui/react';
import { 
  Edit, 
  Trash2, 
  Upload, 
  Camera, 
  Aperture, 
  Zap, 
  Box, 
  Scan, 
  Film,
  Calendar,
  Hash,
  Tag,
  FileText,
  ExternalLink
} from 'lucide-react';
import { buildUploadUrl } from '../../api';
import { addCacheKey } from '../../utils/imageOptimization';

// Icon mapping
const TYPE_ICONS = {
  cameras: Camera,
  lenses: Aperture,
  flashes: Zap,
  'film-backs': Box,
  scanners: Scan,
  films: Film
};

// Info row component
function InfoRow({ icon: Icon, label, value, children }) {
  if (!value && !children) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-default-400">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <dt className="text-xs text-default-400 mb-0.5">{label}</dt>
        <dd className="text-sm text-default-700">
          {children || value}
        </dd>
      </div>
    </div>
  );
}

export default function EquipmentDetailPanel({
  item,
  type = 'cameras',
  filmConstants,
  relatedRolls = [],
  isLoading = false,
  onEdit,
  onDelete,
  onImageUpload,
  onViewRoll
}) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const Icon = TYPE_ICONS[type] || Camera;
  const imagePath = item?.image_path || item?.thumbPath;
  const imageUrl = imagePath ? addCacheKey(buildUploadUrl(imagePath), item?.updated_at) : null;

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      await onImageUpload?.(file);
    } finally {
      setIsUploading(false);
    }
    e.target.value = '';
  };

  // Empty state
  if (!item) {
    return (
      <Card className="h-full flex items-center justify-center bg-default-50/50">
        <CardBody className="flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center mb-4">
            <Icon className="w-8 h-8 text-default-300" />
          </div>
          <p className="text-default-500">
            Select an item to view details
          </p>
        </CardBody>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardBody className="space-y-4 p-6">
          <Skeleton className="w-full aspect-video rounded-xl" />
          <Skeleton className="h-6 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
          <div className="space-y-3 mt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-5 h-5 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    );
  }

  // Get type-specific details
  const renderTypeDetails = () => {
    switch (type) {
      case 'cameras':
        return (
          <>
            <InfoRow icon={Tag} label="Brand" value={item.brand} />
            <InfoRow icon={Camera} label="Type" value={item.type} />
            <InfoRow icon={Hash} label="Serial Number" value={item.serial_number} />
            <InfoRow icon={Calendar} label="Acquired" value={item.acquired_date} />
            {item.fixed_lens && (
              <InfoRow icon={Aperture} label="Fixed Lens" value={item.fixed_lens} />
            )}
            {item.fixed_flash && (
              <InfoRow icon={Zap} label="Built-in Flash" value={item.fixed_flash} />
            )}
          </>
        );
      
      case 'lenses':
        return (
          <>
            <InfoRow icon={Tag} label="Brand" value={item.brand} />
            <InfoRow icon={Aperture} label="Mount" value={item.mount} />
            <InfoRow icon={Hash} label="Serial Number" value={item.serial_number} />
            <InfoRow icon={Calendar} label="Acquired" value={item.acquired_date} />
          </>
        );
      
      case 'flashes':
        return (
          <>
            <InfoRow icon={Tag} label="Brand" value={item.brand} />
            <InfoRow icon={Zap} label="Guide Number" value={item.guide_number} />
            <InfoRow icon={Hash} label="Serial Number" value={item.serial_number} />
          </>
        );

      case 'film-backs':
        return (
          <>
            <InfoRow icon={Tag} label="Brand" value={item.brand} />
            <InfoRow icon={Box} label="Format" value={item.format} />
            <InfoRow icon={Hash} label="Serial Number" value={item.serial_number} />
          </>
        );

      case 'scanners':
        return (
          <>
            <InfoRow icon={Tag} label="Brand" value={item.brand} />
            <InfoRow icon={Scan} label="Type" value={item.type} />
            <InfoRow icon={Hash} label="Serial Number" value={item.serial_number} />
          </>
        );
      
      case 'films':
        return (
          <>
            <InfoRow icon={Tag} label="Brand" value={item.brand} />
            <InfoRow icon={Hash} label="ISO" value={item.iso} />
            <InfoRow icon={Film} label="Format" value={item.format || '135'} />
            <InfoRow icon={Camera} label="Type">
              <div className="flex flex-wrap gap-1">
                {item.color_type && (
                  <Chip size="sm" variant="flat" color={item.color_type === 'Color' ? 'success' : 'default'}>
                    {item.color_type}
                  </Chip>
                )}
                {item.dev_process && (
                  <Chip size="sm" variant="flat" color="secondary">
                    {item.dev_process}
                  </Chip>
                )}
              </div>
            </InfoRow>
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="flex-col items-start gap-2 pb-0">
        {/* Image Section */}
        <div className="relative w-full aspect-video bg-default-100 rounded-xl overflow-hidden group">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={item.name}
              classNames={{
                wrapper: 'w-full h-full',
                img: 'object-cover w-full h-full'
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Icon className="w-16 h-16 text-default-200" />
            </div>
          )}
          
          {/* Upload overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              color="primary"
              variant="solid"
              startContent={<Upload className="w-4 h-4" />}
              isLoading={isUploading}
              onPress={() => fileInputRef.current?.click()}
            >
              {imageUrl ? 'Change Image' : 'Upload Image'}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Title & Actions */}
        <div className="flex items-start justify-between w-full mt-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-default-800 truncate">
              {item.name}
            </h2>
            {item.brand && type !== 'films' && (
              <p className="text-sm text-default-500">{item.brand}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Tooltip content="Edit">
              <Button
                isIconOnly
                variant="light"
                onPress={onEdit}
              >
                <Edit className="w-4 h-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Delete" color="danger">
              <Button
                isIconOnly
                variant="light"
                color="danger"
                onPress={onDelete}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Status Chips */}
        {item.status && item.status !== 'active' && (
          <Chip 
            size="sm" 
            color={item.status === 'retired' ? 'default' : 'warning'} 
            variant="flat"
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Chip>
        )}
      </CardHeader>

      <CardBody className="pt-4">
        <Divider className="mb-4" />
        
        {/* Type-specific Details */}
        <dl className="space-y-1">
          {renderTypeDetails()}
          
          {/* Notes - common to all */}
          {item.notes && (
            <InfoRow icon={FileText} label="Notes" value={item.notes} />
          )}
        </dl>

        {/* Related Rolls Section */}
        {relatedRolls.length > 0 && (
          <>
            <Divider className="my-4" />
            <div>
              <h4 className="text-sm font-medium text-default-700 mb-3">
                Related Rolls ({relatedRolls.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {relatedRolls.slice(0, 5).map(roll => (
                  <Button
                    key={roll.id}
                    variant="flat"
                    size="sm"
                    className="w-full justify-start"
                    endContent={<ExternalLink className="w-3 h-3" />}
                    onPress={() => onViewRoll?.(roll.id)}
                  >
                    <span className="truncate">
                      #{roll.roll_number} - {roll.title || 'Untitled'}
                    </span>
                  </Button>
                ))}
                {relatedRolls.length > 5 && (
                  <p className="text-xs text-default-400 text-center">
                    +{relatedRolls.length - 5} more rolls
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

import React, { CSSProperties } from 'react';

export interface SquareImageProps {
  /** Image URL source */
  src?: string | null;
  /** Alt text for accessibility */
  alt?: string;
  /** Optional wrapper CSS classes */
  className?: string;
  /** Optional wrapper inline styles (merged with defaults) */
  style?: CSSProperties;
  /** Border radius in pixels */
  radius?: number;
  /** CSS aspect ratio (e.g., '1 / 1', '16 / 9') */
  aspect?: string;
}

/**
 * Reusable square, center-cropped image component that fills its container
 */
const SquareImage: React.FC<SquareImageProps> = ({
  src,
  alt,
  className,
  style,
  radius = 4,
  aspect = '1 / 1'
}) => {
  return (
    <div
      className={className}
      style={{
        aspectRatio: aspect,
        background: '#eee',
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        position: 'relative',
        ...style
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            display: 'block'
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#999', fontSize: 12
        }}>
          No Image
        </div>
      )}
    </div>
  );
};

export default SquareImage;

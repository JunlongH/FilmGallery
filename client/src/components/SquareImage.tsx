import React from 'react';

// TypeScript interface
interface SquareImageProps {
  src?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  radius?: number;
  aspect?: string;
}

// Reusable square, center-cropped image that fills its container
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

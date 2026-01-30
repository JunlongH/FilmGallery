import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavoritePhotos, buildUploadUrl, updatePhoto } from '../api';
import ImageViewer from './ImageViewer';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/opacity.css';

export default function Favorites() {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const queryClient = useQueryClient();

  const { data: photos = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const p = await getFavoritePhotos();
      return Array.isArray(p) ? p : [];
    }
  });

  const updatePhotoMutation = useMutation({
    mutationFn: ({ photoId, data }) => updatePhoto(photoId, data),
    onSuccess: () => queryClient.invalidateQueries(['favorites'])
  });

  async function onUnlike(photoId) {
    try {
      await updatePhotoMutation.mutateAsync({ photoId, data: { rating: 0 } });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-background text-foreground p-6">
      <h2 className="text-2xl font-bold mb-6">Favorites</h2>
      {photos.length === 0 ? <div className="text-default-500 text-center mt-10">No favorites yet.</div> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {photos.map((p, idx) => (
            <FavItem key={p.id} p={p} onSelect={()=>setSelectedPhotoIndex(idx)} onUnlike={onUnlike} />
          ))}
        </div>
      )}

      {selectedPhotoIndex !== null && (
        <ImageViewer
          images={photos}
          index={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
        />
      )}
    </div>
  );
}

function HeartIcon({ filled }) {
  // ... (keep icon)
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#f31260" : "none"} stroke={filled ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  );
}

function FavItem({ p, onSelect, onUnlike }) {
  const [url, setUrl] = useState(null);
  const [liked, setLiked] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    let candidate = null;
    if (p.positive_thumb_rel_path) candidate = `/uploads/${p.positive_thumb_rel_path}`;
    else if (p.thumb_rel_path) candidate = `/uploads/${p.thumb_rel_path}`; 
    else if (p.positive_rel_path) candidate = `/uploads/${p.positive_rel_path}`;
    else if (p.full_rel_path) candidate = `/uploads/${p.full_rel_path}`;
    else if (p.filename) candidate = p.filename;
    if (!candidate) candidate = '';
    const bust = `?t=${Date.now()}`;
    setUrl(buildUploadUrl(candidate) + bust);
    setLiked((p.rating|0) === 1);
  }, [p]);

  const toggleLike = async (e) => {
    e.stopPropagation();
    onUnlike(p.id);
  };

  return (
    <div className="group relative aspect-square bg-content1 rounded-xl overflow-hidden shadow-sm cursor-pointer border border-divider hover:shadow-md transition-shadow" onClick={onSelect}>
      {/* Top Controls */}
      <div className="absolute top-2 right-2 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          className="p-2 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 text-white transition-colors"
          onClick={toggleLike} 
          title={liked ? 'Unlike' : 'Like'}
        >
          <HeartIcon filled={liked} />
        </button>
      </div>

      {/* Image */}
      {url ? (
        <LazyLoadImage
          src={url}
          alt={p.filename}
          effect="opacity"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          wrapperClassName="w-full h-full"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-content2 text-default-500">
          No image
        </div>
      )}

      {/* Bottom Overlay */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end gap-1">
        {p.caption && (
          <div className="text-white text-xs font-semibold truncate">{p.caption}</div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-white/80">
          <span 
            className="hover:text-white underline cursor-pointer truncate"
            onClick={(e) => { e.stopPropagation(); navigate(`/rolls/${p.roll_id}`); }}
          >
            {p.roll_title || 'Untitled Roll'}
          </span>
          <span>•</span>
          <span className="truncate">{p.film_name || 'Unknown Film'}</span>
        </div>
      </div>
    </div>
  );
}

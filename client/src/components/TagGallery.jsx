import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ImageViewer from './ImageViewer';
import { buildUploadUrl, getTagPhotos, getTags, updatePhoto } from '../api';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/opacity.css';

export default function TagGallery() {
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const [viewerIndex, setViewerIndex] = useState(null);

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const t = await getTags();
      return (Array.isArray(t) ? t : []).filter(tag => tag.photos_count > 0);
    }
  });

  const selectedTag = params.tagId ? tags.find(t => String(t.id) === String(params.tagId)) : null;

  const { data: photos = [], isLoading: loadingPhotos } = useQuery({
    queryKey: ['tagPhotos', params.tagId],
    queryFn: () => getTagPhotos(params.tagId),
    enabled: !!params.tagId
  });

  const updatePhotoMutation = useMutation({
    mutationFn: ({ photoId, data }) => updatePhoto(photoId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tagPhotos', params.tagId]);
      queryClient.invalidateQueries(['tags']);
    }
  });

  // View: List of all tags (Tag Cloud)
  if (!selectedTag) {
    return (
      <div className="flex flex-col min-h-full bg-background text-foreground p-6">
        <div className="mb-6">
          <h3 className="text-2xl font-bold">Themes</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {tags.length === 0 ? (
            <div className="col-span-full text-center text-default-500 mt-10">No themes yet. Add tags to your photos to see them here.</div>
          ) : (
            tags.map(t => (
              <div 
                key={t.id} 
                className="group relative aspect-[4/3] bg-content1 rounded-xl overflow-hidden shadow-sm border border-divider hover:shadow-md transition-all cursor-pointer"
                onClick={() => navigate(`/themes/${t.id}`)}
              >
                  {t.cover_thumb || t.cover_full ? (
                    <LazyLoadImage
                      src={buildUploadUrl((t.cover_thumb || t.cover_full).startsWith('/') ? (t.cover_thumb || t.cover_full) : `/uploads/${t.cover_thumb || t.cover_full}`)}
                      alt={t.name}
                      effect="opacity"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      wrapperClassName="w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-content2 text-default-500">No Cover</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90" />
                  <div className="absolute bottom-0 left-0 p-4 w-full">
                    <div className="text-white text-lg font-bold truncate">{t.name}</div>
                    <div className="text-white/70 text-sm">{t.photos_count} photos</div>
                  </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // View: Single Tag Gallery
  return (
    <div className="flex flex-col min-h-full bg-background text-foreground p-6">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => navigate('/themes')} 
          className="p-2 rounded-full hover:bg-content1 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h3 className="text-2xl font-bold">{selectedTag.name}</h3>
          <span className="text-default-500 text-sm">{photos.length} photos</span>
        </div>
      </div>

      {loadingPhotos ? <div className="p-10 text-center text-default-500">Loading...</div> : (
        photos.length === 0 ? <div className="text-default-500">No photos for this theme.</div> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {photos.map((p, idx) => (
              <TagPhotoItem 
                key={p.id} 
                photo={p} 
                index={idx} 
                onOpenViewer={(i)=>setViewerIndex(i)} 
                onToggleFavorite={async (photo, prevLiked)=>{
                  try { 
                    await updatePhotoMutation.mutateAsync({ photoId: photo.id, data: { rating: prevLiked ? 0 : 1 } });
                  } catch (err) { console.error(err); }
                }}
                onRemoveFromTheme={async (photo) => {
                  if (!window.confirm(`Remove this photo from theme "${selectedTag.name}"?`)) return;
                  const currentTags = photo.tags || [];
                  const newTags = currentTags.filter(t => t.id !== selectedTag.id).map(t => t.name);
                  try {
                    await updatePhotoMutation.mutateAsync({ photoId: photo.id, data: { tags: newTags } });
                    window.dispatchEvent(new Event('refresh-tags'));
                  } catch (err) {
                    console.error(err);
                    alert('Failed to remove from theme');
                  }
                }}
              />
            ))}
          </div>
        )
      )}

      {viewerIndex !== null && (
        <ImageViewer images={photos} index={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}

function TagPhotoItem({ photo, index, onOpenViewer, onToggleFavorite, onRemoveFromTheme }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(null);
  const [liked, setLiked] = useState((photo.rating|0) === 1);

  useEffect(() => {
    let candidate = null;
    if (photo.positive_thumb_rel_path) candidate = `/uploads/${photo.positive_thumb_rel_path}`;
    else if (photo.negative_thumb_rel_path) candidate = `/uploads/${photo.negative_thumb_rel_path}`;
    else if (photo.thumb_rel_path) candidate = `/uploads/${photo.thumb_rel_path}`;
    else if (photo.positive_rel_path) candidate = `/uploads/${photo.positive_rel_path}`;
    else if (photo.full_rel_path) candidate = `/uploads/${photo.full_rel_path}`;
    else if (photo.filename) candidate = photo.filename;
    if (!candidate) candidate = '';
    const bust = `?t=${Date.now()}`;
    setUrl(buildUploadUrl(candidate) + bust);
    setLiked((photo.rating|0) === 1);
  }, [photo]);

  const toggleFavorite = async (e) => {
    e.stopPropagation();
    const prev = liked;
    setLiked(!prev);
    try {
      await onToggleFavorite(photo, prev);
    } catch (err) {
      setLiked(prev);
      throw err;
    }
  };

  return (
    <div 
      className="group relative aspect-square bg-content1 rounded-xl overflow-hidden shadow-sm border border-divider hover:shadow-md transition-all cursor-pointer" 
      onClick={() => onOpenViewer(index)}
    >
      {/* Top Left: Remove */}
      <div className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onRemoveFromTheme(photo); }}
          className="p-1.5 bg-black/40 backdrop-blur-md rounded-full hover:bg-red-500/80 text-white transition-colors"
          title="Remove from theme"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>

      {/* Top Right: Like */}
      <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={toggleFavorite} 
          className="p-1.5 bg-black/40 backdrop-blur-md rounded-full hover:bg-black/60 text-white transition-colors"
          title={liked ? 'Unlike' : 'Like'}
        >
          <HeartIcon filled={liked} />
        </button>
      </div>

      {url ? (
        <LazyLoadImage
          src={url}
          alt={photo.caption || ''}
          effect="opacity"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          wrapperClassName="w-full h-full"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-content2 text-default-500">No Image</div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end gap-1">
        {photo.caption && (
          <div className="text-white text-xs font-semibold truncate">{photo.caption}</div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-white/80">
           {photo.roll_title && (
             <span 
              className="hover:text-white underline cursor-pointer truncate"
              onClick={(e) => {
                e.stopPropagation();
                if (photo.roll_id) navigate(`/rolls/${photo.roll_id}`);
              }}
             >
               {photo.roll_title}
             </span>
           )}
           {(photo.roll_title && photo.film_name) && <span>•</span>}
           <span className="truncate">{photo.film_name || 'Unknown Film'}</span>
        </div>
      </div>
    </div>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#f31260" : "none"} stroke={filled ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  );
}

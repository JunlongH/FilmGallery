import React, { useState, useEffect, useRef } from 'react';
import GlassModal from './ui/GlassModal';
import { Button, Chip } from '@heroui/react';
import { Tag, Plus } from 'lucide-react';

export default function TagEditModal({ photo, allTags, onClose, onSave }) {
  const [input, setInput] = useState('');
  const [currentTags, setCurrentTags] = useState(photo.tags ? photo.tags.map(t => t.name || t) : []);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    const lower = input.toLowerCase().trim();
    const filtered = allTags
      .filter(t => t.photos_count > 0) // Hide tags with no photos
      .filter(t => !currentTags.includes(t.name))
      .filter(t => !lower || t.name.toLowerCase().includes(lower));
    setSuggestions(filtered);
  }, [input, allTags, currentTags]);

  const addTag = (name) => {
    if (!name.trim()) return;
    if (currentTags.includes(name.trim())) return;
    setCurrentTags([...currentTags, name.trim()]);
    setInput('');
    // Keep suggestions open or refresh them? 
    // The useEffect will run and remove the added tag from suggestions.
    if (inputRef.current) inputRef.current.focus();
  };

  const removeTag = (name) => {
    setCurrentTags(currentTags.filter(t => t !== name));
  };

  const handleSave = () => {
    let finalTags = [...currentTags];
    if (input.trim() && !finalTags.includes(input.trim())) {
      finalTags.push(input.trim());
    }
    console.log('[TagEditModal] Saving tags:', finalTags, 'for photo:', photo.id);
    onSave(photo.id, finalTags);
    onClose();
  };

  // Prevent click-through to elements behind the modal
  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div onClick={handleContentClick}>
      <GlassModal
        isOpen={true}
        onClose={onClose}
        size="md"
        title="Edit Tags"
        subtitle="Add or remove tags for this photo"
        icon={<Tag className="w-5 h-5" />}
        footer={
          <div className="flex gap-3 justify-end w-full">
            <Button
              variant="bordered"
              onPress={onClose}
              className="border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={handleSave}
              className="bg-blue-600 text-white"
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4" onClick={handleContentClick}>
          {/* Current Tags */}
          {currentTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentTags.map(t => (
                <Chip
                  key={t}
                  onClose={() => removeTag(t)}
                  variant="flat"
                  color="success"
                  className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                >
                  {t}
                </Chip>
              ))}
            </div>
          )}

          {/* Input - using native input for consistent styling */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(input);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Type to add tag..."
              className="w-full h-10 px-3 pr-10 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50 bg-white/80 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {input.trim() && (
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => addTag(input)}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-blue-600 dark:text-blue-400"
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
              {suggestions.map(s => (
                <Chip
                  key={s.id}
                  onClick={() => addTag(s.name)}
                  variant="bordered"
                  className="cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
                  endContent={
                    <Plus className="w-3 h-3 text-green-600 dark:text-green-400" />
                  }
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </GlassModal>
    </div>
  );
}

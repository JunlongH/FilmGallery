/**
 * RollHeader - Modern roll info card
 * 
 * Displays roll metadata in a beautiful card layout:
 * - Hero cover image with gradient overlay
 * - Title with roll number
 * - Metadata grid with icons
 */
import React from 'react';
import { Button } from "@heroui/react";
import { 
  Edit2, MapPin, Camera, Aperture, FileText, Calendar, Film
} from "lucide-react";

function formatDate(d) {
  if (d === undefined || d === null || d === '') return '';
  let val = d;
  if (typeof val === 'string' && /^\d+$/.test(val)) val = Number(val);
  if (typeof val === 'number') {
    if (val > 0 && val < 1e11) val = val * 1000;
    const dtN = new Date(val);
    if (!isNaN(dtN.getTime())) {
      const yyyy = dtN.getFullYear();
      const mm = String(dtN.getMonth() + 1).padStart(2, '0');
      const dd = String(dtN.getDate()).padStart(2, '0');
      return `${yyyy}.${mm}.${dd}`;
    }
  }
  const dt = new Date(d);
  if (!isNaN(dt.getTime())) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd}`;
  }
  return String(d);
}

function getDateString(startDate, endDate) {
  const s = formatDate(startDate);
  const e = formatDate(endDate);
  if (!s && !e) return '';
  if (s && e) return s === e ? s : `${s} — ${e}`;
  return s || e || '';
}

function resolveFilmName(roll) {
  if (!roll) return null;
  if (roll.film_name_joined) return roll.film_name_joined;
  if (roll.film && typeof roll.film === 'object') {
     return [roll.film.brand, roll.film.name, roll.film.iso].filter(Boolean).join(' ');
  }
  if (roll.film_type) return roll.film_type;
  return null;
}

// Info item component
function InfoItem({ icon: Icon, label, children, isEmpty }) {
  if (isEmpty) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-white/5 text-zinc-400 dark:text-zinc-500 shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
        <div className="text-sm text-zinc-900 dark:text-zinc-100">{children}</div>
      </div>
    </div>
  );
}

export default function RollHeader({ roll, onEdit, coverUrl }) {
  if (!roll) return null;

  const dateStr = getDateString(roll.start_date, roll.end_date);
  const filmName = resolveFilmName(roll);
  const displaySeq = roll.display_seq || roll.id;

  // Gather gear info
  const cameras = roll?.gear?.cameras?.length 
    ? roll.gear.cameras 
    : (roll?.display_camera ? [roll.display_camera] : []);
    
  const lenses = roll?.gear?.lenses?.length 
    ? roll.gear.lenses 
    : (roll?.display_lens ? [roll.display_lens] : []);

  const locations = Array.isArray(roll?.locations) ? roll.locations : [];

  return (
    <div className="mb-6">
      <div className="relative rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        
        <div className="relative flex flex-col lg:flex-row">
          {/* Cover Image - Left side on desktop */}
          {coverUrl && (
            <div className="lg:w-64 xl:w-72 shrink-0">
              <div className="aspect-square lg:h-full relative">
                <img 
                  src={coverUrl} 
                  alt="Roll Cover" 
                  className="w-full h-full object-cover"
                />
                {/* Gradient overlay for mobile */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent lg:hidden" />
                {/* Mobile title overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 lg:hidden">
                  <span className="text-primary/80 font-bold text-sm">#{displaySeq}</span>
                  <h1 className="text-xl font-bold text-white mt-1">{roll.title || 'Untitled Roll'}</h1>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 p-5 lg:p-6">
            {/* Title Header */}
            <div className={coverUrl ? 'hidden lg:flex justify-between items-start mb-6' : 'flex justify-between items-start mb-6'}>
              <div>
                <span className="text-primary font-bold text-base opacity-80">#{displaySeq}</span>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 leading-tight">
                  {roll.title || 'Untitled Roll'}
                </h1>
              </div>
              <Button 
                size="sm" 
                variant="flat" 
                className="bg-white/5 hover:bg-white/10"
                startContent={<Edit2 size={14} />}
                onPress={onEdit}
              >
                Edit
              </Button>
            </div>

            {/* Mobile Edit Button - only when cover exists */}
            {coverUrl && (
              <div className="flex justify-end mb-4 lg:hidden">
                <Button 
                  size="sm" 
                  variant="flat" 
                  className="bg-white/5 hover:bg-white/10"
                  startContent={<Edit2 size={14} />}
                  onPress={onEdit}
                >
                  Edit
                </Button>
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
              <InfoItem icon={Calendar} label="Date" isEmpty={!dateStr}>
                <span className="text-sm">{dateStr}</span>
              </InfoItem>

              <InfoItem icon={Film} label="Film Type" isEmpty={!filmName}>
                <span className="text-sm">{filmName}</span>
              </InfoItem>

              <InfoItem icon={Camera} label="Camera" isEmpty={cameras.length === 0}>
                <span className="text-sm">{cameras.join(', ')}</span>
              </InfoItem>

              <InfoItem icon={Aperture} label="Lens" isEmpty={lenses.length === 0}>
                <span className="text-sm">{lenses.join(', ')}</span>
              </InfoItem>

              <InfoItem icon={MapPin} label="Location" isEmpty={locations.length === 0}>
                <span className="text-sm">{locations.map(l => l.city_name).join(', ')}</span>
              </InfoItem>

              <InfoItem icon={FileText} label="Notes" isEmpty={!roll?.notes}>
                <span className="text-sm text-zinc-400 dark:text-zinc-500">{roll.notes}</span>
              </InfoItem>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

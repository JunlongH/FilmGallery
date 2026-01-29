/**
 * LifeLogMonthGrid - Month view calendar grid
 * Shows a calendar with photo thumbnails for each day
 */
import React from 'react';
import { format, isSameMonth, isSameDay } from 'date-fns';
import { Card, CardBody } from '@heroui/react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-lazy-load-image-component/src/effects/opacity.css';
import { useLifeLog } from './LifeLogContext';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function LifeLogMonthGrid() {
  const { 
    currentDate, 
    calendarDays, 
    photosByDay, 
    setSelectedDay, 
    getPhotoUrl,
    coverPrefs,
    saveCoverPref
  } = useLifeLog();

  return (
    <Card className="bg-content1/60 backdrop-blur-md border border-divider shadow-lg h-full">
      <CardBody className="p-0 h-full flex flex-col">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-divider">
          {WEEKDAYS.map(day => (
            <div 
              key={day}
              className="py-3 text-center text-xs font-semibold text-default-500 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 flex-1 gap-px bg-divider">
          {calendarDays.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayPhotos = photosByDay.get(dateKey) || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const hasPhotos = dayPhotos.length > 0;
            const isToday = isSameDay(day, new Date());
            
            // Determine cover photo
            const prefIndex = coverPrefs[dateKey] || 0;
            const coverIndex = hasPhotos ? Math.abs(prefIndex % dayPhotos.length) : 0;
            const cover = hasPhotos ? dayPhotos[coverIndex] : null;

            return (
              <motion.div
                key={day.toString()}
                whileHover={{ scale: hasPhotos ? 1.02 : 1, zIndex: hasPhotos ? 10 : 1 }}
                className={`
                  relative aspect-square cursor-pointer overflow-hidden group
                  ${isCurrentMonth ? 'bg-content1' : 'bg-default-50'}
                  ${!isCurrentMonth ? 'opacity-50' : ''}
                  transition-all duration-200
                `}
                onClick={() => hasPhotos && setSelectedDay(day)}
              >
                {/* Day Number */}
                <div className={`
                  absolute top-2 left-2 z-20 flex items-center justify-center
                  font-semibold text-sm
                  ${cover ? 'text-white drop-shadow-lg' : ''}
                  ${isToday && !cover ? 'w-7 h-7 rounded-full bg-primary text-primary-foreground' : ''}
                  ${!isToday && !cover ? 'text-default-500' : ''}
                `}>
                  {format(day, 'd')}
                </div>

                {/* Photo Cover */}
                {cover && (
                  <>
                    <LazyLoadImage
                      src={getPhotoUrl(cover)}
                      alt=""
                      effect="opacity"
                      className="w-full h-full object-cover"
                      wrapperClassName="w-full h-full"
                    />
                    
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />

                    {/* Photo Switcher (visible on hover) */}
                    {dayPhotos.length > 1 && (
                      <div className="absolute inset-0 flex items-center justify-between px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            saveCoverPref(dateKey, prefIndex - 1);
                          }}
                          className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
                        >
                          <ChevronLeft size={14} />
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            saveCoverPref(dateKey, prefIndex + 1);
                          }}
                          className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
                        >
                          <ChevronRight size={14} />
                        </motion.button>
                      </div>
                    )}

                    {/* Location Overlay (slides up on hover) */}
                    {(cover.city_name || cover.country_name || cover.detail_location) && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm text-white text-xs py-1.5 px-2 translate-y-full group-hover:translate-y-0 transition-transform truncate">
                        {cover.city_name || cover.country_name || cover.detail_location}
                      </div>
                    )}

                    {/* Photo Count Badge */}
                    {dayPhotos.length > 1 && (
                      <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {dayPhotos.length}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

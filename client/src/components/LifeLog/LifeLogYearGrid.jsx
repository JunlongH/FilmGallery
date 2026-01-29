/**
 * LifeLogYearGrid - Year overview with mini calendars
 * Shows 12 months with photo thumbnails for days with photos
 */
import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth } from 'date-fns';
import { Card, CardBody, CardHeader } from '@heroui/react';
import { motion } from 'framer-motion';
import { useLifeLog } from './LifeLogContext';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 }
};

export default function LifeLogYearGrid() {
  const { year, photosByDay, switchToMonth, getPhotoUrl, coverPrefs } = useLifeLog();
  
  const months = useMemo(() => 
    Array.from({ length: 12 }, (_, i) => {
      const date = new Date(parseInt(year), i, 1);
      const start = startOfWeek(startOfMonth(date));
      const end = endOfWeek(endOfMonth(date));
      const days = eachDayOfInterval({ start, end });
      return { index: i, date, days };
    }), [year]
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 overflow-auto"
    >
      {months.map(({ index, date, days }) => (
        <motion.div key={index} variants={itemVariants}>
          <Card
            isPressable
            onPress={() => switchToMonth(index)}
            className="bg-content1/60 backdrop-blur-md border border-divider hover:border-primary/50 hover:shadow-lg transition-all"
          >
            <CardHeader className="pb-2">
              <h3 className="text-base font-semibold text-primary">
                {format(date, 'MMMM')}
              </h3>
            </CardHeader>
            <CardBody className="pt-0">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAY_LETTERS.map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-semibold text-default-400">
                    {d}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {days.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayPhotos = photosByDay.get(dateKey) || [];
                  const hasPhotos = dayPhotos.length > 0;
                  const isCurrentMonth = isSameMonth(day, date);

                  if (!isCurrentMonth) {
                    return <div key={day.toString()} className="aspect-square" />;
                  }

                  // Get cover photo
                  const prefIndex = coverPrefs[dateKey] || 0;
                  const coverIndex = hasPhotos ? Math.abs(prefIndex % dayPhotos.length) : 0;
                  const cover = hasPhotos ? dayPhotos[coverIndex] : null;

                  return (
                    <div 
                      key={day.toString()}
                      className="aspect-square overflow-hidden rounded-sm"
                    >
                      {hasPhotos ? (
                        <img
                          src={getPhotoUrl(cover)}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-[9px] text-default-300">
                            {format(day, 'd')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

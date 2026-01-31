/**
 * LifeLogYearGrid - Year overview with 12 month mini calendars
 * 
 * Layout: 3 columns x 4 rows
 * Uses inline styles for guaranteed layout stability
 */
import React, { useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth,
  isSameDay
} from 'date-fns';
import { Card, CardBody } from '@heroui/react';
import { motion } from 'framer-motion';
import { useLifeLog } from './LifeLogContext';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function LifeLogYearGrid() {
  const { year, photosByDay, switchToMonth, getPhotoUrl, coverPrefs } = useLifeLog();
  
  // Generate 12 months with week structure
  const months = useMemo(() => 
    Array.from({ length: 12 }, (_, monthIndex) => {
      const date = new Date(parseInt(year), monthIndex, 1);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
      
      const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
      
      const weeks = [];
      for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
      }
      
      return { 
        index: monthIndex, 
        date, 
        weeks,
        name: format(date, 'MMMM')
      };
    }), [year]
  );

  // Count photos per month
  const monthPhotoCounts = useMemo(() => {
    const counts = new Map();
    photosByDay.forEach((photos, dateKey) => {
      const month = dateKey.substring(0, 7);
      counts.set(month, (counts.get(month) || 0) + photos.length);
    });
    return counts;
  }, [photosByDay]);

  // Inline styles for guaranteed layout - 4 columns x 3 rows
  const containerStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gridTemplateRows: 'repeat(3, 1fr)',
    gap: '16px',
    width: '100%',
    height: '100%',
    padding: '16px'
  };

  const calendarGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '2px'
  };

  return (
    <div style={containerStyle}>
      {months.map(({ index, date, weeks, name }) => {
        const monthKey = format(date, 'yyyy-MM');
        const photoCount = monthPhotoCounts.get(monthKey) || 0;
        
        return (
          <motion.div 
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.02 }}
            style={{ minHeight: 0 }}
          >
            <Card
              isPressable
              onPress={() => switchToMonth(index)}
              className="w-full h-full bg-content1 hover:shadow-lg transition-all"
            >
              <CardBody className="p-3 h-full flex flex-col">
                {/* Month Header */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-foreground">{name}</h3>
                  {photoCount > 0 && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                      {photoCount}
                    </span>
                  )}
                </div>

                {/* Weekday Headers - MUST be horizontal row */}
                <div style={calendarGridStyle} className="mb-1">
                  {WEEKDAYS.map((d, i) => (
                    <div 
                      key={i}
                      className={`text-center text-[10px] font-medium ${
                        i === 0 || i === 6 ? 'text-primary' : 'text-default-400'
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar Weeks */}
                <div className="flex flex-col gap-[2px]">
                  {weeks.map((week, wIdx) => (
                    <div key={wIdx} style={calendarGridStyle}>
                      {week.map((day, dIdx) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayPhotos = photosByDay.get(dateKey) || [];
                        const hasPhotos = dayPhotos.length > 0;
                        const isCurrentMonth = isSameMonth(day, date);
                        const isToday = isSameDay(day, new Date());

                        const prefIndex = coverPrefs[dateKey] || 0;
                        const coverIndex = hasPhotos ? Math.abs(prefIndex % dayPhotos.length) : 0;
                        const cover = hasPhotos ? dayPhotos[coverIndex] : null;

                        if (!isCurrentMonth) {
                          return (
                            <div key={dIdx} className="relative w-full" style={{ paddingBottom: '100%' }} />
                          );
                        }

                        return (
                          <div key={dIdx} className="relative w-full" style={{ paddingBottom: '100%' }}>
                            <div 
                              className={`
                                absolute inset-0 rounded-sm overflow-hidden
                                flex items-center justify-center
                                ${hasPhotos ? 'ring-1 ring-primary/50' : ''}
                                ${isToday ? 'ring-2 ring-primary' : ''}
                                ${isToday ? 'bg-primary/20' : 'bg-content2/40'}
                              `}
                            >
                              {hasPhotos && cover ? (
                                <img
                                  src={getPhotoUrl(cover)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className={`text-[9px] ${isToday ? 'text-primary font-bold' : 'text-default-500'}`}>
                                  {format(day, 'd')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

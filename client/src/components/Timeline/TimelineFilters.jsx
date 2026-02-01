/**
 * TimelineFilters - Year and Month filter buttons
 * Uses HeroUI Button and Chip components for modern UI
 */
import React from 'react';
import { Button, Chip } from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { useTimeline } from './TimelineContext';

export default function TimelineFilters() {
  const {
    selectedYear,
    selectedMonth,
    setSelectedYear,
    setSelectedMonth,
    years,
    monthsForYear,
    counts
  } = useTimeline();

  const handleYearClick = (year) => {
    if (year === null) {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else {
      setSelectedYear(year);
      setSelectedMonth('All');
    }
  };

  return (
    <div className="space-y-4">
      {/* Year Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays className="text-zinc-400 dark:text-zinc-500" size={18} />
        
        <Button
          size="sm"
          variant={!selectedYear ? 'solid' : 'flat'}
          color={!selectedYear ? 'primary' : 'default'}
          onPress={() => handleYearClick(null)}
          className="font-medium"
        >
          Recent
        </Button>

        {years.map(year => {
          const count = counts.get(year)?.total ?? 0;
          const isActive = selectedYear === year;
          
          return (
            <Button
              key={year}
              size="sm"
              variant={isActive ? 'solid' : 'flat'}
              color={isActive ? 'primary' : 'default'}
              onPress={() => handleYearClick(year)}
              className="font-medium"
              endContent={
                <Chip size="sm" variant="flat" classNames={{
                  base: isActive ? 'bg-primary-200/50' : 'bg-default-200',
                  content: 'text-xs font-medium'
                }}>
                  {count}
                </Chip>
              }
            >
              {year}
            </Button>
          );
        })}
      </div>

      {/* Month Filters (animated) */}
      <AnimatePresence mode="wait">
        {selectedYear && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 flex-wrap pl-6">
              <ChevronRight className="text-zinc-400 dark:text-zinc-500" size={16} />
              
              <Button
                size="sm"
                variant={selectedMonth === 'All' ? 'solid' : 'bordered'}
                color={selectedMonth === 'All' ? 'secondary' : 'default'}
                onPress={() => setSelectedMonth('All')}
                className="font-medium min-w-10"
              >
                All
              </Button>

              {monthsForYear.map(month => {
                const count = counts.get(selectedYear)?.months?.get(month) ?? 0;
                const isActive = selectedMonth === month;
                
                // Get month name
                const monthName = new Date(2000, parseInt(month) - 1).toLocaleString('en-US', { month: 'short' });
                
                return (
                  <Button
                    key={month}
                    size="sm"
                    variant={isActive ? 'solid' : 'bordered'}
                    color={isActive ? 'secondary' : 'default'}
                    onPress={() => setSelectedMonth(month)}
                    className="font-medium min-w-16"
                    endContent={count > 0 && (
                      <span className="text-xs opacity-70">
                        {count}
                      </span>
                    )}
                  >
                    {monthName}
                  </Button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

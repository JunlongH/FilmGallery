/**
 * TimelineView - Main timeline container
 * Orchestrates TimelineFilters, Calendar/Month grids, and RollGrid
 * 
 * Architecture:
 * - TimelineProvider: Manages shared state (year/month selection, rolls data)
 * - TimelineFilters: Year/month selection buttons
 * - TimelineCalendarGrid: Day-by-day calendar view (when month selected)
 * - TimelineMonthGrid: Month-based horizontal timeline
 * - TimelineRollGrid: Photo card grid
 */
import React from 'react';
import { Card, CardBody, Spinner } from '@heroui/react';
import { motion } from 'framer-motion';
import { TimelineProvider, useTimeline } from './TimelineContext';
import TimelineFilters from './TimelineFilters';
import TimelineCalendarGrid from './TimelineCalendarGrid';
import TimelineMonthGrid from './TimelineMonthGrid';
import TimelineRollGrid from './TimelineRollGrid';

function TimelineContent() {
  const { selectedYear, selectedMonth, isLoading, error } = useTimeline();

  // Determine which grid to show
  const showCalendarGrid = selectedYear && selectedMonth && selectedMonth !== 'All';
  const showMonthGrid = !showCalendarGrid;

  if (error) {
    return (
      <Card className="bg-danger-50 border border-danger-200">
        <CardBody className="p-6 text-center text-danger">
          Failed to load timeline data: {error.message}
        </CardBody>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Timeline Grid */}
      <div>
        {showCalendarGrid ? (
          <TimelineCalendarGrid />
        ) : (
          <TimelineMonthGrid />
        )}
      </div>

      {/* Roll Cards Grid */}
      <TimelineRollGrid />
    </motion.div>
  );
}

export default function TimelineView() {
  return (
    <TimelineProvider>
      <div className="p-6 space-y-6">
        {/* Header with Filters */}
        <Card className="bg-content1/60 backdrop-blur-md border border-divider shadow-sm">
          <CardBody className="p-4">
            <TimelineFilters />
          </CardBody>
        </Card>

        {/* Main Content */}
        <TimelineContent />
      </div>
    </TimelineProvider>
  );
}

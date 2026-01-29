/**
 * LifeLog Module (Photo Calendar)
 * 
 * A photo-centric calendar that shows daily photos.
 * Supports month and year views with interactive navigation.
 * 
 * Components:
 * - LifeLogView: Main container with navigation
 * - LifeLogMonthGrid: Month view calendar grid
 * - LifeLogYearGrid: Year overview with mini calendars
 * - LifeLogDayModal: Modal for viewing a day's photos
 * - LifeLogContext: Shared state management
 */

export { default as LifeLogView } from './LifeLogView';
export { default as LifeLogMonthGrid } from './LifeLogMonthGrid';
export { default as LifeLogYearGrid } from './LifeLogYearGrid';
export { default as LifeLogDayModal } from './LifeLogDayModal';
export { LifeLogProvider, useLifeLog } from './LifeLogContext';

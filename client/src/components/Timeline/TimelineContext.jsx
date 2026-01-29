/**
 * TimelineContext - Shared state management for Timeline components
 * Manages year/month selection, computed timeline data, and palette
 */
import React, { createContext, useContext, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRolls } from '../../api';

const TimelineContext = createContext(null);

// Color palette for roll visualization
const PALETTE = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', 
  '#E6B3FF', '#FFB3E6', '#B3FFF0', '#E2F0CB', '#FFDAC1', 
  '#C7CEEA', '#FF9AA2', '#E2F0CB', '#B5EAD7', '#C7CEEA', 
  '#F0E68C', '#D8BFD8', '#ADD8E6', '#90EE90', '#FFB6C1'
];

/**
 * Group rolls by year and month
 */
function groupByYearMonth(rolls) {
  const map = new Map();
  rolls.forEach(r => {
    const date = r.start_date || r.startDate || r.shot_date || r.created_at || r.createdAt || r.date || null;
    let year = 'Unknown';
    let month = 'All';
    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        year = String(d.getFullYear());
        month = String(d.getMonth() + 1).padStart(2, '0');
      }
    }
    if (!map.has(year)) map.set(year, new Map());
    const months = map.get(year);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(r);
  });
  return map;
}

/**
 * Get date from roll object
 */
export function getRollDate(roll, type = 'start') {
  if (type === 'start') {
    return roll.start_date || roll.startDate || roll.shot_date || roll.created_at || roll.createdAt || roll.date || null;
  }
  return roll.end_date || roll.endDate || null;
}

export function TimelineProvider({ children }) {
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Fetch rolls data
  const { data: rolls = [], isLoading, error } = useQuery({
    queryKey: ['rolls'],
    queryFn: () => getRolls()
  });

  // Group rolls by year/month
  const grouped = useMemo(() => groupByYearMonth(rolls), [rolls]);

  // Get sorted years
  const years = useMemo(() => 
    Array.from(grouped.keys()).sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return Number(b) - Number(a);
    }), [grouped]
  );

  // Get months for selected year
  const monthsForYear = useMemo(() => {
    if (!selectedYear) return [];
    const monthsSet = new Set();
    const monthsMap = grouped.get(selectedYear) || new Map();
    Array.from(monthsMap.keys()).forEach(m => monthsSet.add(m));
    
    // Add months from roll date ranges
    const rollsInYear = Array.from(monthsMap.values()).flat();
    rollsInYear.forEach(r => {
      const s = getRollDate(r, 'start');
      const e = getRollDate(r, 'end');
      const rs = s ? new Date(s) : null;
      const re = e ? new Date(e) : null;
      if (!rs && !re) return;
      const yearNum = Number(selectedYear);
      const startMonth = rs && rs.getFullYear() === yearNum ? rs.getMonth() + 1 : 1;
      const endMonth = re && re.getFullYear() === yearNum ? re.getMonth() + 1 : 12;
      for (let mm = startMonth; mm <= endMonth; mm++) {
        monthsSet.add(String(mm).padStart(2, '0'));
      }
    });
    return Array.from(monthsSet).sort((a, b) => Number(a) - Number(b));
  }, [grouped, selectedYear]);

  // Count rolls per year/month
  const counts = useMemo(() => {
    const out = new Map();
    grouped.forEach((months, year) => {
      let total = 0;
      const mcounts = new Map();
      months.forEach((list, m) => {
        mcounts.set(m, list.length);
        total += list.length;
      });
      out.set(year, { total, months: mcounts });
    });
    return out;
  }, [grouped]);

  // Get rolls for current selection
  const selectedRolls = useMemo(() => {
    if (!selectedYear) return rolls;
    const months = grouped.get(selectedYear);
    if (!months) return [];
    if (!selectedMonth || selectedMonth === 'All') {
      return Array.from(months.values()).flat();
    }
    return months.get(selectedMonth) || [];
  }, [rolls, grouped, selectedYear, selectedMonth]);

  const value = {
    // State
    selectedYear,
    selectedMonth,
    setSelectedYear,
    setSelectedMonth,
    // Data
    rolls,
    grouped,
    years,
    monthsForYear,
    counts,
    selectedRolls,
    isLoading,
    error,
    // Utils
    palette: PALETTE,
    getRollColor: (rollId) => PALETTE[(Number(rollId) || 0) % PALETTE.length]
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimeline() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error('useTimeline must be used within TimelineProvider');
  }
  return context;
}

export default TimelineContext;

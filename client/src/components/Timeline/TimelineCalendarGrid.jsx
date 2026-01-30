/**
 * TimelineCalendarGrid - Calendar-style day view for a specific month
 * Shows a month calendar with roll activity indicators
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@heroui/react';
import { motion } from 'framer-motion';
import { useTimeline, getRollDate } from './TimelineContext';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimelineCalendarGrid() {
  const { selectedYear, selectedMonth, rolls, getRollColor } = useTimeline();
  const navigate = useNavigate();

  const calendarData = useMemo(() => {
    if (!selectedYear || !selectedMonth || selectedMonth === 'All') {
      return null;
    }

    const y = Number(selectedYear);
    const m = Number(selectedMonth);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const prevMonthLast = new Date(y, m - 1, 0).getDate();

    // Build weeks array
    const weeks = [];
    let day = 1;

    // First week
    const firstWeek = [];
    for (let i = 0; i < 7; i++) {
      if (i < firstDay) {
        const d = prevMonthLast - (firstDay - 1 - i);
        firstWeek.push({ day: d, inMonth: false, date: new Date(y, m - 2, d) });
      } else {
        firstWeek.push({ day, inMonth: true, date: new Date(y, m - 1, day) });
        day++;
      }
    }
    weeks.push(firstWeek);

    // Remaining weeks
    let nextMonthDay = 1;
    while (day <= daysInMonth) {
      const week = [];
      for (let j = 0; j < 7; j++) {
        if (day > daysInMonth) {
          week.push({ day: nextMonthDay, inMonth: false, date: new Date(y, m, nextMonthDay) });
          nextMonthDay++;
        } else {
          week.push({ day, inMonth: true, date: new Date(y, m - 1, day) });
          day++;
        }
      }
      weeks.push(week);
    }

    // Get first and last cell dates
    const firstCell = weeks[0][0].date;
    const lastWeek = weeks[weeks.length - 1];
    const lastCell = lastWeek[lastWeek.length - 1].date;

    // Filter rolls that overlap with this calendar view
    const relevantRolls = rolls.filter(r => {
      const s = getRollDate(r, 'start');
      const e = getRollDate(r, 'end');
      const rs = s ? new Date(s) : null;
      const re = e ? new Date(e) : null;
      if (!rs && !re) return false;
      const startCheck = rs || new Date(-8640000000000000);
      const endCheck = re || new Date(8640000000000000);
      return startCheck <= lastCell && endCheck >= firstCell;
    });

    return { weeks, firstCell, lastCell, relevantRolls, daysInMonth };
  }, [selectedYear, selectedMonth, rolls]);

  if (!calendarData) return null;

  const { weeks, relevantRolls } = calendarData;

  // Check if a roll is active on a specific date
  const getRollsForDate = (date) => {
    const dateMid = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return relevantRolls.filter(r => {
      const sStr = getRollDate(r, 'start');
      const eStr = getRollDate(r, 'end');
      const rs = sStr ? new Date(sStr) : null;
      const re = eStr ? new Date(eStr) : null;
      const sMid = rs ? new Date(rs.getFullYear(), rs.getMonth(), rs.getDate()).getTime() : -8640000000000000;
      const eMid = re ? new Date(re.getFullYear(), re.getMonth(), re.getDate()).getTime() : 8640000000000000;
      return dateMid >= sMid && dateMid <= eMid;
    });
  };

  return (
    <Card className="bg-content1/60 backdrop-blur-md shadow-sm">
      <CardBody className="p-4">
        {/* Weekday Header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(day => (
            <div 
              key={day} 
              className="text-center text-xs font-semibold text-default-500 py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="space-y-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-1">
              {week.map((cell, dayIndex) => {
                const activeRolls = getRollsForDate(cell.date);
                const hasActivity = activeRolls.length > 0;

                return (
                  <motion.div
                    key={dayIndex}
                    whileHover={{ scale: hasActivity ? 1.05 : 1 }}
                    className={`
                      relative aspect-square rounded-lg p-1 flex flex-col
                      ${cell.inMonth ? 'bg-default-100' : 'bg-default-50 opacity-50'}
                      ${hasActivity ? 'cursor-pointer hover:bg-default-200' : ''}
                      transition-colors duration-150
                    `}
                    onClick={() => {
                      if (hasActivity && activeRolls.length === 1) {
                        navigate(`/rolls/${activeRolls[0].id}`);
                      }
                    }}
                  >
                    {/* Day Number */}
                    <span className={`
                      text-xs font-medium
                      ${cell.inMonth ? 'text-default-700' : 'text-default-400'}
                    `}>
                      {cell.day}
                    </span>

                    {/* Activity Indicators */}
                    {hasActivity && (
                      <div className="flex-1 flex flex-wrap gap-0.5 items-end justify-start mt-1">
                        {activeRolls.slice(0, 4).map(roll => (
                          <motion.div
                            key={roll.id}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getRollColor(roll.id) }}
                            title={roll.title || 'Untitled'}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/rolls/${roll.id}`);
                            }}
                          />
                        ))}
                        {activeRolls.length > 4 && (
                          <span className="text-[10px] text-default-500">
                            +{activeRolls.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

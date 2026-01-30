/**
 * TimelineMonthGrid - Month-based timeline visualization
 * Shows rolls as horizontal bars across months
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Chip } from '@heroui/react';
import { motion } from 'framer-motion';
import { useTimeline, getRollDate } from './TimelineContext';

export default function TimelineMonthGrid() {
  const { 
    selectedYear, 
    selectedMonth, 
    rolls, 
    getRollColor 
  } = useTimeline();
  const navigate = useNavigate();

  const timelineData = useMemo(() => {
    const toIndex = (y, m) => y * 12 + (m - 1);
    let minIdx = Infinity;
    let maxIdx = -Infinity;

    // Determine range
    if (!selectedYear) {
      // Recent: last 12 months
      const now = new Date();
      maxIdx = toIndex(now.getFullYear(), now.getMonth() + 1);
      minIdx = maxIdx - 11;
    } else if (!selectedMonth || selectedMonth === 'All') {
      // Full year view
      const y = Number(selectedYear);
      minIdx = toIndex(y, 1);
      maxIdx = toIndex(y, 12);
    }

    // Process rolls
    const rows = rolls.map(r => {
      const s = getRollDate(r, 'start');
      const e = getRollDate(r, 'end');
      let si = null, ei = null;
      
      if (s) {
        const d = new Date(s);
        if (!isNaN(d)) si = toIndex(d.getFullYear(), d.getMonth() + 1);
      }
      if (e) {
        const d = new Date(e);
        if (!isNaN(d)) ei = toIndex(d.getFullYear(), d.getMonth() + 1);
      }
      
      // Normalize indices
      if (si === null && ei !== null) si = ei;
      if (si !== null && ei === null) ei = si;

      // Filter out of range rolls for "Recent" view
      if (!selectedYear) {
        if (si === null && ei === null) return null;
        const effEnd = ei ?? Infinity;
        const effStart = si ?? -Infinity;
        if (effEnd < minIdx || effStart > maxIdx) return null;
      }

      return {
        id: r.id,
        title: r.title,
        displaySeq: r.display_seq,
        startIndex: si,
        endIndex: ei,
        roll: r
      };
    }).filter(Boolean);

    // Generate labels
    const labels = [];
    for (let idx = minIdx; idx <= maxIdx; idx++) {
      const yy = Math.floor(idx / 12);
      const mm = (idx % 12) + 1;
      labels.push({
        idx,
        year: String(yy),
        month: String(mm).padStart(2, '0'),
        monthName: new Date(yy, mm - 1).toLocaleString('en-US', { month: 'short' })
      });
    }

    // Track active months
    const activeSet = new Set();
    rows.forEach(row => {
      if (row.startIndex != null && row.endIndex != null) {
        for (let i = row.startIndex; i <= row.endIndex; i++) {
          activeSet.add(i);
        }
      }
    });

    return { labels, rows, activeSet, minIdx, maxIdx };
  }, [rolls, selectedYear, selectedMonth]);

  const { labels, rows } = timelineData;

  if (labels.length === 0) {
    return (
      <Card className="bg-content1/60 backdrop-blur-md">
        <CardBody className="p-6 text-center text-default-500">
          No timeline data available
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="bg-content1/60 backdrop-blur-md shadow-sm">
      <CardBody className="p-4 w-full overflow-hidden">
        {/* Month Headers */}
        <div 
          className="grid gap-1 mb-4 w-full items-end pb-2 border-b border-divider/50"
          style={{ gridTemplateColumns: `220px repeat(${labels.length}, 1fr)` }}
        >
          <div className="font-semibold text-default-600 text-sm px-2">
            {selectedYear ? `Year ${selectedYear}` : 'Recent Activity'}
          </div>
          {labels.map(label => (
            <div 
              key={label.idx}
              className="text-center"
            >
              <div className="text-[10px] text-default-400 leading-tight">{label.year}</div>
              <div className="text-xs font-semibold text-default-600">{label.monthName}</div>
            </div>
          ))}
        </div>

        {/* Roll Rows */}
        <div className="space-y-1">
          {rows.map((row, index) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
              className="grid gap-1 group items-center"
              style={{ gridTemplateColumns: `220px repeat(${labels.length}, 1fr)` }}
            >
              {/* Roll Label */}
              <div 
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer
                           hover:bg-default-100 transition-colors"
                onClick={() => navigate(`/rolls/${row.id}`)}
              >
                <Chip 
                  size="sm" 
                  variant="flat" 
                  className="min-w-10 font-semibold"
                  style={{ backgroundColor: getRollColor(row.id) + '60', color: 'inherit' }}
                >
                  #{row.displaySeq ?? row.id}
                </Chip>
                <span className="text-sm text-default-700 truncate group-hover:text-primary transition-colors font-medium">
                  {row.title || 'Untitled'}
                </span>
              </div>

              {/* Month Cells */}
              {labels.map(label => {
                const isActive = row.startIndex != null && 
                                 row.endIndex != null && 
                                 label.idx >= row.startIndex && 
                                 label.idx <= row.endIndex;
                
                const isStart = label.idx === row.startIndex;
                const isEnd = label.idx === row.endIndex;

                return (
                  <motion.div
                    key={label.idx}
                    whileHover={{ scale: isActive ? 1.05 : 1 }}
                    className={`
                      h-5 rounded-sm transition-all duration-150
                      ${isActive ? 'cursor-pointer shadow-sm' : ''}
                      ${isStart ? 'rounded-l-full' : ''}
                      ${isEnd ? 'rounded-r-full' : ''}
                    `}
                    style={{
                      backgroundColor: isActive 
                        ? getRollColor(row.id) 
                        : 'var(--heroui-default-100)',
                      opacity: isActive ? 0.85 : 0.4
                    }}
                    onClick={() => isActive && navigate(`/rolls/${row.id}`)}
                    title={isActive ? `${row.title || 'Untitled'} - ${label.monthName} ${label.year}` : ''}
                  />
                );
              })}
            </motion.div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

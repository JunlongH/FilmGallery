import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRolls, buildUploadUrl } from '../api';
import { useNavigate } from 'react-router-dom';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/opacity.css';

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

export default function Overview() {
  const { data: rolls = [] } = useQuery({
    queryKey: ['rolls'],
    queryFn: getRolls
  });
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const nav = useNavigate();
  // soft coordinated palette for roll colors (expanded)
  const palette = useMemo(() => [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', // Pastel Red, Orange, Yellow, Green, Blue
    '#E6B3FF', '#FFB3E6', '#B3FFF0', '#E2F0CB', '#FFDAC1', // Purple, Pink, Cyan, Lime, Peach
    '#C7CEEA', '#FF9AA2', '#E2F0CB', '#B5EAD7', '#C7CEEA', // Periwinkle, Salmon, etc.
    '#F0E68C', '#D8BFD8', '#ADD8E6', '#90EE90', '#FFB6C1'  // Khaki, Thistle, LightBlue, LightGreen, LightPink
  ], []);

  const grouped = useMemo(()=> groupByYearMonth(rolls), [rolls]);

  // list of years sorted desc (Unknown last)
  const years = useMemo(()=> Array.from(grouped.keys()).sort((a,b)=>{
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return Number(b) - Number(a);
  }), [grouped]);

  // available months for the selected year (include months overlapped by any roll)
  const monthsForSelectedYear = useMemo(()=>{
    if (!selectedYear) return [];
    const monthsSet = new Set();
    const monthsMap = grouped.get(selectedYear) || new Map();
    // add months that are present in grouping
    Array.from(monthsMap.keys()).forEach(m => monthsSet.add(m));
    // also consider rolls in that year and expand ranges they overlap
    const rollsInYear = Array.from(monthsMap.values()).flat();
    rollsInYear.forEach(r => {
      const s = r.start_date || r.startDate || r.shot_date || r.created_at || r.createdAt || r.date || null;
      const e = r.end_date || r.endDate || null;
      const rs = s ? new Date(s) : null;
      const re = e ? new Date(e) : null;
      // if neither, skip
      if (!rs && !re) return;
      const yearNum = Number(selectedYear);
      // compute month range intersecting this year
      const startMonth = rs ? rs.getFullYear() === yearNum ? rs.getMonth()+1 : 1 : 1;
      const endMonth = re ? re.getFullYear() === yearNum ? re.getMonth()+1 : 12 : 12;
      for (let mm = startMonth; mm <= endMonth; mm++) monthsSet.add(String(mm).padStart(2,'0'));
    });
    // return sorted months
    return Array.from(monthsSet).sort((a,b)=> Number(a) - Number(b));
  }, [grouped, selectedYear]);

  // NOTE: do not auto-select a year on load — start in Random view

  // initial random thumbnails (choose up to 8)
  const randomThumbs = useMemo(()=>{
    if (!rolls || rolls.length === 0) return [];
    const pool = rolls.slice();
    // shuffle
    for (let i = pool.length -1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0,8).map(r => ({ id: r.id, title: r.title, cover: r.coverPath || r.cover_photo }));
  }, [rolls]);

  // thumbnails/grid displayed under controls
  const displayed = useMemo(()=>{
    if (!selectedYear) return randomThumbs;
    const months = grouped.get(selectedYear);
    if (!months) return [];
    if (!selectedMonth || selectedMonth === 'All') {
      // flatten months of this year
      return Array.from(months.values()).flat().map(r=>({ id:r.id, title:r.title, cover: r.coverPath || r.cover_photo }));
    }
    const list = months.get(selectedMonth) || [];
    return list.map(r=>({ id:r.id, title:r.title, cover: r.coverPath || r.cover_photo }));
  }, [selectedYear, selectedMonth, grouped, randomThumbs]);


  // counts helper for year/month buttons
  const counts = useMemo(()=>{
    const out = new Map();
    grouped.forEach((months, year) => {
      let total = 0;
      const mcounts = new Map();
      months.forEach((list, m) => { mcounts.set(m, list.length); total += list.length; });
      out.set(year, { total, months: mcounts });
    });
    return out;
  }, [grouped]);

  // timeline: compute global month/day range and per-roll indices
  const timeline = useMemo(()=>{
    // derive source rolls depending on selected year/month
    let source = rolls;
    if (selectedYear) {
      const months = grouped.get(selectedYear) || new Map();
      // always start from all rolls in the year (so multi-month rolls can be split across months)
      source = Array.from(months.values()).flat();
    }
    if (!source || source.length === 0) return { mode:'none', labels: [], rows: [] };

    // if a month is selected, show day-level view for that month

    if (selectedMonth && selectedMonth !== 'All' && selectedYear) {
      // determine year/month numeric
      const y = Number(selectedYear);
      const m = Number(selectedMonth);
      const daysInMonth = new Date(y, m, 0).getDate();
      const labels = [];
      for (let d = 1; d <= daysInMonth; d++) labels.push({ idx: d, label: String(d).padStart(2, '0') });

      // build calendar weeks with Date objects and inMonth flag (include prev/next month dates)
      const weeks = [];
      const firstDay = new Date(y, m - 1, 1).getDay(); // 0-6
      // previous month last day
      const prevMonthLast = new Date(y, m - 1, 0).getDate();
      let day = 1;
      // first week
      const firstWeek = new Array(7).fill(null).map((_, i) => {
        if (i < firstDay) {
          const d = prevMonthLast - (firstDay - 1 - i);
          const dateObj = new Date(y, m - 2, d);
          return { day: d, inMonth: false, date: dateObj };
        }
        const dateObj = new Date(y, m - 1, day);
        const out = { day: day, inMonth: true, date: dateObj };
        day++;
        return out;
      });
      weeks.push(firstWeek);
        let nextDay = 1;
        while (day <= daysInMonth) {
          const w = new Array(7).fill(null).map(() => {
            if (day > daysInMonth) {
              const dateObj = new Date(y, m, nextDay);
              const cell = { day: nextDay, inMonth: false, date: dateObj };
              nextDay++;
              return cell;
            }
            const dateObj = new Date(y, m - 1, day);
            const cell = { day: day, inMonth: true, date: dateObj };
            day++;
            return cell;
          });
          weeks.push(w);
      }

      // determine displayed date range (first cell to last cell)
      const firstCell = weeks[0][0].date;
      const lastWeek = weeks[weeks.length - 1];
      const lastCell = lastWeek[lastWeek.length - 1].date;

      // include any rolls that overlap the displayed range (so adjacent-month rolls show indicators)
      const rows = rolls.map(r => r).filter(r => {
        const s = r.start_date || r.startDate || r.shot_date || r.created_at || r.createdAt || r.date || null;
        const e = r.end_date || r.endDate || null;
        const rs = s ? new Date(s) : null;
        const re = e ? new Date(e) : null;
        // if no dates, skip
        if (!rs && !re) return false;
        // normalize open-ended dates
        const startCheck = rs || new Date(-8640000000000000);
        const endCheck = re || new Date(8640000000000000);
        // overlap if startCheck <= lastCell && endCheck >= firstCell
        return startCheck <= lastCell && endCheck >= firstCell;
      }).map(r => ({ id: r.id, title: r.title, roll: r }));

      // compute active set of days in-month that have at least one roll (for quick checks)
      const activeSet = new Set();
      // rows here include roll objects with full dates; compute day numbers for those that intersect the month
      rows.forEach(rr => {
        const s = rr.roll.start_date || rr.roll.startDate || rr.roll.shot_date || rr.roll.created_at || rr.roll.createdAt || rr.roll.date || null;
        const e = rr.roll.end_date || rr.roll.endDate || null;
        const rs = s ? new Date(s) : null;
        const re = e ? new Date(e) : null;
        // compute overlap with this month
        const clipStart = rs && rs > new Date(y, m - 1, 1) ? rs.getDate() : 1;
        const clipEnd = re && re < new Date(y, m, 0) ? re.getDate() : daysInMonth;
        if (clipStart != null && clipEnd != null) {
          for (let d = clipStart; d <= clipEnd; d++) activeSet.add(d);
        }
      });
      return { mode: 'days', labels, rows, activeSet, weeks, daysInMonth };
    }

    // otherwise month-level view across source
    const toIndex = (y,m) => y*12 + (m-1);
    let minIdx = Infinity, maxIdx = -Infinity;

    // If no year selected, default to "Recent 12 Months"
    if (!selectedYear) {
      const now = new Date();
      maxIdx = toIndex(now.getFullYear(), now.getMonth() + 1);
      minIdx = maxIdx - 11;
    }

    const rows = source.map(r => {
      const s = r.start_date || r.startDate || r.shot_date || r.created_at || r.createdAt || r.date || null;
      const e = r.end_date || r.endDate || null;
      let si = null, ei = null;
      if (s) { const d = new Date(s); if (!isNaN(d)) si = toIndex(d.getFullYear(), d.getMonth()+1); }
      if (e) { const d = new Date(e); if (!isNaN(d)) ei = toIndex(d.getFullYear(), d.getMonth()+1); }
      if (si === null && ei !== null) si = ei;
      if (si !== null && ei === null) ei = si;
      
      // For "Recent 12 Months" view, we only care about rolls that overlap the window
      if (!selectedYear) {
        if (si === null && ei === null) return null; // skip undated
        // normalize
        const effStart = si !== null ? si : -Infinity;
        const effEnd = ei !== null ? ei : Infinity;
        // check overlap
        if (effEnd < minIdx || effStart > maxIdx) return null;
        // clamp for display purposes (optional, but helps grid alignment)
        // actually, we want to keep original indices to show they extend out, 
        // but for the grid rendering we iterate minIdx to maxIdx.
      } else {
        if (si !== null) minIdx = Math.min(minIdx, si);
        if (ei !== null) maxIdx = Math.max(maxIdx, ei);
      }
      return { id: r.id, title: r.title, startIndex: si, endIndex: ei, roll: r };
    }).filter(r => r !== null);

    // if a specific year is selected (and not a specific month), show the full year's 12 months
    if (selectedYear && (!selectedMonth || selectedMonth === 'All')) {
      const y = Number(selectedYear);
      minIdx = toIndex(y, 1);
      maxIdx = toIndex(y, 12);
    }
    
    if (minIdx === Infinity) return { mode:'none', labels: [], rows: [] };
    
    const labels = [];
    for (let idx = minIdx; idx <= maxIdx; idx++) {
      const yy = Math.floor(idx/12);
      const mm = (idx % 12) + 1;
      labels.push({ idx, year: String(yy), month: String(mm).padStart(2,'0') });
    }
    // compute active months (indices) that contain at least one roll
    const activeSet = new Set();
    rows.forEach(rr => {
      if (rr.startIndex != null && rr.endIndex != null) {
        for (let i = rr.startIndex; i <= rr.endIndex; i++) activeSet.add(i);
      }
    });
    return { mode:'months', labels, rows, activeSet };
  }, [rolls, selectedYear, selectedMonth, grouped]);

  // choose thumbnails to render in overview-grid: when in day-mode use the visible rows (rolls overlapping displayed range)
  const thumbsForGrid = useMemo(()=>{
    // If in "Recent 12 Months" mode (no selectedYear), use the timeline rows
    if (!selectedYear && timeline && timeline.mode === 'months') {
       return (timeline.rows || []).map(r => ({ id: r.id, title: r.title, cover: (r.roll && (r.roll.coverPath || r.roll.cover_photo)) }));
    }
    if (!timeline || timeline.mode !== 'days') return displayed;
    // map timeline.rows (which include roll objects) to thumbnail items
    return (timeline.rows || []).map(r => ({ id: r.id, title: r.title, cover: (r.roll && (r.roll.coverPath || r.roll.cover_photo)) }));
  }, [timeline, displayed, selectedYear]);

  return (
    <div className="overview-root">
      <div className="overview-header">
        <h2>Overview</h2>
        <div className="overview-controls">
          <div className="years">
            <button className={`year-btn${!selectedYear ? ' active' : ''}`} onClick={()=>{ setSelectedYear(null); setSelectedMonth(null); }}>Recent</button>
            {years.map(y => (
              <button key={y} className={`year-btn${selectedYear===y ? ' active' : ''}`} onClick={()=>{ setSelectedYear(y); setSelectedMonth('All'); }} title={`${counts.get(y)?.total ?? 0} rolls`}>{y}</button>
            ))}
          </div>
          {selectedYear ? (
            <div className="months">
              <button className={`month-btn${selectedMonth==='All' ? ' active' : ''}`} onClick={()=>setSelectedMonth('All')}>All</button>
              {monthsForSelectedYear.map(m => (
                <button key={m} className={`month-btn${selectedMonth===m ? ' active' : ''}`} onClick={()=>setSelectedMonth(m)} title={`${counts.get(selectedYear)?.months?.get(m) ?? 0} rolls`}>{m}</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Timeline visualization (moved above thumbnails) */}
      <div className="timeline-container">
        <h3>Timeline</h3>
        {(!timeline || timeline.labels.length === 0) ? <div style={{ color:'#666' }}>No timeline data</div> : (
          <div className={`timeline ${timeline.mode}`}>
            <div className="timeline-header">
              <div className="timeline-label">
                {!selectedYear ? (
                  'Recent year'
                ) : (selectedMonth && selectedMonth !== 'All') ? (
                  <div className="header-ym">
                    <div className="header-year">{selectedYear}</div>
                    <div className="header-month">{selectedMonth}</div>
                  </div>
                ) : (
                  <div className="header-year-only">{selectedYear}</div>
                )}
              </div>
              <div className="timeline-months">
                {selectedYear && (!selectedMonth || selectedMonth==='All') ? (
                  // wrap months across multiple lines like Random thumbnails
                  <div className="year-month-grid">
                    {timeline.labels.map((m) => {
                      const has = timeline.activeSet && timeline.activeSet.has(m.idx);
                      return (
                        <button key={m.idx} className={`month-cell month-btn`} title={`${m.year}-${m.month}`} onClick={() => { if (has) { setSelectedYear(String(Math.floor(m.idx/12))); setSelectedMonth(String((m.idx % 12) + 1).padStart(2,'0')); } }}>
                          <div className="month-label">
                            <div className="month-year">{m.year}</div>
                            <div className="month-month">{m.month}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // single-row month display (month/day columns) OR day-mode calendar grid
                  (timeline.mode === 'months') ? (
                    timeline.labels.map((m) => {
                      const has = timeline.activeSet && timeline.activeSet.has(m.idx);
                      return (
                        <button key={m.idx} className={`month-cell month-btn`} title={`${m.year}-${m.month}`} onClick={() => { if (has) { setSelectedYear(String(Math.floor(m.idx/12))); setSelectedMonth(String((m.idx % 12) + 1).padStart(2,'0')); } }}>
                          <div className="month-label">
                            <div className="month-year">{m.year}</div>
                            <div className="month-month">{m.month}</div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    // days (calendar) view: render weekday header and weeks
                    <div className="calendar-header">
                      <div className="weekday-row">
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(w => (
                          <div key={w} className="weekday-cell">{w}</div>
                        ))}
                      </div>
                      <div className="calendar-weeks">
                        {timeline.weeks.map((week, wi) => (
                          <div key={wi} className="calendar-week-block">
                            <div className="calendar-week">
                              {week.map((cell, di) => {
                                // cell is { day, inMonth, date }
                                const inMonth = cell && cell.inMonth;
                                const dayNum = cell ? cell.day : null;
                                const has = cell && inMonth && timeline.activeSet && timeline.activeSet.has(dayNum);
                                // collect rolls active on this date (compare actual dates)
                                const activeRolls = cell ? (timeline.rows || []).filter(r => {
                                  const sStr = r.roll.start_date || r.roll.startDate || r.roll.shot_date || r.roll.created_at || r.roll.createdAt || r.roll.date || null;
                                  const eStr = r.roll.end_date || r.roll.endDate || null;
                                  const rs = sStr ? new Date(sStr) : null;
                                  const re = eStr ? new Date(eStr) : null;
                                  const cellDate = cell.date;
                                  const cellMid = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate()).getTime();
                                  const sMid = rs ? new Date(rs.getFullYear(), rs.getMonth(), rs.getDate()).getTime() : -8640000000000000;
                                  const eMid = re ? new Date(re.getFullYear(), re.getMonth(), re.getDate()).getTime() : 8640000000000000;
                                  return cellMid >= sMid && cellMid <= eMid;
                                }) : [];
                                return (
                                  <div key={di} className="day-column">
                                    <button className={`day-cell month-btn ${has ? 'active' : ''} ${inMonth ? '' : 'out-of-month'}`} title={cell ? `${cell.date.getFullYear()}-${String(cell.date.getMonth()+1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}` : ''} onClick={() => { if (cell && has) { /* optional: drill into day */ } }}>
                                      {cell ? <div className="day-num">{cell.day}</div> : null}
                                    </button>
                                    <div className="indicators">
                                      {activeRolls.map(ar => (
                                        <div key={ar.id} className="indicator-seg" onClick={() => nav(`/rolls/${ar.id}`)} title={ar.title || 'Untitled'} style={{ background: palette[(Number(ar.id) || 0) % palette.length] }} />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="timeline-rows">
              {timeline.mode === 'days' ? null : (
                timeline.rows.map(row => (
                  <div key={row.id} className="timeline-row" onClick={()=>nav(`/rolls/${row.id}`)} title={`${row.title || 'Untitled'} (${row.startIndex ?? '-'} — ${row.endIndex ?? '-'})`} style={{ cursor:'pointer' }}>
                    <div className="timeline-label">{row.title || 'Untitled'}</div>
                    {/* year view: use same wrapping grid as header so columns align */}
                    {selectedYear && (!selectedMonth || selectedMonth === 'All') ? (
                      <div className="year-month-grid">
                        {timeline.labels.map((m) => {
                          let active = false;
                          if (timeline.mode === 'months') {
                            active = row.startIndex !== null && row.endIndex !== null && m.idx >= row.startIndex && m.idx <= row.endIndex;
                          }
                          const color = palette[(Number(row.id) || 0) % palette.length];
                          // Apply 50% opacity to active cells
                          const style = active 
                            ? { backgroundColor: color, opacity: 0.5, boxShadow: 'inset 0 -3px 6px rgba(0,0,0,0.06)' } 
                            : { background: '#f3faf3' };
                          return (
                            <div key={m.idx} className={`month-cell ${active ? 'active' : ''}`} style={style} />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="timeline-months">
                            {timeline.mode === 'months' ? (
                              timeline.labels.map((m) => {
                                let active = false;
                                if (timeline.mode === 'months') {
                                  active = row.startIndex !== null && row.endIndex !== null && m.idx >= row.startIndex && m.idx <= row.endIndex;
                                }
                                const color = palette[(Number(row.id) || 0) % palette.length];
                                // Apply 50% opacity to active cells
                                const style = active 
                                  ? { backgroundColor: color, opacity: 0.5, boxShadow: 'inset 0 -3px 6px rgba(0,0,0,0.06)' } 
                                  : { background: '#f3faf3' };
                                return <div key={m.idx} className={`month-cell ${active ? 'active' : ''}`} style={style} />;
                              })
                            ) : null}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Always show thumbnail grid (user requested previews visible together with calendar) */}
      <div className="overview-grid">
        {thumbsForGrid.map(item => {
          const url = buildUploadUrl(item.cover);
          return (
            <div key={item.id} className="overview-thumb" onClick={()=>nav(`/rolls/${item.id}`)} style={{ cursor: 'pointer' }}>
              {url ? (
                <LazyLoadImage
                  src={url}
                  alt={item.title}
                  effect="opacity"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className="no-cover">No cover</div>
              )}
              <div className="thumb-title">{item.title || 'Untitled'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

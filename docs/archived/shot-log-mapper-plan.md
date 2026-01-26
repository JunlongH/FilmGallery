# Shot Log Mapper Implementation Plan

## Overview
The goal is to implement a visual interface for mapping "Shot Logs" (imported from Inventory) to "Uploaded Files" in the New Roll creation form.

## Current State (v2 - Redesigned)
- New two-panel design: Files on left, Shot Logs on right
- Click-to-assign interaction model
- Each log shows remaining assignment count
- Color-coded assignments for visual clarity

## Requirements
1.  **Visual Mapping**: Two-column layout with files and logs
2.  **Click-to-Assign**: Select a log, then click files to assign
3.  **Drag-to-Assign**: Drag a log onto a file
4.  **Multiple Assignments**: Each log can be assigned to N files (per count)
5.  **Quick Actions**: Auto-fill, Clear per log, Sequential/Reverse global

## Component Design: `ShotLogMapper.jsx` (v2)
- **Type**: Modal / Overlay (rendered via ReactDOM.createPortal)
- **Props**: `files` (array), `shotLogs` (array), `onSave`, `onClose`
- **State**: 
  - `assignments`: `{ [filename]: logIndex }` - which log is assigned to each file
  - `selectedLogIdx`: Currently selected log for click-to-assign
  - `draggingLogIdx`: Currently dragging log

### Layout
```
+-----------------------------------+------------------+
| Header: Title, Stats, Buttons                        |
+-----------------------------------+------------------+
| Files (2/3 width)                 | Shot Logs (1/3)  |
| +-------------------------------+ | +-------------+  |
| | [1] [thumb] filename.jpg      | | | 2025-12-03  |  |
| |     → 2025-12-03 · 50mm      | | | 50mm f/2.8  |  |
| +-------------------------------+ | | 1/3 assigned|  |
| | [2] [thumb] filename2.jpg    | | | [Auto-fill] |  |
| |     (no assignment)          | | +-------------+  |
| +-------------------------------+ |                  |
+-----------------------------------+------------------+
```

## Data Field Mapping
| Shot Log Field | fileMeta Field | Description |
|----------------|----------------|-------------|
| `date` | `date` | Shot date (YYYY-MM-DD) |
| `lens` | `lens` | Lens name |
| `aperture` | `aperture` | F-stop number |
| `shutter_speed` | `shutter_speed` | Shutter speed string |
| `country` | `country` | Country name |
| `city` | `city` | City name |
| `detail_location` | `detail_location` | Specific location |
| `latitude` | `latitude` | GPS latitude coordinate |
| `longitude` | `longitude` | GPS longitude coordinate |
| (block index) | `logIndex` | For visual indicator |

## User Actions
| Action | How | Behavior |
|--------|-----|----------|
| Select Log | Click log card | Enables click-to-assign mode |
| Assign File | Click file row | Assigns selected log to file |
| Drag Assign | Drag log → file | Assigns dragged log to file |
| Remove | Click × on file | Removes assignment |
| 顺序 (Sequential) | Button | Auto-assign in order |
| 逆序 (Reverse) | Button | Auto-assign in reverse |
| 清除 (Clear All) | Button | Remove all assignments |
| Auto-fill | Per-log button | Fill remaining slots with unassigned files |
| Clear | Per-log button | Remove all assignments for this log |

## Visual Feedback
- **Color Coding**: Each log has a unique pastel color
- **Assignment Display**: Files show log date + lens when assigned
- **Count Badge**: Logs show `X/Y` (assigned/max)
- **Selection State**: Selected log has blue border
- **Dashed Border**: Files show dashed border when in assign mode

## Implementation Status
- [x] Two-panel layout
- [x] Click-to-assign interaction
- [x] Drag-to-assign interaction  
- [x] Sequential/Reverse/Clear buttons
- [x] Per-log Auto-fill and Clear
- [x] Color-coded assignments
- [x] Assignment counter per log
- [x] Portal rendering for proper z-index
- [x] Correct field name mapping
- [x] Preview card meta display in main form
- [x] File sorting consistency

## ESLint Issues Fixed
- [x] Removed unused `setLogStartOffset` and `filesCount`
- [x] Removed unused `isOpen` prop check
- [x] Fixed useEffect dependency warning
- [x] Removed duplicate style key

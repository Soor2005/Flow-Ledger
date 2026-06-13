# Rize.io — Complete Design & Feature Reference
# Compiled for Flow Ledger v3 implementation

---

## 1. TYPOGRAPHY

| Role              | Font          | Weight      | Size        |
|-------------------|---------------|-------------|-------------|
| UI / Body         | **Inter**     | 400–600     | 12–14px     |
| Numbers / Timers  | **Inter**     | 700         | 16–32px     |
| Monospace (times) | **JetBrains Mono** | 400–500 | 11–13px   |
| Section headers   | Inter         | 600         | 11px + UPPERCASE + letter-spacing |
| Large stats       | Inter         | 700–800     | 28–40px     |

- Letter spacing on labels: `0.08em` (wide-tracked small caps style)
- Line height: 1.4–1.6 for body, 1.1 for large numbers
- No serif fonts anywhere

---

## 2. COLOR PALETTE

### Backgrounds (dark mode — primary)
```
App background:       #0d1117   (near-black, very dark blue-grey)
Sidebar background:   #0d1117   (same as app)
Card / panel bg:      #161b27   (slightly lighter)
Hover state:          #1c2333
Input / form bg:      #1a2035
Border subtle:        #1e2a3a
Border default:       #243048
```

### Text
```
Primary text:         #e6edf3   (near-white, slight blue tint)
Secondary text:       #8b949e   (medium grey)
Muted / disabled:     #484f58   (dark grey)
Placeholder:          #3d444d
```

### Accent Colors (session category colors)
```
Purple (primary):     #7c3aed  →  Rize brand purple
Purple lighter:       #9d4edd
Blue:                 #2f81f7
Green (focus):        #3fb950
Amber / orange:       #d29922
Red:                  #f85149
Teal:                 #39d353
Pink:                 #ec6cb9
Grey (break):         #6e7681
```

### Category color coding (from screenshot)
```
Focus sessions:       #4c8eda  (cornflower blue)
Meetings:             #f87171  (soft red/coral)  
Design work:          #a78bfa  (lavender purple)
Research:             #34d399  (emerald green)
Break:                #6b7280  (neutral grey)
Writing:              #fb923c  (orange)
Admin/Other:          #60a5fa  (light blue)
```

### Status / Semantic
```
Active / recording:   #3fb950  (green pulse)
Deep work badge:      #d29922  (amber)
Warning:              #e3b341
Destructive:          #f85149
Success:              #3fb950
```

---

## 3. LAYOUT STRUCTURE

```
┌──────────────────────────────────────────────────────────────┐
│  TITLE BAR (frameless, 38px, drag region)                    │
│  [• • •] macOS traffic lights left    [Rize] center          │
├──────────┬───────────────────────────────────────┬───────────┤
│          │  TOP BAR (48px)                       │           │
│ SIDEBAR  │  [◄ ►] Date    [Day|Week|Month|Year]  │  SUMMARY  │
│  (220px) │  [Time entries|Tasks|Projects|Clients]│  PANEL    │
│          ├───────────────────────────────────────┤  (280px)  │
│          │                                       │           │
│          │  MAIN TIMELINE / CONTENT AREA         │           │
│          │  (scrollable, fills remaining height) │           │
│          │                                       │           │
└──────────┴───────────────────────────────────────┴───────────┘
```

### Sidebar breakdown (220px wide)
```
┌─────────────────────┐
│ [Logo] Personal  ▼  │  ← Workspace switcher
├─────────────────────┤
│                     │  ← Active session widget (green pulse)
├─────────────────────┤
│  Dashboard          │
│  Calendar           │  ← MAIN SECTION (no label)
│  Timer              │
│  Aktivity           │
├─────────────────────┤
│  WORK               │  ← Section label (tiny uppercase)
│  Projects           │
│  Clients            │
│  Tasks              │
├─────────────────────┤
│  INSIGHTS           │  ← Section label
│  Overview           │
│  Profitability      │
│  Reports            │
│  Produktivity       │
├─────────────────────┤
│  Feedback           │  ← BOTTOM
│  > Commands         │
│  Support            │
└─────────────────────┘
```

### Summary Panel (right, 280px wide)
- Sticky, always visible alongside calendar
- Header: "Summary — Today" with "Customize" button
- Tabs: Tasks | Projects | Clients
- Sections stacked vertically:
  1. Work Hours (large number) + Percent of Target
  2. "+12% vs yesterday" comparison line
  3. Donut chart (center-hole) with legend
  4. Percent of work day + Focus Time  
  5. Productivity Metrics bar (segmented)
  6. App/website usage list

---

## 4. CALENDAR TIMELINE VIEW (Main View)

### Day view columns (from screenshot)
The timeline has **4 parallel columns**:
1. **Time Entries** — the actual session blocks (auto-tracked)
2. **Tasks** — tasks assigned to that time
3. **Projects** — project-level grouping
4. **Clients** — client association
+ A narrow colored accent column on the right edge

### Session block design
- Left border: 3px solid `category_color`
- Background: `category_color` at ~15% opacity
- Text: category color (title), slate (time range)
- Min height: 20px
- Rounded: `4px`
- Right-side duration label: small, faded
- On hover: `brightness(1.15)`, slight scale
- On click: popup card appears

### Session popup card
```
┌───────────────────────────────────────┐
│ [Team icon] RIZE TEAM    29.30€  C90% │  ← project, cost, progress
│ [✏] [🗑] [✕]                         │
│                                       │
│ 🏷 Designed Rize homepage and Copy  48min│
│ [Macgill] [Landing page]  ← tags     │
│                                       │
│ Created detailed process diagrams...  │  ← AI-generated description
│                                       │
│ Apps & Websites                       │
│  41% ████████   Figma      17 min     │
│  36% ███████    Dia        12 min     │
│  12% ███        Discord     3 min     │
└───────────────────────────────────────┘
```

### Time axis
- Hours `08:00` to `20:00` visible by default
- Left gutter: 52px wide, hour labels right-aligned
- Gridlines: full-width, `1px solid #1e2a3a`
- Half-hour lines: lighter, `0.5px solid #151d2e`
- Current time: red dot + horizontal red line
- 80px per hour recommended height

---

## 5. ALL PAGES & FEATURES

### Dashboard (Home)
- Quick stats widgets (customizable, drag-drop)
- Pending time entries list for review
- Daily summary card
- Goals progress
- Weekly heatmap

### Calendar
- Day / Week / Month / Year / Custom views
- Week view: columns by Time Entries / Tasks / Projects / Clients
- Month view: productivity **heat map** (green intensity = more hours)
- Year view: GitHub-style activity grid
- Timeline customization: toggle which columns show
- Right-click on time block to edit

### Timer
- Radial circular timer (large, center of view)
- Timeline sidebar showing the day so far
- Session type selector: Focus / Meeting / Break
- Planned sessions: schedule upcoming blocks
- Focus music player embedded
- Distraction blocker toggle
- Break suggestions overlay

### Aktivity (Activity)
- Vertical timeline of your day (auto-tracked)
- Shows every app/window switch with duration
- Categorized automatically
- Editable: drag to resize, click to relabel
- Shows gaps (untracked time) with prompt to fill

### Projects
- Project cards with color dots
- Time tracked per project (current week/month)
- Billable hours + rate + earnings
- Progress toward project hours budget
- Client association

### Clients
- Client list with associated projects
- Total hours billed per client
- Profitability metrics
- Invoice-ready summaries

### Tasks
- Task list linked to calendar blocks
- Create tasks that auto-associate with sessions
- Completion tracking

### Overview (Stats)
- Work hours chart (area chart, daily)
- Focus vs Meeting vs Break breakdown
- Category pie/donut chart
- Focus Quality Score trend line
- Context switching frequency metric
- Most productive hours heatmap (hour × day grid)
- Streak tracking

### Profitability
- Revenue tracked per project/client
- Hourly rate × hours = earnings
- Billable vs non-billable breakdown
- Monthly P&L view

### Reports
- Auto-generated daily / weekly / monthly PDFs
- Send to clients on schedule
- Focus score history
- App usage detailed breakdown
- Comparison vs previous period

### Produktivity (Productivity Score)
- Focus Quality Score: 0–100 (20+ data points)
- Context switching score
- Deep work score
- Break quality score
- Trend over 30/90 days
- AI personalized recommendations

---

## 6. FOCUS QUALITY SCORE (20+ attributes)
Rize's score is more nuanced than a simple calculation:
1. Total focus time
2. Average focus session length
3. Context switching frequency (app/task switches per hour)
4. Distraction app usage %
5. Meeting duration vs focus ratio
6. Break regularity (are breaks evenly spaced?)
7. Break duration (not too short, not too long)
8. Time of day consistency (working at your peak hours)
9. Deep work blocks (25+ min uninterrupted)
10. Work start consistency
11. Overwork detection (>10h = negative)
12. Weekend work (negative)
13. Late-night work after 10pm (negative)
14. Planned vs unplanned sessions ratio
15. Goal completion rate
16. Focus music usage
17. Distraction blocker usage
18. App diversity during focus (fewer = better)
19. Task completion per session
20. Streak days maintained

---

## 7. UI COMPONENTS

### Active session widget (sidebar)
```
╔═══════════════════╗
║ ● RECORDING       ║  ← green pulse dot
║ Designing UI      ║  ← title
║ 01:24:37  [■ Stop]║  ← live timer + stop btn
╚═══════════════════╝
```

### Break reminder overlay
- Full-screen subtle dimming overlay
- Center card: "Time for a break!"
- Shows how long since last break
- [Take 5 min break] [Snooze 15 min] [Dismiss]
- Break timer countdown if accepted

### Distraction blocker notification
- Small floating banner (top-right)
- "Are you sure? [This is not a distraction] [Block it]"
- Simplified 2-button UI

### Focus music player
- Collapsed: mini player in sidebar
- Genres: Lo-fi, Classical, Nature, White Noise, Jazz, Ambient
- Play/pause, volume, skip track
- Each genre shown with artwork thumbnail

### Desktop mini widget (menubar / taskbar)
- Shows current session name + timer
- Click to expand: quick start/stop
- Shows today's focus hours progress bar
- Shows break reminder badge

### Productivity Metrics Bar
```
[Focus ████████][Meetings ███][Breaks ██][Others █]
 2hr 11min       3hr 45min     1hr 30min   56min
```
Color coded: green / purple / amber / grey

---

## 8. ICONS

Rize uses a **custom icon set** that looks very close to:
- **Lucide Icons** (primary) — clean 1.5px stroke, 24px
- Some icons appear to be custom SVG variants

Key icons observed:
```
Dashboard:    grid-2x2
Calendar:     calendar (grid lines)
Timer:        timer / circle with hands
Activity:     activity (pulse wave)
Projects:     briefcase
Clients:      users
Tasks:        check-square
Overview:     bar-chart-2
Profitability: euro / dollar-sign
Reports:      file-text
Productivity: zap OR brain
Feedback:     message-square
Support:      life-buoy
Focus music:  music-2
Break:        coffee
Deep work:    zap (amber)
Recording:    circle (filled, animated)
Stop:         square (filled)
```

---

## 9. ANIMATIONS & MICRO-INTERACTIONS

- Recording pulse: `animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite`
- Session blocks appear with `fade-in + slide-up` (150ms)
- Stats numbers count up on load
- Progress bars animate width over 600ms with ease-out
- Sidebar items have 150ms `ease` color transition
- Popup cards: `scale(0.95→1.0)` + `opacity(0→1)` in 120ms
- Deep work badge: subtle amber glow pulse
- Break overlay: backdrop-blur fade-in

---

## 10. FEATURES TO ADD TO FLOW LEDGER (Gap Analysis)

| Feature | Priority | Notes |
|---|---|---|
| Focus music player | HIGH | Embed YouTube/Spotify or use Web Audio API |
| Break reminder overlay | HIGH | Timer-based notification after X mins focus |
| Distraction blocker | HIGH | Block sites/apps during focus sessions |
| Month heatmap view | HIGH | GitHub-style grid, color = hours |
| Year heatmap | MEDIUM | 52-week activity grid |
| Planned sessions | MEDIUM | Schedule future focus blocks on timeline |
| Context switching score | MEDIUM | Count app switches per session |
| AI session descriptions | MEDIUM | Auto-generate from app usage data |
| Desktop menubar widget | MEDIUM | Mini timer in system tray |
| Clients page | MEDIUM | Associate projects with clients |
| Profitability page | LOW | Revenue tracking |
| PDF report generation | LOW | Weekly/monthly PDF export |
| Focus music genres | LOW | Web Audio or streaming integration |
| Tags on sessions | MEDIUM | #tag system like Rize's colored pills |
| Command palette (⌘K) | HIGH | Quick actions keyboard shortcut |
| Pending entries review | MEDIUM | Morning review of yesterday's untagged time |
| Custom dashboard widgets | LOW | Drag-drop dashboard builder |

---

## 11. DESIGN TOKENS (for Tailwind / CSS)

```js
// Recommended for Flow Ledger redesign
colors: {
  bg: {
    app:      '#0d1117',
    sidebar:  '#0d1117',
    card:     '#161b27',
    hover:    '#1c2333',
    input:    '#1a2035',
  },
  border: {
    subtle:  '#1e2a3a',
    default: '#243048',
    focus:   '#7c3aed',
  },
  text: {
    primary:   '#e6edf3',
    secondary: '#8b949e',
    muted:     '#484f58',
  },
  accent: {
    purple: '#7c3aed',
    blue:   '#2f81f7',
    green:  '#3fb950',
    amber:  '#d29922',
    red:    '#f85149',
  },
  session: {
    focus:   '#4c8eda',
    meeting: '#f87171',
    break:   '#6b7280',
    design:  '#a78bfa',
    coding:  '#6366f1',
    writing: '#fb923c',
  }
}
```

---

Sources consulted:
- Rize.io screenshot (user-provided)
- rize.io/changelog (all entries)
- rize.io/changelog/rize-2-0
- rize.io/changelog/new-calendar-home-views
- rize.io/changelog/redesigned-workspace-sidebar-and-home
- rize.io/features/productivity
- Multiple review articles (2024–2026)
- Rize GitHub (rize-io org)

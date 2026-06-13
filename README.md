# Flow Ledger

A personal, local-first productivity tracker. Like Rize.io, but yours — no subscriptions, no cloud, no tracking.

Built with Electron + React + Tailwind CSS + SQLite.

---

## Features

- **Time Tracker** — Start/stop work sessions tagged by category with optional title
- **Deep Work Detector** — Sessions ≥ 25 min are automatically flagged as deep work
- **Analytics** — Daily & weekly charts (total hours, deep work %, category breakdown)
- **Goals & Streaks** — Set daily/weekly hour targets per category, track streaks
- **Login system** — Local accounts with bcrypt-hashed passwords
- **100% local** — All data stored in SQLite on your machine

---

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install & Run (Development)

```bash
cd flow-ledger-app
npm install
npm run dev
```

This starts the React dev server on port 3000 and launches Electron pointing to it.

> **Note:** `better-sqlite3` is a native module. If you hit a rebuild error, run:
> ```bash
> npm install --save-dev @electron/rebuild
> npx electron-rebuild
> ```

### Build for Production

```bash
npm run build
```

Output will be in `dist/`.

---

## Project Structure

```
flow-ledger-app/
├── electron/
│   ├── main.js        # Electron main process + all IPC handlers + SQLite
│   └── preload.js     # Secure context bridge (exposes API to renderer)
├── src/
│   ├── App.js         # Root app + AuthContext
│   ├── components/
│   │   ├── auth/      # Login & Register page
│   │   ├── dashboard/ # Overview, Dashboard shell, Settings
│   │   ├── tracker/   # Time tracker with live timer
│   │   ├── stats/     # Analytics charts
│   │   ├── goals/     # Goals & streaks
│   │   └── shared/    # TitleBar
│   ├── hooks/
│   ├── utils/         # Helpers (formatDuration, dateKey, etc.)
│   └── styles/
├── public/
│   └── index.html
├── package.json
├── tailwind.config.js
└── postcss.config.js
```

---

## Database

SQLite file is stored at Electron's `userData` path:
- **macOS:** `~/Library/Application Support/flow-ledger/flow-ledger.db`
- **Windows:** `%APPDATA%\flow-ledger\flow-ledger.db`
- **Linux:** `~/.config/flow-ledger/flow-ledger.db`

---

## Deep Work Logic

A session qualifies as "deep work" when it ends and its duration ≥ 25 minutes (1500 seconds). This threshold is inspired by the Pomodoro technique and matches Rize.io's approach.

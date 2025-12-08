# Pakistan VATSIM Dashboard

A production-ready Next.js 14 dashboard that aggregates VATSIM activity for Pakistan (OPKR/OPLR FIRs) and shows daily, weekly, quarterly, monthly, and yearly statistics from 2020 to present.

## Features

- **Controllers**: Backfilled from VATSIM Core API v2 historical ATC sessions
- **Pilots**: Collected from live data feed; sessions marked as "Pakistan" if:
  - Pilot's position is inside OPKR/OPLR FIR polygons, OR
  - Departure/arrival ICAO starts with 'OP'
- **Multiple aggregation periods**: Day, Week, Month, Quarter, Year
- **Interactive charts** with Chart.js
- **Real-time updates** via SWR (refreshes every 60 seconds)

## Prerequisites

- Node.js 18+
- PostgreSQL database
- VATSIM Core API v2 key (for backfilling controller data)

## Environment Variables

Create a `.env.local` file with:

```env
# Postgres connection string
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require

# Core API v2 key (needed for backfill; live collection works without it)
VATSIM_API_KEY=your_api_key_here
```

## Installation & Database Setup

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev --name init
```

## One-time Backfill (Controllers since 2020)

```bash
# Requires VATSIM_API_KEY environment variable
npm run backfill:atc
```

## Start Live Collector

The live collector polls the VATSIM data feed and maintains session tracking:

**Option 1: One-time run (for cron/scheduler)**
```bash
npm run ingest:live
```

**Option 2: Continuous background worker (recommended)**
```bash
npm run ingest:live:continuous
```
This runs continuously, polling every 15 seconds and automatically saving all sessions to the database.

**Production:** 
- For continuous collection, run `npm run ingest:live:continuous` as a background service (PM2, systemd, etc.)
- Or schedule `npm run ingest:live` to run every minute via cron/systemd/worker

Example crontab entry:
```
* * * * * cd /path/to/vatsim-pk-dashboard && npm run ingest:live >> /var/log/vatsim-ingest.log 2>&1
```

## Database Persistence

**✅ Automatic Database Saving:** When the dashboard is running, all live sessions are automatically saved to the database:

- **Controllers**: Saved to `ControllerSession` table when they go offline
- **Pilots**: Saved to `PilotSession` table when they disconnect
- **Open Sessions**: Tracked in `OpenSession` table while active

The dashboard API (`/api/live`) automatically:
1. Tracks sessions in memory cache
2. Detects when sessions end (2+ minutes offline)
3. Saves completed sessions to database
4. Maintains local cache as backup

**Note:** If `DATABASE_URL` is not configured, the system will still work using local cache files in `.cache/` folder, but data won't persist to database.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Production Build

```bash
npm run build
npm run start
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns: `{ "ok": true, "now": "2024-..." }`

### Controller Stats
```
GET /api/stats/controllers?groupBy=month&from=2020-01-01&to=2024-12-31&fir=OPKR
```
Parameters:
- `groupBy`: `day` | `week` | `month` | `quarter` | `year` (default: `month`)
- `from`: ISO date (default: `2020-01-01T00:00:00Z`)
- `to`: ISO date (default: now)
- `fir`: `OPKR` | `OPLR` (optional filter)

### Pilot Stats
```
GET /api/stats/pilots?groupBy=month&from=2020-01-01&to=2024-12-31
```
Parameters:
- `groupBy`: `day` | `week` | `month` | `quarter` | `year` (default: `month`)
- `from`: ISO date (default: `2020-01-01T00:00:00Z`)
- `to`: ISO date (default: now)

## Data Sources

1. **Live Feed** (no auth, refreshes ~15s):
   - `GET https://data.vatsim.net/v3/vatsim-data.json`

2. **Core API v2** (requires API key):
   - `GET https://api.vatsim.net/v2/atc/history` - Historical ATC sessions

3. **FIR Boundaries**:
   - `GET https://api.vatsim.net/api/map_data/` - Provides GeoJSON URL for FIR polygons

## Tech Stack

- Next.js 14 (App Router, TypeScript)
- Prisma + PostgreSQL
- axios, zod
- Chart.js + react-chartjs-2
- SWR for data fetching
- @turf/boolean-point-in-polygon for geofencing

## Notes

- All server timestamps are in UTC
- Session close threshold: 3 minutes of not seen in live feed
- Pakistan FIRs: OPKR (Karachi) and OPLR (Lahore)
- ATC callsign pattern: `OP.._(DEL|GND|TWR|APP|DEP|CTR|FSS|ATIS)`
- Poll interval recommendation: 1 minute (live feed regenerates ~15s)



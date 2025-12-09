import fs from "fs";
import path from "path";
import { addMemberToRoster, updateMemberStats, updateMemberLastSeen, updateMemberFromLive } from "./roster";
import { prisma } from "./db";

const CACHE_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(CACHE_DIR, "pk-sessions.json");
const HISTORY_FILE = path.join(CACHE_DIR, "pk-history.json");

interface CachedSession {
  id: string;
  type: "controller" | "pilot";
  cid: number;
  name: string;
  callsign: string;
  frequency?: string;
  facility?: string;
  departure?: string;
  arrival?: string;
  aircraft?: string;
  startTime: string;
  lastSeen: string;
}

export interface HistoricalSession {
  id: string;
  type: "controller" | "pilot";
  cid: number;
  name: string;
  callsign: string;
  frequency?: string;
  facility?: string;
  departure?: string;
  arrival?: string;
  aircraft?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  date: string; // YYYY-MM-DD for grouping
  removedAt?: string; // Timestamp when session was removed (for recent activity)
}

interface SessionCache {
  lastUpdated: string;
  sessions: Record<string, CachedSession>;
}

interface HistoryCache {
  lastUpdated: string;
  sessions: HistoricalSession[];
  stats: {
    totalControllerMinutes: number;
    totalPilotMinutes: number;
    totalControllerSessions: number;
    totalPilotSessions: number;
  };
}

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Load current sessions from cache
export function loadSessions(): SessionCache {
  ensureCacheDir();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading sessions cache:", e);
  }
  return { lastUpdated: new Date().toISOString(), sessions: {} };
}

// Save current sessions to cache
export function saveSessions(cache: SessionCache) {
  ensureCacheDir();
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(cache, null, 2));
}

// Load history from cache
export function loadHistory(): HistoryCache {
  ensureCacheDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading history cache:", e);
  }
  return {
    lastUpdated: new Date().toISOString(),
    sessions: [],
    stats: {
      totalControllerMinutes: 0,
      totalPilotMinutes: 0,
      totalControllerSessions: 0,
      totalPilotSessions: 0,
    },
  };
}

// Save history to cache
export function saveHistory(cache: HistoryCache) {
  ensureCacheDir();
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(cache, null, 2));
}

// Update sessions - track new, update existing, close stale
export async function updateSessions(
  currentControllers: Array<{
    cid: number;
    name: string;
    callsign: string;
    frequency: string;
    facility: string;
  }>,
  currentPilots: Array<{
    cid: number;
    name: string;
    callsign: string;
    departure: string;
    arrival: string;
    aircraft: string;
  }>
): Promise<{ added: string[]; removed: HistoricalSession[] }> {
  const now = new Date();
  const nowIso = now.toISOString();
  
  const sessionCache = loadSessions();
  const historyCache = loadHistory();
  
  const added: Array<{ message: string; timestamp: string }> = [];
  const removed: HistoricalSession[] = [];
  
  // Track which sessions we've seen this update
  const seenIds = new Set<string>();
  
  // Process controllers
  for (const c of currentControllers) {
    const id = `atc-${c.callsign}`;
    seenIds.add(id);
    
    if (!sessionCache.sessions[id]) {
      // New session - also try to add to Pakistan roster
      sessionCache.sessions[id] = {
        id,
        type: "controller",
        cid: c.cid,
        name: c.name,
        callsign: c.callsign,
        frequency: c.frequency,
        facility: c.facility,
        startTime: nowIso,
        lastSeen: nowIso,
      };
      added.push(`🎧 ${c.callsign} (${c.name})`);
      
      // Auto-detect and add to Pakistan roster
      if (c.cid) {
        addMemberToRoster(c.cid, "auto-detected").catch(() => {});
      }
    } else {
      // Update last seen
      sessionCache.sessions[id].lastSeen = nowIso;
      // Update roster last seen and name if member exists
      if (c.cid) {
        updateMemberFromLive(c.cid, c.name, c.callsign).catch(() => {});
      }
    }
  }
  
  // Process pilots
  for (const p of currentPilots) {
    const id = `pilot-${p.callsign}`;
    seenIds.add(id);
    
    if (!sessionCache.sessions[id]) {
      // New session
      sessionCache.sessions[id] = {
        id,
        type: "pilot",
        cid: p.cid,
        name: p.name,
        callsign: p.callsign,
        departure: p.departure,
        arrival: p.arrival,
        aircraft: p.aircraft,
        startTime: nowIso,
        lastSeen: nowIso,
      };
      added.push({
        message: `✈️ ${p.callsign} (${p.departure}→${p.arrival})`,
        timestamp: nowIso,
      });
      
      // Auto-detect and add to Pakistan roster if pilot
      if (p.cid) {
        addMemberToRoster(p.cid, "auto-detected").catch(() => {});
      }
    } else {
      // Update last seen
      sessionCache.sessions[id].lastSeen = nowIso;
      // Update roster last seen if member exists
      if (p.cid) {
        updateMemberLastSeen(p.cid, p.callsign);
      }
    }
  }
  
  // Find sessions that have ended (not seen for 2+ minutes)
  const staleThreshold = 2 * 60 * 1000; // 2 minutes
  
  for (const [id, session] of Object.entries(sessionCache.sessions)) {
    if (!seenIds.has(id)) {
      const lastSeen = new Date(session.lastSeen).getTime();
      if (now.getTime() - lastSeen > staleThreshold) {
        // Session ended - move to history
        const durationMinutes = Math.max(
          1,
          Math.round((lastSeen - new Date(session.startTime).getTime()) / 60000)
        );
        
        const historicalSession: HistoricalSession = {
          id: `${session.id}-${session.startTime}`,
          type: session.type,
          cid: session.cid,
          name: session.name,
          callsign: session.callsign,
          frequency: session.frequency,
          facility: session.facility,
          departure: session.departure,
          arrival: session.arrival,
          aircraft: session.aircraft,
          startTime: session.startTime,
          endTime: session.lastSeen,
          durationMinutes,
          date: session.startTime.slice(0, 10),
        };
        
        historyCache.sessions.unshift(historicalSession);
        
        // Update stats (exclude ATIS from controller sessions - no hours, no sessions)
        if (session.type === "controller") {
          // Only add minutes and count sessions if NOT ATIS
          if (!session.callsign.toUpperCase().endsWith("_ATIS")) {
            historyCache.stats.totalControllerMinutes += durationMinutes;
            historyCache.stats.totalControllerSessions++;
          }
          // ATIS sessions are completely ignored - no hours, no sessions
        } else {
          historyCache.stats.totalPilotMinutes += durationMinutes;
          historyCache.stats.totalPilotSessions++;
        }
        
        // Update member stats in roster (only for non-ATIS controller sessions)
        if (session.cid) {
          if (session.type === "controller" && !session.callsign.toUpperCase().endsWith("_ATIS")) {
            updateMemberStats(session.cid, session.type, durationMinutes, session.callsign);
          } else if (session.type === "pilot") {
            updateMemberStats(session.cid, session.type, durationMinutes);
          }
        }
        
        // Save to database (if available)
        saveSessionToDatabase(historicalSession).catch((err) => {
          console.error("Failed to save session to database:", err);
        });
        
        removed.push({
          ...historicalSession,
          removedAt: nowIso, // Add timestamp when session was removed
        });
        delete sessionCache.sessions[id];
      }
    }
  }
  
  // Keep only last 1000 historical sessions
  if (historyCache.sessions.length > 1000) {
    historyCache.sessions = historyCache.sessions.slice(0, 1000);
  }
  
  // Save caches
  saveSessions(sessionCache);
  saveHistory(historyCache);
  
  return { added, removed };
}

// Save session to database
async function saveSessionToDatabase(session: HistoricalSession) {
  // Only save if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    // Test database connection first
    await prisma.$connect();
  } catch (error) {
    // Database not available - skip saving
    return;
  }

  try {
    if (session.type === "controller") {
      // Don't save ATIS sessions to database
      if (session.callsign.toUpperCase().endsWith("_ATIS")) {
        return; // Skip saving ATIS sessions
      }

      // Extract FIR from callsign if possible
      const fir = session.callsign.startsWith("OPKR_") ? "OPKR" : 
                  session.callsign.startsWith("OPLR_") ? "OPLR" : null;

      // Note: name field will be added after migration is run
      // For now, save without name (it's stored in cache and roster)
      await prisma.controllerSession.create({
        data: {
          cid: session.cid || null,
          callsign: session.callsign,
          // name: session.name || null, // Uncomment after running migration
          fir: fir,
          start: new Date(session.startTime),
          end: new Date(session.endTime),
          minutes: session.durationMinutes,
        },
      });
    } else {
      // For pilots, check if they're in Pakistan
      const inPakistan = (session.departure?.startsWith("OP") || session.arrival?.startsWith("OP")) ?? false;
      
      await prisma.pilotSession.create({
        data: {
          cid: session.cid || null,
          callsign: session.callsign,
          name: session.name || null,
          dep: session.departure || null,
          arr: session.arrival || null,
          aircraft: session.aircraft || null,
          fir: null, // Could be enhanced with geofencing
          inPakistan: inPakistan,
          start: new Date(session.startTime),
          end: new Date(session.endTime),
          minutes: session.durationMinutes,
        },
      });
    }
  } catch (error: any) {
    // Log but don't throw - cache should still work
    // Only log if it's not a connection error (to avoid spam)
    if (error?.code !== "P1001" && error?.code !== "P1000") {
      console.error(`Database save error for ${session.callsign}:`, error.message || error);
    }
  }
}

// Get aggregated stats by period (excludes ATIS sessions)
export function getAggregatedStats(groupBy: "day" | "week" | "month" | "year" = "day") {
  const history = loadHistory();
  
  const grouped: Record<string, {
    controllerMinutes: number;
    controllerSessions: number;
    pilotMinutes: number;
    pilotSessions: number;
  }> = {};
  
  for (const session of history.sessions) {
    let period: string;
    const date = new Date(session.date);
    
    switch (groupBy) {
      case "day":
        period = session.date;
        break;
      case "week":
        // Get ISO week start (Monday)
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date.setDate(diff));
        period = weekStart.toISOString().slice(0, 10);
        break;
      case "month":
        period = session.date.slice(0, 7);
        break;
      case "year":
        period = session.date.slice(0, 4);
        break;
    }
    
    if (!grouped[period]) {
      grouped[period] = {
        controllerMinutes: 0,
        controllerSessions: 0,
        pilotMinutes: 0,
        pilotSessions: 0,
      };
    }
    
    if (session.type === "controller") {
      // Exclude ATIS sessions from activity trend
      if (!session.callsign.toUpperCase().endsWith("_ATIS")) {
        grouped[period].controllerMinutes += session.durationMinutes;
        grouped[period].controllerSessions++;
      }
      // ATIS sessions are completely ignored - no hours, no sessions
    } else {
      grouped[period].pilotMinutes += session.durationMinutes;
      grouped[period].pilotSessions++;
    }
  }
  
  return Object.entries(grouped)
    .map(([period, stats]) => ({ period, ...stats }))
    .sort((a, b) => a.period.localeCompare(b.period));
}


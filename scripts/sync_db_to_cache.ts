import "dotenv/config";
import { prisma } from "../lib/db";
import { loadHistory, saveHistory, loadSessions, saveSessions } from "../lib/cache";
import type { HistoricalSession } from "../lib/cache";

/**
 * Sync database sessions back to cache files
 * This ensures all historical data is available in the cache files for git tracking
 */
async function syncDatabaseToCache() {
  console.log("🔄 Syncing database to cache files...");
  
  try {
    // Test database connection
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database not available, skipping sync");
    return;
  }

  const historyCache = loadHistory();
  const existingSessionIds = new Set(historyCache.sessions.map(s => s.id));
  
  let controllerSessionsAdded = 0;
  let pilotSessionsAdded = 0;
  let controllerSessionsSkipped = 0;
  let pilotSessionsSkipped = 0;

  // Sync controller sessions (exclude ATIS)
  console.log("📡 Fetching controller sessions from database...");
  const controllerSessions = await prisma.controllerSession.findMany({
    where: {
      callsign: {
        not: {
          endsWith: "_ATIS"
        }
      }
    },
    orderBy: {
      start: "desc"
    }
  });

  console.log(`Found ${controllerSessions.length} controller sessions in database`);

  for (const session of controllerSessions) {
    const sessionId = `atc-${session.callsign}-${session.start.toISOString()}`;
    
    if (existingSessionIds.has(sessionId)) {
      controllerSessionsSkipped++;
      continue;
    }

    const historicalSession: HistoricalSession = {
      id: sessionId,
      type: "controller",
      cid: session.cid || 0,
      name: session.name || "Unknown",
      callsign: session.callsign,
      facility: session.fir || undefined,
      startTime: session.start.toISOString(),
      endTime: session.end.toISOString(),
      durationMinutes: session.minutes,
      date: session.start.toISOString().slice(0, 10),
    };

    historyCache.sessions.unshift(historicalSession);
    existingSessionIds.add(sessionId);
    controllerSessionsAdded++;
  }

  // Sync pilot sessions
  console.log("✈️ Fetching pilot sessions from database...");
  const pilotSessions = await prisma.pilotSession.findMany({
    orderBy: {
      start: "desc"
    }
  });

  console.log(`Found ${pilotSessions.length} pilot sessions in database`);

  for (const session of pilotSessions) {
    const sessionId = `pilot-${session.callsign}-${session.start.toISOString()}`;
    
    if (existingSessionIds.has(sessionId)) {
      pilotSessionsSkipped++;
      continue;
    }

    const historicalSession: HistoricalSession = {
      id: sessionId,
      type: "pilot",
      cid: session.cid || 0,
      name: session.name || "Unknown",
      callsign: session.callsign,
      departure: session.dep || undefined,
      arrival: session.arr || undefined,
      aircraft: session.aircraft || undefined,
      startTime: session.start.toISOString(),
      endTime: session.end.toISOString(),
      durationMinutes: session.minutes,
      date: session.start.toISOString().slice(0, 10),
    };

    historyCache.sessions.unshift(historicalSession);
    existingSessionIds.add(sessionId);
    pilotSessionsAdded++;
  }

  // Recalculate stats (excluding ATIS)
  console.log("📊 Recalculating stats...");
  historyCache.stats = {
    totalControllerMinutes: historyCache.sessions
      .filter(s => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS"))
      .reduce((sum, s) => sum + s.durationMinutes, 0),
    totalPilotMinutes: historyCache.sessions
      .filter(s => s.type === "pilot")
      .reduce((sum, s) => sum + s.durationMinutes, 0),
    totalControllerSessions: historyCache.sessions
      .filter(s => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS"))
      .length,
    totalPilotSessions: historyCache.sessions
      .filter(s => s.type === "pilot")
      .length,
  };

  // Keep only last 1000 sessions (most recent)
  if (historyCache.sessions.length > 1000) {
    historyCache.sessions = historyCache.sessions.slice(0, 1000);
    console.log(`⚠️ Limited to 1000 most recent sessions`);
  }

  // Save updated history
  saveHistory(historyCache);
  console.log("💾 History cache saved");

  // Sync active sessions from OpenSession table
  console.log("🔄 Syncing active sessions...");
  const openSessions = await prisma.openSession.findMany({
    orderBy: {
      lastSeenAt: "desc"
    }
  });

  const sessionCache = loadSessions();
  const now = new Date().toISOString();

  for (const session of openSessions) {
    if (session.role === "ATC") {
      const id = `atc-${session.callsign}`;
      if (!sessionCache.sessions[id]) {
        sessionCache.sessions[id] = {
          id,
          type: "controller",
          cid: session.cid || 0,
          name: "Unknown", // OpenSession doesn't have name
          callsign: session.callsign,
          facility: session.fir || undefined,
          startTime: session.startedAt.toISOString(),
          lastSeen: session.lastSeenAt.toISOString(),
        };
      } else {
        sessionCache.sessions[id].lastSeen = session.lastSeenAt.toISOString();
      }
    } else {
      const id = `pilot-${session.callsign}`;
      if (!sessionCache.sessions[id]) {
        sessionCache.sessions[id] = {
          id,
          type: "pilot",
          cid: session.cid || 0,
          name: "Unknown",
          callsign: session.callsign,
          departure: session.dep || undefined,
          arrival: session.arr || undefined,
          startTime: session.startedAt.toISOString(),
          lastSeen: session.lastSeenAt.toISOString(),
        };
      } else {
        sessionCache.sessions[id].lastSeen = session.lastSeenAt.toISOString();
      }
    }
  }

  saveSessions(sessionCache);
  console.log("💾 Active sessions cache saved");

  console.log("\n✅ Sync complete!");
  console.log(`   Controller sessions: +${controllerSessionsAdded} (skipped ${controllerSessionsSkipped})`);
  console.log(`   Pilot sessions: +${pilotSessionsAdded} (skipped ${pilotSessionsSkipped})`);
  console.log(`   Total history sessions: ${historyCache.sessions.length}`);
  console.log(`   Total active sessions: ${Object.keys(sessionCache.sessions).length}`);
}

syncDatabaseToCache()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });


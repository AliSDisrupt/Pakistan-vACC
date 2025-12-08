import { NextResponse } from "next/server";
import { loadHistory, loadSessions } from "@/lib/cache";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const cache = loadHistory();
    const sessions = loadSessions();

    let dbStatus = {
      connected: false,
      controllerSessions: 0,
      pilotSessions: 0,
      totalPilots: 0,
    };

    if (process.env.DATABASE_URL) {
      try {
        await prisma.$connect();
        const [ctrlCount, pilotCount, uniquePilots] = await Promise.all([
          prisma.controllerSession.count({
            where: { callsign: { not: { endsWith: "_ATIS" } } },
          }),
          prisma.pilotSession.count(),
          prisma.pilotSession.groupBy({
            by: ["cid"],
            where: { cid: { not: null } },
          }),
        ]);

        dbStatus = {
          connected: true,
          controllerSessions: ctrlCount,
          pilotSessions: pilotCount,
          totalPilots: uniquePilots.length,
        };
      } catch (error) {
        dbStatus.connected = false;
      }
    }

    // Recalculate cache stats excluding ATIS
    const recalculatedControllerSessions = cache.sessions.filter(
      (s) => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS")
    ).length;

    return NextResponse.json({
      database: dbStatus,
      cache: {
        controllerSessions: recalculatedControllerSessions,
        pilotSessions: cache.stats.totalPilotSessions,
        activeSessions: Object.keys(sessions.sessions).length,
        lastUpdated: cache.lastUpdated,
      },
      storage: {
        databaseConfigured: !!process.env.DATABASE_URL,
        cacheEnabled: true,
      },
    });
  } catch (error) {
    console.error("Error checking data status:", error);
    return NextResponse.json(
      { error: "Failed to check data status" },
      { status: 500 }
    );
  }
}


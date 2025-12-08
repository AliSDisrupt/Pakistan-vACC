import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadHistory, loadSessions } from "@/lib/cache";
import axios from "axios";

// Format minutes as HHH:MM:SS
function formatHoursMinutesSeconds(totalMinutes: number): string {
  const totalSeconds = Math.floor(totalMinutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(3, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid");

  if (!cid) {
    return NextResponse.json({ error: "CID parameter required" }, { status: 400 });
  }

  try {
    const cidNum = parseInt(cid);
    let sessions: any[] = [];
    let totalMinutes = 0;

    // Get member info from VATSIM API
    let memberInfo = null;
    try {
      const memberRes = await axios.get(`https://api.vatsim.net/api/ratings/${cidNum}`, {
        timeout: 5000,
      });
      memberInfo = memberRes.data;
    } catch (error) {
      // Member info not available
    }

    // Try database first
    if (process.env.DATABASE_URL) {
      try {
            const dbSessions = await prisma.controllerSession.findMany({
              where: { cid: cidNum },
              orderBy: { start: "desc" },
            });

            // Include ALL sessions including ATIS for the detail view
            sessions = dbSessions.map((s) => ({
          callsign: s.callsign,
          date: s.start.toISOString().slice(0, 10),
          startTime: s.start.toISOString(),
          endTime: s.end.toISOString(),
          minutes: s.minutes,
          hours: formatHoursMinutesSeconds(s.minutes),
          fir: s.fir,
          source: "database",
        }));

        totalMinutes = dbSessions.reduce((sum, s) => sum + s.minutes, 0);
      } catch (dbError) {
        console.error("Database query error:", dbError);
      }
    }

    // Also check cache (include ALL including ATIS)
    const cache = loadHistory();
    const cacheSessions = cache.sessions.filter(
      (s) => s.type === "controller" && s.cid === cidNum
    );

    // Merge and deduplicate
    const cacheIds = new Set(sessions.map((s) => `${s.callsign}-${s.startTime}`));
    for (const cs of cacheSessions) {
      const id = `${cs.callsign}-${cs.startTime}`;
      if (!cacheIds.has(id)) {
        sessions.push({
          callsign: cs.callsign,
          date: cs.date,
          startTime: cs.startTime,
          endTime: cs.endTime,
          minutes: cs.durationMinutes,
          hours: formatHoursMinutesSeconds(cs.durationMinutes),
          fir: null,
          source: "cache",
        });
        totalMinutes += cs.durationMinutes;
      }
    }

    // Check active sessions (include ALL including ATIS)
    const activeSessions = loadSessions();
    const now = new Date();
    for (const session of Object.values(activeSessions.sessions)) {
      if (session.type === "controller" && session.cid === cidNum) {
        const startTime = new Date(session.startTime).getTime();
        const sessionMinutes = Math.round((now.getTime() - startTime) / 60000);
        const id = `${session.callsign}-${session.startTime}`;
        if (!cacheIds.has(id)) {
          sessions.push({
            callsign: session.callsign,
            date: session.startTime.slice(0, 10),
            startTime: session.startTime,
            endTime: now.toISOString(),
            minutes: sessionMinutes,
            hours: formatHoursMinutesSeconds(sessionMinutes),
            fir: null,
            source: "active",
          });
          totalMinutes += sessionMinutes;
        }
      }
    }

    // Sort by date descending, then by start time
    sessions.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.startTime.localeCompare(a.startTime);
    });

    // Group by callsign to show hours per callsign
    const callsignStats: Record<string, { minutes: number; sessions: number }> = {};
    for (const s of sessions) {
      if (!callsignStats[s.callsign]) {
        callsignStats[s.callsign] = { minutes: 0, sessions: 0 };
      }
      callsignStats[s.callsign].minutes += s.minutes;
      callsignStats[s.callsign].sessions += 1;
    }

    // Convert to array and sort by hours descending
    const callsignList = Object.entries(callsignStats)
      .map(([callsign, stats]) => ({
        callsign,
        hours: formatHoursMinutesSeconds(stats.minutes),
        sessions: stats.sessions,
      }))
      .sort((a, b) => {
        // Parse HHH:MM:SS to compare
        const aParts = a.hours.split(":").map(Number);
        const bParts = b.hours.split(":").map(Number);
        const aTotal = aParts[0] * 3600 + aParts[1] * 60 + aParts[2];
        const bTotal = bParts[0] * 3600 + bParts[1] * 60 + bParts[2];
        return bTotal - aTotal;
      });

    // Group sessions by date (non-cumulative list)
    const sessionsByDate: Record<string, any[]> = {};
    for (const s of sessions) {
      if (!sessionsByDate[s.date]) {
        sessionsByDate[s.date] = [];
      }
      sessionsByDate[s.date].push(s);
    }

    // Convert to array sorted by date descending
    const dateList = Object.entries(sessionsByDate)
      .map(([date, dateSessions]) => {
        const totalMinutes = dateSessions.reduce((sum, s) => sum + s.minutes, 0);
        return {
          date,
          sessions: dateSessions.sort((a, b) => b.startTime.localeCompare(a.startTime)),
          totalMinutes,
          totalHours: formatHoursMinutesSeconds(totalMinutes),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      cid: cidNum,
      memberInfo: memberInfo
        ? {
            name: memberInfo.name_first + " " + memberInfo.name_last,
            rating: memberInfo.rating,
            ratingName: memberInfo.rating_long,
            subdivision: memberInfo.subdivision,
            division: memberInfo.division,
            region: memberInfo.region,
          }
        : null,
      totalHours: formatHoursMinutesSeconds(totalMinutes),
      totalMinutes,
      totalSessions: sessions.length,
      callsigns: callsignList,
      sessionsByDate: dateList,
      allSessions: sessions,
    });
  } catch (error) {
    console.error("Error fetching member sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch member sessions" },
      { status: 500 }
    );
  }
}


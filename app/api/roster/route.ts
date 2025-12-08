import { NextRequest, NextResponse } from "next/server";
import {
  getRosterMembers,
  getRosterStats,
  addMemberToRoster,
  removeMemberFromRoster,
  loadRoster,
} from "@/lib/roster";
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
  try {
    const url = new URL(req.url);
    const dateFilter = url.searchParams.get("date"); // YYYY-MM-DD
    const callsignFilter = url.searchParams.get("callsign");

    const members = getRosterMembers();
    const stats = getRosterStats();
    const roster = loadRoster();

    // Get active sessions to calculate current session time
    const activeSessions = loadSessions();
    const now = new Date();

    // Helper function to fetch fresh subdivision from VATSIM API
    async function fetchSubdivision(cid: number): Promise<string | null> {
      try {
        const { data } = await axios.get(`https://api.vatsim.net/api/ratings/${cid}/`, {
          timeout: 5000,
        });
        return data.subdivision || null;
      } catch (error) {
        return null; // Return null if API call fails
      }
    }

    // Calculate current hours from database, cache, and active sessions for each member
    const membersWithHours = await Promise.all(
      members.map(async (m) => {
        // Fetch fresh subdivision from VATSIM API to ensure accuracy
        const freshSubdivision = await fetchSubdivision(m.cid);
        // Use fresh subdivision if available, otherwise fall back to stored subdivision
        const actualSubdivision = freshSubdivision !== null ? freshSubdivision : m.subdivision;
        let dbMinutes = 0;
        let cacheMinutes = 0;
        let activeMinutes = 0;
        let sessionCount = 0;
        const allSessionIds = new Set<string>(); // Track unique sessions to avoid double counting

        // Get hours from database if available (most authoritative)
        if (process.env.DATABASE_URL) {
          try {
            const where: any = { cid: m.cid };
            if (dateFilter) {
              const dateStart = new Date(dateFilter);
              dateStart.setHours(0, 0, 0, 0);
              const dateEnd = new Date(dateFilter);
              dateEnd.setHours(23, 59, 59, 999);
              where.start = { gte: dateStart, lte: dateEnd };
            }
            if (callsignFilter) {
              where.callsign = { contains: callsignFilter, mode: "insensitive" };
            }

            const dbSessions = await prisma.controllerSession.findMany({ where });
            // Exclude ATIS sessions (callsigns ending with _ATIS)
            const nonAtisSessions = dbSessions.filter((s) => !s.callsign.toUpperCase().endsWith("_ATIS"));
            dbMinutes = nonAtisSessions.reduce((sum, s) => sum + s.minutes, 0);
            
            // Track unique sessions from database
            for (const s of nonAtisSessions) {
              const sessionId = `${s.callsign}-${s.start.toISOString()}`;
              allSessionIds.add(sessionId);
            }
            sessionCount = allSessionIds.size;
          } catch (error) {
            // Database not available
          }
        }

        // Also check cache for additional sessions (if DB has data, merge; if not, use cache)
        const cache = loadHistory();
        const cacheSessions = cache.sessions.filter(
          (s) =>
            s.type === "controller" &&
            s.cid === m.cid &&
            !s.callsign.toUpperCase().endsWith("_ATIS") && // Exclude ATIS
            (!dateFilter || s.date === dateFilter) &&
            (!callsignFilter || s.callsign.toLowerCase().includes(callsignFilter.toLowerCase()))
        );
        
        if (!process.env.DATABASE_URL || dbMinutes === 0) {
          // Use cache if no database
          cacheMinutes = cacheSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
          // Count unique sessions from cache
          for (const cs of cacheSessions) {
            const sessionId = `${cs.callsign}-${cs.startTime}`;
            allSessionIds.add(sessionId);
          }
          sessionCount = allSessionIds.size;
        } else {
          // If database exists, add unique cache sessions
          for (const cs of cacheSessions) {
            const sessionId = `${cs.callsign}-${cs.startTime}`;
            if (!allSessionIds.has(sessionId)) {
              allSessionIds.add(sessionId);
            }
          }
          sessionCount = allSessionIds.size;
        }

        // Check active sessions (currently online) - add to total (exclude ATIS)
        // Also count active sessions in sessionCount for real-time updates
        for (const session of Object.values(activeSessions.sessions)) {
          if (
            session.type === "controller" &&
            session.cid === m.cid &&
            !session.callsign.toUpperCase().endsWith("_ATIS") && // Exclude ATIS
            (!callsignFilter || session.callsign.toLowerCase().includes(callsignFilter.toLowerCase()))
          ) {
            const startTime = new Date(session.startTime).getTime();
            const sessionMinutes = Math.round((now.getTime() - startTime) / 60000);
            activeMinutes += sessionMinutes;
            
            // Count active sessions as well (unique by callsign + startTime)
            const activeSessionId = `${session.callsign}-${session.startTime}`;
            if (!allSessionIds.has(activeSessionId)) {
              allSessionIds.add(activeSessionId);
              sessionCount = allSessionIds.size;
            }
          }
        }

        // If still no session count after checking all sources, use roster stored count as fallback
        if (sessionCount === 0) {
          sessionCount = m.sessionsCount || 0;
        }

        // Total minutes = database (if available) OR cache (if no DB) + active session minutes
        // If date filter is set, don't include active sessions (they're ongoing)
        const totalMinutes = (dbMinutes > 0 ? dbMinutes : cacheMinutes) + (dateFilter ? 0 : activeMinutes);

        // Filter out ATIS from lastCallsign - find last non-ATIS if current is ATIS
        let displayLastCallsign = m.lastCallsign || null;
        if (displayLastCallsign && displayLastCallsign.toUpperCase().endsWith("_ATIS")) {
          // Try to find last non-ATIS callsign from active sessions
          let foundNonAtis = false;
          for (const session of Object.values(activeSessions.sessions)) {
            if (session.type === "controller" && session.cid === m.cid && !session.callsign.toUpperCase().endsWith("_ATIS")) {
              displayLastCallsign = session.callsign;
              foundNonAtis = true;
              break;
            }
          }
          
          // If not found in active, check cache history
          if (!foundNonAtis) {
            const cache = loadHistory();
            for (const session of cache.sessions) {
              if (session.type === "controller" && session.cid === m.cid && !session.callsign.toUpperCase().endsWith("_ATIS")) {
                displayLastCallsign = session.callsign;
                foundNonAtis = true;
                break;
              }
            }
          }
          
          // If still not found, check database
          if (!foundNonAtis && process.env.DATABASE_URL) {
            try {
              const lastSession = await prisma.controllerSession.findFirst({
                where: {
                  cid: m.cid,
                  callsign: { not: { endsWith: "_ATIS" } },
                },
                orderBy: { start: "desc" },
              });
              if (lastSession) {
                displayLastCallsign = lastSession.callsign;
              } else {
                displayLastCallsign = null; // No non-ATIS callsign found
              }
            } catch (error) {
              // Database not available
            }
          }
          
          // If no non-ATIS found, set to null
          if (!foundNonAtis && !displayLastCallsign) {
            displayLastCallsign = null;
          }
        }

        return {
          cid: m.cid,
          name: m.name || "Not Tracked",
          rating: m.ratingName,
          ratingCode: m.rating,
          pilotRating: m.pilotRatingName,
          subdivision: actualSubdivision, // Use fresh subdivision
          division: m.division,
          registrationDate: m.registrationDate,
          lastSeen: m.lastSeen,
          lastSeenDate: m.lastSeen ? new Date(m.lastSeen).toLocaleDateString() : null,
          lastSeenTime: m.lastSeen ? new Date(m.lastSeen).toLocaleTimeString() : null,
          lastCallsign: displayLastCallsign,
          addedAt: m.addedAt,
          source: m.source,
          controllerMinutes: totalMinutes,
          controllerHours: formatHoursMinutesSeconds(totalMinutes),
          sessions: sessionCount,
        };
      })
    );

    // Apply filters
    let filteredMembers = membersWithHours;
    if (dateFilter || callsignFilter) {
      filteredMembers = membersWithHours.filter((m) => {
        if (dateFilter && m.lastSeen) {
          const lastSeenDate = new Date(m.lastSeen).toISOString().slice(0, 10);
          if (lastSeenDate !== dateFilter) return false;
        }
        if (callsignFilter && m.lastCallsign) {
          if (!m.lastCallsign.toLowerCase().includes(callsignFilter.toLowerCase())) return false;
        }
        return true;
      });
    }

    // Recalculate stats from actual member hours (not stored roster minutes)
    const actualTotalMinutes = filteredMembers.reduce((sum, m) => sum + (m.controllerMinutes || 0), 0);
    const actualTotalSeconds = Math.floor(actualTotalMinutes * 60);
    const actualHours = Math.floor(actualTotalSeconds / 3600);
    const actualMinutes = Math.floor((actualTotalSeconds % 3600) / 60);
    const actualSeconds = actualTotalSeconds % 60;
    const actualTotalHoursFormatted = `${actualHours.toString().padStart(3, "0")}:${actualMinutes.toString().padStart(2, "0")}:${actualSeconds.toString().padStart(2, "0")}`;

    // Calculate total sessions from all members (including active sessions)
    const actualTotalSessions = filteredMembers.reduce((sum, m) => sum + (m.sessions || 0), 0);

    return NextResponse.json({
      lastUpdated: roster.lastUpdated,
      stats: {
        ...stats,
        totalControllerHours: actualTotalHoursFormatted,
        totalSessions: actualTotalSessions,
      },
      members: filteredMembers,
      filters: {
        date: dateFilter || null,
        callsign: callsignFilter || null,
      },
    });
  } catch (error) {
    console.error("Error fetching roster:", error);
    return NextResponse.json({ error: "Failed to fetch roster" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cid = Number(body.cid);

    if (!cid || isNaN(cid)) {
      return NextResponse.json({ error: "Invalid CID" }, { status: 400 });
    }

    const result = await addMemberToRoster(cid, "manual");

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      member: {
        cid: result.member!.cid,
        rating: result.member!.ratingName,
        subdivision: result.member!.subdivision,
      },
    });
  } catch (error) {
    console.error("Error adding member:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const cid = Number(url.searchParams.get("cid"));

    if (!cid || isNaN(cid)) {
      return NextResponse.json({ error: "Invalid CID" }, { status: 400 });
    }

    const removed = removeMemberFromRoster(cid);

    if (!removed) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}



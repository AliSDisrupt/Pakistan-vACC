import { NextRequest, NextResponse } from "next/server";
import { loadHistory, getAggregatedStats } from "@/lib/cache";

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
  const groupBy = (url.searchParams.get("groupBy") as "day" | "week" | "month" | "year") || "day";

  try {
    const history = loadHistory();
    const aggregated = getAggregatedStats(groupBy);

    // Recalculate totals excluding ATIS sessions (in case old data includes ATIS)
    const recalculatedControllerMinutes = history.sessions
      .filter((s) => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS"))
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    
    const recalculatedControllerSessions = history.sessions.filter(
      (s) => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS")
    ).length;

    const recalculatedPilotMinutes = history.sessions
      .filter((s) => s.type === "pilot")
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    
    const recalculatedPilotSessions = history.sessions.filter((s) => s.type === "pilot").length;

    return NextResponse.json({
      lastUpdated: history.lastUpdated,
      totals: {
        controllerHours: formatHoursMinutesSeconds(recalculatedControllerMinutes),
        controllerSessions: recalculatedControllerSessions,
        pilotHours: formatHoursMinutesSeconds(recalculatedPilotMinutes),
        pilotSessions: recalculatedPilotSessions,
      },
      recentSessions: history.sessions.slice(0, 50).map((s) => ({
        type: s.type,
        callsign: s.callsign,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: s.durationMinutes,
        duration: formatHoursMinutesSeconds(s.durationMinutes),
        ...(s.type === "controller"
          ? { frequency: s.frequency, facility: s.facility }
          : { departure: s.departure, arrival: s.arrival, aircraft: s.aircraft }),
      })),
      aggregated: aggregated.map((a) => ({
        period: a.period,
        controllerHours: formatHoursMinutesSeconds(a.controllerMinutes),
        controllerSessions: a.controllerSessions,
        pilotHours: formatHoursMinutesSeconds(a.pilotMinutes),
        pilotSessions: a.pilotSessions,
      })),
    });
  } catch (error) {
    console.error("Error loading cached history:", error);
    return NextResponse.json(
      { error: "Failed to load cached history" },
      { status: 500 }
    );
  }
}



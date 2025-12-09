import { NextResponse } from "next/server";
import axios from "axios";
import { updateSessions, loadSessions, loadHistory } from "@/lib/cache";
import { loadRoster } from "@/lib/roster";
import { getControllerCoordinates, calculateETA } from "@/lib/airports";

// Rating names mapping
const RATING_NAMES: Record<number, string> = {
  0: "Suspended",
  1: "Observer",
  2: "Tower Trainee",
  3: "Tower Controller",
  4: "Senior Tower Controller",
  5: "Enroute Controller",
  6: "Senior Enroute Controller",
  7: "Instructor",
  8: "Senior Instructor",
  9: "Supervisor",
  10: "Senior Supervisor",
  11: "Administrator",
};

// Fetch member info from VATSIM API
async function fetchMemberInfo(cid: number): Promise<{
  rating?: number;
  ratingName?: string;
  subdivision?: string;
  suspended?: boolean;
} | null> {
  try {
    const { data } = await axios.get(`https://api.vatsim.net/api/ratings/${cid}/`, {
      timeout: 5000,
    });
    return {
      rating: data.rating,
      ratingName: RATING_NAMES[data.rating] || `Rating ${data.rating}`,
      subdivision: data.subdivision || null,
      suspended: data.susp_date !== null,
    };
  } catch (error) {
    // Silently fail - member info is optional
    return null;
  }
}

const FEED_URL = "https://data.vatsim.net/v3/vatsim-data.json";

interface VatsimController {
  cid: number;
  name: string;
  callsign: string;
  frequency: string;
  facility: number;
  rating: number;
  server: string;
  visual_range: number;
  text_atis: string[] | null;
  last_updated: string;
  logon_time: string;
}

interface VatsimPilot {
  cid: number;
  name: string;
  callsign: string;
  server: string;
  pilot_rating: number;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  transponder: string;
  heading: number;
  qnh_i_hg: number;
  qnh_mb: number;
  flight_plan: {
    flight_rules: string;
    aircraft: string;
    aircraft_faa: string;
    aircraft_short: string;
    departure: string;
    arrival: string;
    alternate: string;
    cruise_tas: string;
    altitude: string;
    deptime: string;
    enroute_time: string;
    fuel_time: string;
    remarks: string;
    route: string;
  } | null;
  logon_time: string;
  last_updated: string;
}

interface VatsimFeed {
  general: {
    version: number;
    reload: number;
    update: string;
    update_timestamp: string;
    connected_clients: number;
    unique_users: number;
  };
  pilots: VatsimPilot[];
  controllers: VatsimController[];
  atis: VatsimController[];
  servers: unknown[];
  prefiles: unknown[];
  facilities: unknown[];
  ratings: unknown[];
  pilot_ratings: unknown[];
}

const isPkController = (cs: string) =>
  /^OP[A-Z0-9]{2,}_(DEL|GND|TWR|APP|DEP|CTR|FSS|ATIS)$/i.test(cs);

const isPkPilot = (pilot: VatsimPilot) => {
  const dep = pilot.flight_plan?.departure?.toUpperCase() || "";
  const arr = pilot.flight_plan?.arrival?.toUpperCase() || "";
  return dep.startsWith("OP") || arr.startsWith("OP");
};

function getMinutesOnline(logonTime: string): number {
  const logon = new Date(logonTime);
  const now = new Date();
  return Math.round((now.getTime() - logon.getTime()) / 60000);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Format minutes as HHH:MM:SS
function formatHoursMinutesSeconds(totalMinutes: number): string {
  const totalSeconds = Math.floor(totalMinutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(3, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function getFacilityName(facility: number): string {
  const facilities: Record<number, string> = {
    0: "OBS",
    1: "FSS",
    2: "DEL",
    3: "GND",
    4: "TWR",
    5: "APP",
    6: "CTR",
  };
  return facilities[facility] || "Unknown";
}

export async function GET() {
  try {
    const { data } = await axios.get<VatsimFeed>(FEED_URL, { timeout: 15000 });

    // Get Pakistan controllers (including ATIS for display, but we won't track ATIS hours)
    const allControllers = [...data.controllers, ...data.atis];
    const pkControllersRaw = allControllers.filter((c) => isPkController(c.callsign));
    
    // Load roster once to check for existing residents
    const roster = loadRoster();
    
    // Fetch member info for all controllers in parallel
    const controllerInfoPromises = pkControllersRaw.map(async (c) => {
      // Check if this is a resident (already in roster with PAK subdivision)
      const existingMember = roster.members[c.cid];
      const isExistingResident = existingMember?.subdivision === "PAK";
      
      // Only fetch member info if not an existing resident (to avoid unnecessary API calls)
      const memberInfo = isExistingResident ? null : await fetchMemberInfo(c.cid);
      
      // VATSIM live feed sometimes returns CID as name for privacy
      // If name is just the CID number, extract position from callsign as fallback
      let displayName = c.name;
      if (c.name === String(c.cid) || c.name === `${c.cid}` || !c.name || c.name.trim() === "") {
        // Extract position from callsign (e.g., "OPLA_APP" -> "APP")
        const position = c.callsign.split("_").pop() || "";
        displayName = position || `Controller ${c.cid}`;
      }
      
      // Use existing member info if resident, otherwise use fetched info
      const subdivision = isExistingResident 
        ? existingMember.subdivision 
        : (memberInfo?.subdivision || null);
      const isResident = subdivision === "PAK";
      const isInactive = isExistingResident 
        ? false // Don't check inactive for existing residents
        : (memberInfo?.suspended || false);
      const rating = isExistingResident 
        ? existingMember.rating 
        : memberInfo?.rating;
      const ratingName = isExistingResident 
        ? existingMember.ratingName 
        : memberInfo?.ratingName;
      
      // Get coordinates for controller (from airport code in callsign)
      const controllerCoords = getControllerCoordinates(c.callsign);
      
      return {
        cid: c.cid,
        name: displayName,
        callsign: c.callsign,
        frequency: c.frequency,
        facility: getFacilityName(c.facility),
        logonTime: c.logon_time,
        minutesOnline: getMinutesOnline(c.logon_time),
        duration: formatDuration(getMinutesOnline(c.logon_time)),
        atis: c.text_atis,
        rating: rating,
        ratingName: ratingName,
        subdivision: subdivision,
        memberType: isResident ? "Resident" : "Visitor",
        isInactive: isInactive,
        latitude: controllerCoords?.lat || null,
        longitude: controllerCoords?.lon || null,
        locationName: controllerCoords?.name || null,
      };
    });
    
    const pkControllers = await Promise.all(controllerInfoPromises);

    // Get pilots flying to/from Pakistan
    const pkPilotsRaw = data.pilots.filter(isPkPilot);
    
    // Pilots don't need type/resident info - just basic flight data
    const pkPilots = pkPilotsRaw.map((p) => {
      const arrival = p.flight_plan?.arrival || "N/A";
      const eta = calculateETA(p.latitude, p.longitude, arrival, p.groundspeed);
      
      return {
        cid: p.cid,
        name: p.name,
        callsign: p.callsign,
        departure: p.flight_plan?.departure || "N/A",
        arrival: arrival,
        aircraft: p.flight_plan?.aircraft_short || p.flight_plan?.aircraft_faa || "N/A",
        altitude: p.altitude,
        groundspeed: p.groundspeed,
        heading: p.heading,
        logonTime: p.logon_time,
        minutesOnline: getMinutesOnline(p.logon_time),
        duration: formatDuration(getMinutesOnline(p.logon_time)),
        latitude: p.latitude,
        longitude: p.longitude,
        etaMinutes: eta.etaMinutes,
        etaTime: eta.etaTime,
        distanceToArrival: eta.distance,
      };
    });

    // Update session cache and track changes
    const { added, removed } = await updateSessions(
      pkControllers.map((c) => ({
        cid: c.cid,
        name: c.name,
        callsign: c.callsign,
        frequency: c.frequency,
        facility: c.facility,
      })),
      pkPilots.map((p) => ({
        cid: p.cid,
        name: p.name,
        callsign: p.callsign,
        departure: p.departure,
        arrival: p.arrival,
        aircraft: p.aircraft,
      }))
    );

    // Get cached history stats
    const history = loadHistory();

    // Calculate totals (exclude ATIS from controller minutes)
    const totalControllerMinutes = pkControllers
      .filter((c) => !c.callsign.toUpperCase().endsWith("_ATIS"))
      .reduce((sum, c) => sum + c.minutesOnline, 0);
    const totalPilotMinutes = pkPilots.reduce((sum, p) => sum + p.minutesOnline, 0);

    // Recalculate cached stats excluding ATIS (in case old data includes ATIS)
    const recalculatedControllerMinutes = history.sessions
      .filter((s) => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS"))
      .reduce((sum, s) => sum + s.durationMinutes, 0);
    
    const recalculatedControllerSessions = history.sessions.filter(
      (s) => s.type === "controller" && !s.callsign.toUpperCase().endsWith("_ATIS")
    ).length;

    return NextResponse.json({
      updated: data.general.update_timestamp,
      controllers: {
        count: pkControllers.length,
        totalMinutes: totalControllerMinutes,
        totalHours: (totalControllerMinutes / 60).toFixed(1),
        list: pkControllers.sort((a, b) => b.minutesOnline - a.minutesOnline),
      },
      pilots: {
        count: pkPilots.length,
        totalMinutes: totalPilotMinutes,
        totalHours: (totalPilotMinutes / 60).toFixed(1),
        list: pkPilots.sort((a, b) => b.minutesOnline - a.minutesOnline),
      },
      recentChanges: {
        added: added.map((a) => ({ message: a.message, timestamp: a.timestamp })),
        removed: removed.map((r) => ({
          message: `${r.type === "controller" ? "🎧" : "✈️"} ${r.callsign} (${r.durationMinutes}min)`,
          timestamp: r.removedAt || r.endTime,
        })),
      },
      cachedStats: {
        totalControllerHours: formatHoursMinutesSeconds(recalculatedControllerMinutes),
        totalControllerSessions: recalculatedControllerSessions,
        totalPilotHours: formatHoursMinutesSeconds(history.stats.totalPilotMinutes),
        totalPilotSessions: history.stats.totalPilotSessions,
      },
    });
  } catch (error) {
    console.error("Failed to fetch VATSIM data:", error);
    return NextResponse.json(
      { error: "Failed to fetch VATSIM data" },
      { status: 500 }
    );
  }
}

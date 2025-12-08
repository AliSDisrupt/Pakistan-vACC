import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const FEED_URL = "https://data.vatsim.net/v3/vatsim-data.json";

interface VatsimController {
  cid: number;
  name: string;
  callsign: string;
  frequency: string;
  facility: number;
  rating: number;
  visual_range: number;
  text_atis: string[] | null;
  logon_time: string;
}

interface VatsimFeed {
  general: {
    update_timestamp: string;
    connected_clients: number;
    unique_users: number;
  };
  controllers: VatsimController[];
  atis: VatsimController[];
}

const RATING_NAMES: Record<number, string> = {
  1: "OBS",
  2: "S1",
  3: "S2",
  4: "S3",
  5: "C1",
  6: "C2",
  7: "C3",
  8: "I1",
  9: "I2",
  10: "I3",
  11: "SUP",
  12: "ADM",
};

const FACILITY_NAMES: Record<number, string> = {
  0: "OBS",
  1: "FSS",
  2: "DEL",
  3: "GND",
  4: "TWR",
  5: "APP",
  6: "CTR",
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

function getRegionFromCallsign(callsign: string): string {
  const prefix = callsign.slice(0, 2).toUpperCase();
  const prefixMap: Record<string, string> = {
    // Europe
    EG: "UK", LF: "France", ED: "Germany", LI: "Italy", LE: "Spain",
    EH: "Netherlands", EB: "Belgium", LO: "Austria", LS: "Switzerland",
    EP: "Poland", LK: "Czech", EI: "Ireland", EN: "Norway", ES: "Sweden",
    EF: "Finland", EK: "Denmark", LP: "Portugal", LG: "Greece", LH: "Hungary",
    // Americas
    K: "USA", C: "Canada", MM: "Mexico", SB: "Brazil", SA: "Argentina",
    // Asia
    ZB: "China", ZS: "China", ZG: "China", RJ: "Japan", RK: "Korea",
    VT: "Thailand", WS: "Singapore", WM: "Malaysia", WI: "Indonesia",
    OP: "Pakistan", VI: "India", VE: "India", VA: "India",
    OE: "Saudi", OO: "UAE", OB: "Bahrain", OK: "Kuwait", OI: "Iran",
    // Oceania
    Y: "Australia", NZ: "New Zealand",
    // Africa
    FA: "South Africa", DT: "Tunisia", GM: "Morocco", HE: "Egypt",
  };
  
  // Try 2-char match first, then 1-char
  if (prefixMap[prefix]) return prefixMap[prefix];
  if (prefixMap[prefix[0]]) return prefixMap[prefix[0]];
  return "Other";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "all"; // all, ctr, app, twr, gnd
  const region = url.searchParams.get("region") || "all";

  try {
    const { data } = await axios.get<VatsimFeed>(FEED_URL, { timeout: 15000 });

    let allControllers = [...data.controllers, ...data.atis]
      .filter((c) => c.facility > 0) // Exclude observers
      .map((c) => ({
        cid: c.cid,
        name: c.name,
        callsign: c.callsign,
        frequency: c.frequency,
        facility: FACILITY_NAMES[c.facility] || "UNK",
        facilityCode: c.facility,
        rating: RATING_NAMES[c.rating] || `R${c.rating}`,
        ratingCode: c.rating,
        region: getRegionFromCallsign(c.callsign),
        minutesOnline: getMinutesOnline(c.logon_time),
        duration: formatDuration(getMinutesOnline(c.logon_time)),
        logonTime: c.logon_time,
        isAtis: c.text_atis !== null && c.text_atis.length > 0,
      }));

    // Apply facility filter
    if (filter !== "all") {
      const facilityMap: Record<string, number[]> = {
        ctr: [6],
        app: [5],
        twr: [4],
        gnd: [2, 3],
        fss: [1],
      };
      const allowedFacilities = facilityMap[filter] || [];
      if (allowedFacilities.length > 0) {
        allControllers = allControllers.filter((c) =>
          allowedFacilities.includes(c.facilityCode)
        );
      }
    }

    // Apply region filter
    if (region !== "all") {
      allControllers = allControllers.filter(
        (c) => c.region.toLowerCase() === region.toLowerCase()
      );
    }

    // Sort by facility (CTR > APP > TWR > GND > DEL) then by duration
    allControllers.sort((a, b) => {
      if (b.facilityCode !== a.facilityCode) {
        return b.facilityCode - a.facilityCode;
      }
      return b.minutesOnline - a.minutesOnline;
    });

    // Group by region for stats
    const regionStats: Record<string, number> = {};
    const facilityStats: Record<string, number> = {};

    for (const c of allControllers) {
      regionStats[c.region] = (regionStats[c.region] || 0) + 1;
      facilityStats[c.facility] = (facilityStats[c.facility] || 0) + 1;
    }

    return NextResponse.json({
      updated: data.general.update_timestamp,
      totalOnline: allControllers.length,
      totalGlobal: data.controllers.length + data.atis.length,
      globalStats: {
        connectedClients: data.general.connected_clients,
        uniqueUsers: data.general.unique_users,
      },
      regionStats: Object.entries(regionStats)
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count),
      facilityStats: Object.entries(facilityStats)
        .map(([facility, count]) => ({ facility, count }))
        .sort((a, b) => b.count - a.count),
      controllers: allControllers.slice(0, 200), // Limit for performance
    });
  } catch (error) {
    console.error("Failed to fetch global ATC:", error);
    return NextResponse.json(
      { error: "Failed to fetch VATSIM data" },
      { status: 500 }
    );
  }
}



import fs from "fs";
import path from "path";
import axios from "axios";
import { loadHistory, loadSessions } from "./cache";
import { prisma } from "./db";

const CACHE_DIR = path.join(process.cwd(), "data");
const ROSTER_FILE = path.join(CACHE_DIR, "pak-roster.json");

interface MemberInfo {
  cid: number;
  name?: string; // Member's name from VATSIM
  rating: number;
  ratingName: string;
  pilotRating: number;
  pilotRatingName: string;
  subdivision: string;
  division: string;
  region: string;
  registrationDate: string;
  lastSeen?: string;
  lastCallsign?: string;
  addedAt: string;
  source: "manual" | "auto-detected";
  totalControllerMinutes?: number;
  totalPilotMinutes?: number;
  sessionsCount?: number;
}

interface RosterCache {
  lastUpdated: string;
  members: Record<number, MemberInfo>;
}

const RATING_NAMES: Record<number, string> = {
  "-1": "Inactive",
  0: "Suspended",
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

const PILOT_RATING_NAMES: Record<number, string> = {
  0: "None",
  1: "PPL",
  3: "IR",
  7: "CMEL",
  15: "ATPL",
};

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function loadRoster(): RosterCache {
  ensureCacheDir();
  try {
    if (fs.existsSync(ROSTER_FILE)) {
      const data = fs.readFileSync(ROSTER_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading roster:", e);
  }
  return { lastUpdated: new Date().toISOString(), members: {} };
}

export function saveRoster(cache: RosterCache) {
  ensureCacheDir();
  cache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ROSTER_FILE, JSON.stringify(cache, null, 2));
}

// Fetch member info from VATSIM API
export async function fetchMemberInfo(cid: number): Promise<{
  isPakistan: boolean;
  info?: MemberInfo;
  error?: string;
}> {
  try {
    const { data } = await axios.get(`https://api.vatsim.net/api/ratings/${cid}/`, {
      timeout: 10000,
    });

    const isPakistan = data.subdivision === "PAK" || 
                       (data.division === "WA" && !data.subdivision);

    if (!isPakistan) {
      return { isPakistan: false, error: "Not a Pakistan member" };
    }

    return {
      isPakistan: true,
      info: {
        cid: Number(data.id),
        name: data.name_first && data.name_last 
          ? `${data.name_first} ${data.name_last}`.trim() 
          : data.name_first || data.name_last || "Not Tracked",
        rating: data.rating,
        ratingName: RATING_NAMES[data.rating] || `R${data.rating}`,
        pilotRating: data.pilotrating,
        pilotRatingName: PILOT_RATING_NAMES[data.pilotrating] || `P${data.pilotrating}`,
        subdivision: data.subdivision || "PAK",
        division: data.division,
        region: data.region,
        registrationDate: data.reg_date,
        addedAt: new Date().toISOString(),
        source: "manual",
      },
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { isPakistan: false, error: "Member not found" };
    }
    return { isPakistan: false, error: "Failed to fetch member data" };
  }
}

// Add or update a member in the roster
export async function addMemberToRoster(
  cid: number,
  source: "manual" | "auto-detected" = "manual",
  forceAdd: boolean = false
): Promise<{ success: boolean; member?: MemberInfo; error?: string }> {
  const roster = loadRoster();

  // Check if already in roster
  if (roster.members[cid]) {
    roster.members[cid].lastSeen = new Date().toISOString();
    
    // If member has "Unknown" rating, try to update their info
    if (roster.members[cid].ratingName === "Unknown" || roster.members[cid].rating === 0) {
      const result = await fetchMemberInfo(cid);
      if (result.info) {
        // Update member info but preserve source and addedAt
        roster.members[cid] = {
          ...result.info,
          source: roster.members[cid].source,
          addedAt: roster.members[cid].addedAt,
          lastSeen: new Date().toISOString(),
          totalControllerMinutes: roster.members[cid].totalControllerMinutes,
          totalPilotMinutes: roster.members[cid].totalPilotMinutes,
          sessionsCount: roster.members[cid].sessionsCount,
          lastCallsign: roster.members[cid].lastCallsign,
        };
      }
    }
    
    saveRoster(roster);
    return { success: true, member: roster.members[cid] };
  }

  // Try to fetch member info
  const result = await fetchMemberInfo(cid);

  // If we got member info, use it
  if (result.info) {
    // If forceAdd is true, add even if not Pakistan subdivision
    if (!forceAdd && !result.isPakistan) {
      return { success: false, error: "Not a Pakistan member" };
    }

    result.info.source = source;
    roster.members[cid] = result.info;
    saveRoster(roster);
    return { success: true, member: result.info };
  }

  // If forceAdd is true and API failed, add with minimal info
  if (forceAdd) {
    const minimalInfo: MemberInfo = {
      cid,
      name: "Not Tracked",
      rating: 0,
      ratingName: "Unknown",
      pilotRating: 0,
      pilotRatingName: "Unknown",
      subdivision: "PAK",
      division: "WA",
      region: "Unknown",
      registrationDate: new Date().toISOString(),
      addedAt: new Date().toISOString(),
      source,
    };
    roster.members[cid] = minimalInfo;
    saveRoster(roster);
    return { success: true, member: minimalInfo };
  }

  return { success: false, error: result.error || "Failed to fetch member data" };
}

// Update member stats (called when a session ends)
export function updateMemberStats(
  cid: number,
  type: "controller" | "pilot",
  minutes: number,
  callsign?: string
) {
  const roster = loadRoster();
  
  if (roster.members[cid]) {
    const now = new Date().toISOString();
    roster.members[cid].lastSeen = now;
    roster.members[cid].sessionsCount = (roster.members[cid].sessionsCount || 0) + 1;
    
    if (type === "controller") {
      roster.members[cid].totalControllerMinutes = 
        (roster.members[cid].totalControllerMinutes || 0) + minutes;
      // Only update lastCallsign if it's not an ATIS callsign
      if (callsign && !callsign.toUpperCase().endsWith("_ATIS")) {
        roster.members[cid].lastCallsign = callsign;
      }
    } else {
      roster.members[cid].totalPilotMinutes = 
        (roster.members[cid].totalPilotMinutes || 0) + minutes;
    }
    
    saveRoster(roster);
  }
}

// Find last non-ATIS callsign for a member from their session history
async function findLastNonAtisCallsign(cid: number): Promise<string | null> {
  // Check active sessions first
  const activeSessions = loadSessions();
  for (const session of Object.values(activeSessions.sessions)) {
    if (session.type === "controller" && session.cid === cid && !session.callsign.toUpperCase().endsWith("_ATIS")) {
      return session.callsign;
    }
  }
  
  // Check cache history
  const cache = loadHistory();
  for (const session of cache.sessions) {
    if (session.type === "controller" && session.cid === cid && !session.callsign.toUpperCase().endsWith("_ATIS")) {
      return session.callsign;
    }
  }
  
  // Check database if available
  if (process.env.DATABASE_URL) {
    try {
      const sessions = await prisma.controllerSession.findMany({
        where: {
          cid: cid,
          callsign: { not: { endsWith: "_ATIS" } },
        },
        orderBy: { start: "desc" },
        take: 1,
      });
      if (sessions.length > 0) {
        return sessions[0].callsign;
      }
    } catch (error) {
      // Database not available
    }
  }
  
  return null;
}

// Update member info from live data when they come online
export async function updateMemberFromLive(cid: number, name: string, callsign?: string) {
  const roster = loadRoster();
  
  if (roster.members[cid]) {
    const member = roster.members[cid];
    
    // Update name if it's "Not Tracked" or "Unknown" or empty
    if (!member.name || member.name === "Not Tracked" || member.name === "Unknown" || member.name.trim() === "") {
      // Only update if we have a real name (not just CID or position)
      if (name && name !== String(cid) && !name.match(/^(APP|TWR|GND|DEL|CTR|FSS|ATIS)$/i)) {
        member.name = name;
      }
    }
    
    member.lastSeen = new Date().toISOString();
    
    // Only update lastCallsign if it's not an ATIS callsign
    if (callsign && !callsign.toUpperCase().endsWith("_ATIS")) {
      member.lastCallsign = callsign;
    } else if (callsign && callsign.toUpperCase().endsWith("_ATIS")) {
      // If current callsign is ATIS, try to find last non-ATIS callsign
      const lastNonAtis = await findLastNonAtisCallsign(cid);
      if (lastNonAtis) {
        member.lastCallsign = lastNonAtis;
      }
      // If no non-ATIS callsign found, keep existing lastCallsign (don't overwrite with ATIS)
    }
    
    // Only update type and rating for new members (not residents)
    // Residents keep their existing type and rating - don't update them
    const isResident = member.subdivision === "PAK";
    
    if (!isResident) {
      // Try to fetch full member info if rating is still Unknown (only for non-residents)
      if (member.ratingName === "Unknown" || member.rating === 0) {
        try {
          const result = await fetchMemberInfo(cid);
          if (result.info) {
            member.rating = result.info.rating;
            member.ratingName = result.info.ratingName;
            member.pilotRating = result.info.pilotRating;
            member.pilotRatingName = result.info.pilotRatingName;
            member.subdivision = result.info.subdivision;
            member.division = result.info.division;
            member.region = result.info.region;
            // Update name if we got it from API and it's better
            if (result.info.name && result.info.name !== "Not Tracked") {
              member.name = result.info.name;
            }
          }
        } catch (error) {
          // Silently fail, we'll try again next time
        }
      }
    }
    // If isResident, don't update their type/rating - keep existing values
    
    saveRoster(roster);
  }
}

// Update last seen when member is detected online
export function updateMemberLastSeen(cid: number, callsign?: string) {
  const roster = loadRoster();
  
  if (roster.members[cid]) {
    roster.members[cid].lastSeen = new Date().toISOString();
    // Only update lastCallsign if it's not an ATIS callsign
    if (callsign && !callsign.toUpperCase().endsWith("_ATIS")) {
      roster.members[cid].lastCallsign = callsign;
    }
    saveRoster(roster);
  }
}

// Remove a member from roster
export function removeMemberFromRoster(cid: number): boolean {
  const roster = loadRoster();
  
  if (roster.members[cid]) {
    delete roster.members[cid];
    saveRoster(roster);
    return true;
  }
  
  return false;
}

// Get all members sorted by rating
export function getRosterMembers(): MemberInfo[] {
  const roster = loadRoster();
  return Object.values(roster.members).sort((a, b) => {
    // Sort by rating (highest first), then by total hours
    if (b.rating !== a.rating) return b.rating - a.rating;
    const aHours = (a.totalControllerMinutes || 0) + (a.totalPilotMinutes || 0);
    const bHours = (b.totalControllerMinutes || 0) + (b.totalPilotMinutes || 0);
    return bHours - aHours;
  });
}

// Format minutes as HHH:MM:SS
function formatHoursMinutesSeconds(totalMinutes: number): string {
  const totalSeconds = Math.floor(totalMinutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(3, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Get roster stats
export function getRosterStats() {
  const members = getRosterMembers();
  
  const ratingDistribution: Record<string, number> = {};
  let totalControllerMinutes = 0;
  let totalPilotMinutes = 0;
  let totalSessions = 0;

  for (const m of members) {
    ratingDistribution[m.ratingName] = (ratingDistribution[m.ratingName] || 0) + 1;
    totalControllerMinutes += m.totalControllerMinutes || 0;
    totalPilotMinutes += m.totalPilotMinutes || 0;
    totalSessions += m.sessionsCount || 0;
  }

  return {
    totalMembers: members.length,
    ratingDistribution: Object.entries(ratingDistribution)
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => b.count - a.count),
    totalControllerMinutes,
    totalControllerHours: formatHoursMinutesSeconds(totalControllerMinutes),
    totalPilotMinutes,
    totalPilotHours: formatHoursMinutesSeconds(totalPilotMinutes),
    totalSessions,
  };
}



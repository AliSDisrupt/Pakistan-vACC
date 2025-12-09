"use client";

import useSWR, { mutate } from "swr";
import { useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler,
} from "chart.js";
import dynamic from "next/dynamic";

// Dynamically import map component to avoid SSR issues
const LiveMap = dynamic(() => import("./components/LiveMap"), { ssr: false });

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler);

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface LiveController {
  cid: number;
  name: string;
  callsign: string;
  frequency: string;
  facility: string;
  logonTime: string;
  minutesOnline: number;
  duration: string;
  atis?: string[] | null;
  rating?: number;
  ratingName?: string;
  subdivision?: string | null;
  memberType?: "Resident" | "Visitor";
  isInactive?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
}

interface LivePilot {
  cid: number;
  name: string;
  callsign: string;
  departure: string;
  arrival: string;
  aircraft: string;
  altitude: number;
  groundspeed: number;
  heading: number;
  logonTime: string;
  minutesOnline: number;
  duration: string;
  latitude: number;
  longitude: number;
  etaMinutes?: number | null;
  etaTime?: string | null;
  distanceToArrival?: number | null;
}

interface LiveData {
  updated: string;
  controllers: {
    count: number;
    totalMinutes: number;
    totalHours: string;
    list: LiveController[];
  };
  pilots: {
    count: number;
    totalMinutes: number;
    totalHours: string;
    list: LivePilot[];
  };
  recentChanges?: {
    added: Array<{ message: string; timestamp: string }>;
    removed: Array<{ message: string; timestamp: string }>;
  };
  cachedStats?: {
    totalControllerHours: string;
    totalControllerSessions: number;
    totalPilotHours: string;
    totalPilotSessions: number;
  };
}

interface GlobalController {
  cid: number;
  name: string;
  callsign: string;
  frequency: string;
  facility: string;
  rating: string;
  region: string;
  minutesOnline: number;
  duration: string;
  isAtis: boolean;
}

interface GlobalATCData {
  updated: string;
  totalOnline: number;
  totalGlobal: number;
  globalStats: {
    connectedClients: number;
    uniqueUsers: number;
  };
  regionStats: { region: string; count: number }[];
  facilityStats: { facility: string; count: number }[];
  controllers: GlobalController[];
}

interface CachedHistory {
  lastUpdated: string;
  totals: {
    controllerHours: string;
    controllerSessions: number;
    pilotHours: string;
    pilotSessions: number;
  };
  recentSessions: Array<{
    type: string;
    callsign: string;
    name: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    duration: string;
    frequency?: string;
    facility?: string;
    departure?: string;
    arrival?: string;
    aircraft?: string;
  }>;
  aggregated: Array<{
    period: string;
    controllerHours: string;
    controllerSessions: number;
    pilotHours: string;
    pilotSessions: number;
  }>;
}

interface RosterMember {
  cid: number;
  name: string;
  rating: string;
  ratingCode: number;
  pilotRating: string;
  subdivision: string;
  division: string;
  registrationDate: string;
  lastSeen?: string;
  lastSeenDate?: string | null;
  lastSeenTime?: string | null;
  lastCallsign?: string | null;
  addedAt: string;
  source: string;
  controllerMinutes: number;
  controllerHours: string; // Format: HHH:MM:SS
  sessions: number;
}

interface RosterData {
  lastUpdated: string;
  stats: {
    totalMembers: number;
    ratingDistribution: { rating: string; count: number }[];
    totalControllerHours: string;
    totalPilotHours: string;
    totalSessions: number;
  };
  members: RosterMember[];
  filters?: {
    date: string | null;
    callsign: string | null;
  };
}

interface MemberData {
  cid: string;
  rating: number;
  ratingName: string;
  pilotRating: number;
  pilotRatingName: string;
  region: string;
  division: string;
  divisionName: string;
  subdivision: string;
  isPakistan: boolean;
  registrationDate: string;
  lastRatingChange: string | null;
  suspended: boolean;
  error?: string;
}

type Tab = "live" | "roster" | "pilots" | "global" | "history" | "lookup";
type GroupBy = "day" | "week" | "month" | "year";

export default function Page() {
  const [tab, setTab] = useState<Tab>("live");
  const [zuluTime, setZuluTime] = useState<string>("");

  // Update Zulu time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getUTCHours().toString().padStart(2, "0");
      const minutes = now.getUTCMinutes().toString().padStart(2, "0");
      const seconds = now.getUTCSeconds().toString().padStart(2, "0");
      setZuluTime(`${hours}:${minutes}:${seconds}Z`);
    };

    updateTime(); // Set immediately
    const interval = setInterval(updateTime, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0f172a" }}>
      {/* Header */}
      <header
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
          borderBottom: "1px solid #1e3a5f",
          padding: "20px 24px",
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  overflow: "hidden",
                }}
              >
                <img 
                  src="https://images-ext-1.discordapp.net/external/DXpgrO7r3AVVFrJcIP5FirV98zgd7gmCZ2lWeCQDM-g/https/vatsimpakistan.com/assets/images/favicon.png?format=webp&quality=lossless&width=1038&height=959" 
                  alt="VATSIM Pakistan Logo" 
                  style={{ 
                    width: 56, 
                    height: 56,
                    objectFit: "contain"
                  }} 
                />
              </div>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" }}>
                  Pakistan VATSIM Dashboard
                </h1>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: 14 }}>
                  Live tracking • Auto-refresh every 15s • Session caching enabled
                </p>
              </div>
            </div>
            
            {/* Zulu Time Display */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 4,
              }}
            >
              <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 500 }}>
                ZULU TIME
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 24,
                  fontWeight: 600,
                  color: "#00c853",
                  letterSpacing: 2,
                }}
              >
                {zuluTime}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            <TabButton active={tab === "live"} onClick={() => setTab("live")}>
              🟢 Pakistan Live
            </TabButton>
            <TabButton active={tab === "roster"} onClick={() => setTab("roster")}>
              👥 PAK Members
            </TabButton>
            <TabButton active={tab === "pilots"} onClick={() => setTab("pilots")}>
              ✈️ Pilot Database
            </TabButton>
            <TabButton active={tab === "global"} onClick={() => setTab("global")}>
              🌍 Global ATC
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              📊 History
            </TabButton>
            <TabButton active={tab === "lookup"} onClick={() => setTab("lookup")}>
              🔍 Lookup
            </TabButton>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        {tab === "live" && <LiveTab />}
        {tab === "roster" && <RosterTab />}
        {tab === "pilots" && <PilotDatabaseTab />}
        {tab === "global" && <GlobalATCTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "lookup" && <MemberLookupTab />}
      </div>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 20px",
        borderRadius: 8,
        border: "none",
        background: active ? "#00c853" : "rgba(255,255,255,0.1)",
        color: active ? "#000" : "#fff",
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {children}
    </button>
  );
}

interface MemberDetailData {
  cid: number;
  memberInfo: {
    name: string;
    rating: number;
    ratingName: string;
    subdivision: string;
    division: string;
    region: string;
  } | null;
  totalHours: string;
  totalMinutes: number;
  totalSessions: number;
  callsigns: Array<{ callsign: string; hours: string; sessions: number }>;
  sessionsByDate: Array<{
    date: string;
    sessions: Array<{
      callsign: string;
      date: string;
      startTime: string;
      endTime: string;
      minutes: number;
      hours: string;
      fir: string | null;
      source: string;
    }>;
    totalMinutes: number;
    totalHours: string;
  }>;
  allSessions: Array<{
    callsign: string;
    date: string;
    startTime: string;
    endTime: string;
    minutes: number;
    hours: string;
    fir: string | null;
    source: string;
  }>;
}

function MemberDetailModal({ cid, onClose }: { cid: number; onClose: () => void }) {
  const { data, isLoading } = useSWR<MemberDetailData>(`/api/member-sessions?cid=${cid}`, fetcher);

  if (isLoading) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: "#1e293b",
            borderRadius: 16,
            padding: 32,
            maxWidth: 1200,
            width: "90%",
            maxHeight: "90vh",
            overflow: "auto",
            border: "1px solid #334155",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <LoadingState message="Loading member details..." />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: "#1e293b",
            borderRadius: 16,
            padding: 32,
            maxWidth: 1200,
            width: "90%",
            maxHeight: "90vh",
            overflow: "auto",
            border: "1px solid #334155",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: "#f87171" }}>Failed to load member details</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: 16,
          padding: 32,
          maxWidth: 1200,
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
          border: "1px solid #334155",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ color: "#fff", fontSize: 24, margin: 0 }}>
              Member Dashboard - CID {data.cid}
            </h2>
            {data.memberInfo && (
              <p style={{ color: "#94a3b8", margin: "8px 0 0", fontSize: 14 }}>
                {data.memberInfo.name} • {data.memberInfo.ratingName} • {data.memberInfo.subdivision}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: 24,
              cursor: "pointer",
              padding: "4px 12px",
            }}
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          <KpiCard title="Total Hours" value={data.totalHours} icon="🎧" color="#2196f3" />
          <KpiCard title="Total Sessions" value={data.totalSessions.toString()} icon="📊" color="#a855f7" />
          <KpiCard title="Callsigns Used" value={data.callsigns.length.toString()} icon="📻" color="#00c853" />
        </div>

        {/* Callsigns */}
        <div style={{ background: "#0f172a", borderRadius: 12, padding: 20, marginBottom: 24, border: "1px solid #334155" }}>
          <h3 style={{ color: "#fff", fontSize: 18, margin: "0 0 16px" }}>📻 Callsigns & Hours (Including ATIS)</h3>
          <DataTable
            headers={["Callsign", "Hours", "Sessions"]}
            rows={data.callsigns.map((c) => {
              const isAtis = c.callsign.toUpperCase().endsWith("_ATIS");
              return [
                <span 
                  key="cs" 
                  style={{ 
                    fontFamily: "monospace", 
                    color: isAtis ? "#64748b" : "#fbbf24", 
                    fontWeight: 600,
                    fontStyle: isAtis ? "italic" : "normal"
                  }}
                >
                  {c.callsign} {isAtis && <span style={{ color: "#94a3b8", fontSize: 11 }}>(ATIS)</span>}
                </span>,
                <span key="hrs" style={{ fontFamily: "monospace", color: "#2196f3", fontWeight: 600 }}>{c.hours}</span>,
                <span key="sess" style={{ color: "#a855f7" }}>{c.sessions}</span>,
              ];
            })}
          />
        </div>

        {/* Sessions by Date */}
        <div style={{ background: "#0f172a", borderRadius: 12, padding: 20, border: "1px solid #334155" }}>
          <h3 style={{ color: "#fff", fontSize: 18, margin: "0 0 16px" }}>📅 Sessions by Date</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.sessionsByDate.map((dateGroup) => (
              <div key={dateGroup.date} style={{ borderBottom: "1px solid #334155", paddingBottom: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h4 style={{ color: "#fff", fontSize: 16, margin: 0 }}>
                    {new Date(dateGroup.date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </h4>
                  <span style={{ fontFamily: "monospace", color: "#2196f3", fontWeight: 600 }}>
                    {dateGroup.totalHours} ({dateGroup.sessions.length} sessions)
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dateGroup.sessions.map((s, idx) => {
                    const isAtis = s.callsign.toUpperCase().endsWith("_ATIS");
                    return (
                      <div
                        key={idx}
                        style={{
                          background: "#1e293b",
                          padding: 12,
                          borderRadius: 8,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <span 
                            style={{ 
                              fontFamily: "monospace", 
                              color: isAtis ? "#64748b" : "#fbbf24", 
                              fontWeight: 600, 
                              marginRight: 12,
                              fontStyle: isAtis ? "italic" : "normal"
                            }}
                          >
                            {s.callsign} {isAtis && <span style={{ color: "#94a3b8", fontSize: 11 }}>(ATIS)</span>}
                          </span>
                          <span style={{ color: "#94a3b8", fontSize: 13 }}>
                            {new Date(s.startTime).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })}Z - {new Date(s.endTime).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })}Z
                          </span>
                        </div>
                        <span style={{ fontFamily: "monospace", color: "#2196f3", fontWeight: 600 }}>{s.hours}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RosterTab() {
  const [newCid, setNewCid] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [callsignFilter, setCallsignFilter] = useState("");
  const [selectedCid, setSelectedCid] = useState<number | null>(null);
  
  // Build API URL with filters
  const apiUrl = `/api/roster${dateFilter || callsignFilter ? `?${new URLSearchParams({
    ...(dateFilter && { date: dateFilter }),
    ...(callsignFilter && { callsign: callsignFilter }),
  }).toString()}` : ""}`;
  
  const { data, isLoading } = useSWR<RosterData>(apiUrl, fetcher, { refreshInterval: 900000 }); // 15 minutes

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCid.trim()) return;
    
    setAdding(true);
    setError("");
    
    try {
      const res = await fetch("/api/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid: newCid.trim() }),
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        setError(result.error || "Failed to add member");
      } else {
        setNewCid("");
        mutate("/api/roster");
      }
    } catch {
      setError("Failed to add member");
    } finally {
      setAdding(false);
    }
  };


  if (isLoading) {
    return <LoadingState message="Loading Pakistan roster..." />;
  }

  const stats = data?.stats;
  const members = data?.members || [];

  return (
    <div>
      <div style={{ background: "#1e3a5f", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
        <p style={{ color: "#94a3b8", margin: 0, fontSize: 14 }}>
          👥 <strong>Pakistan Subdivision Roster:</strong> Members are auto-detected when they control Pakistan positions, 
          or you can manually add CIDs. Only members with subdivision <code style={{ background: "#334155", padding: "2px 6px", borderRadius: 4 }}>PAK</code> are added.
        </p>
      </div>

      {/* Filters */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 24, border: "1px solid #334155" }}>
        <h3 style={{ color: "#fff", fontSize: 16, margin: "0 0 16px" }}>🔍 Filters</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px", minWidth: 200 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Date (YYYY-MM-DD)</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#fff",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 200 }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>Callsign</label>
            <input
              type="text"
              value={callsignFilter}
              onChange={(e) => setCallsignFilter(e.target.value)}
              placeholder="e.g., OPLA_APP"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "#fff",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <label style={{ display: "block", color: "#94a3b8", fontSize: 13, marginBottom: 6, visibility: "hidden" }}>Clear</label>
            <button
              onClick={() => {
                setDateFilter("");
                setCallsignFilter("");
              }}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#334155",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                whiteSpace: "nowrap",
                height: "42px",
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard title="Total Members" value={stats?.totalMembers?.toString() || "0"} icon="👥" color="#00c853" />
        <KpiCard title="ATC Hours" value={stats?.totalControllerHours || "000:00:00"} icon="🎧" color="#2196f3" />
        <KpiCard title="Sessions" value={stats?.totalSessions?.toString() || "0"} icon="📊" color="#a855f7" />
      </div>

      {/* Rating Distribution */}
      {stats?.ratingDistribution && stats.ratingDistribution.length > 0 && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
          <h3 style={{ color: "#fff", fontSize: 14, margin: "0 0 12px" }}>Rating Distribution</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {stats.ratingDistribution.map((r) => (
              <span
                key={r.rating}
                style={{
                  background: r.rating.includes("I") ? "#a855f7" : r.rating.includes("C") ? "#00c853" : "#334155",
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {r.rating}: {r.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add Member Form */}
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 24, border: "1px solid #334155" }}>
        <h3 style={{ color: "#fff", fontSize: 16, margin: "0 0 16px" }}>➕ Add Member by CID</h3>
        <form onSubmit={handleAddMember} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            value={newCid}
            onChange={(e) => setNewCid(e.target.value)}
            placeholder="Enter VATSIM CID"
            style={{
              flex: 1,
              minWidth: 200,
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#fff",
              fontSize: 16,
            }}
          />
          <button
            type="submit"
            disabled={adding}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: adding ? "#334155" : "#00c853",
              color: adding ? "#94a3b8" : "#000",
              fontWeight: 600,
              cursor: adding ? "not-allowed" : "pointer",
            }}
          >
            {adding ? "Adding..." : "Add to Roster"}
          </button>
        </form>
        {error && (
          <p style={{ color: "#f87171", margin: "12px 0 0", fontSize: 14 }}>⚠️ {error}</p>
        )}
      </div>

      {/* Members Table */}
      <section>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          🇵🇰 Pakistan Members ({members.length})
        </h2>
        {members.length > 0 ? (
          <DataTable
            headers={["CID", "Name", "Rating", "Pilot", "Type", "ATC Hours", "Last Callsign", "Sessions", "Last Seen", "Source"]}
            rows={members.map((m) => {
              const isResident = m.subdivision === "PAK";
              const memberType = isResident ? "Resident" : "Visitor";
              return [
                <button
                  key="cid"
                  onClick={() => setSelectedCid(m.cid)}
                  style={{
                    fontFamily: "monospace",
                    color: "#00c853",
                    fontWeight: 600,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  {m.cid}
                </button>,
                <span key="name" style={{ color: m.name === "Not Tracked" ? "#64748b" : "#fff", fontStyle: m.name === "Not Tracked" ? "italic" : "normal" }}>
                  {m.name}
                </span>,
                <Badge key="rat" color={m.ratingCode >= 5 ? "#00c853" : m.ratingCode >= 8 ? "#a855f7" : "#64748b"}>{m.rating}</Badge>,
                <span key="pilot" style={{ color: "#94a3b8" }}>{m.pilotRating}</span>,
                <span key="type" style={{ 
                  background: isResident ? "#00c853" : "#64748b",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  display: "inline-block"
                }}>
                  {memberType}
                </span>,
                <span key="atch" style={{ fontFamily: "monospace", color: "#2196f3", fontWeight: 600, fontSize: 14 }}>{m.controllerHours}</span>,
                <span key="callsign" style={{ fontFamily: "monospace", color: "#fbbf24", fontSize: 13 }}>
                  {m.lastCallsign || <span style={{ color: "#64748b" }}>—</span>}
                </span>,
                <span key="sess" style={{ color: "#a855f7" }}>{m.sessions}</span>,
                <span key="seen" style={{ color: "#fff", fontSize: 13 }}>
                  {m.lastSeenDate ? (
                    <div>
                      <div style={{ fontWeight: 600 }}>{m.lastSeenDate}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{m.lastSeenTime}</div>
                    </div>
                  ) : (
                    <span style={{ color: "#64748b" }}>Never</span>
                  )}
                </span>,
                <span key="src" style={{ color: "#64748b", fontSize: 12 }}>{m.source === "auto-detected" ? "🤖 Auto" : "✋ Manual"}</span>,
              ];
            })}
          />
        ) : (
          <EmptyState
            message="No Pakistan members in roster yet. Add members manually or they'll be auto-detected when they control."
            icon="👥"
          />
        )}
      </section>

      {/* Member Detail Modal */}
      {selectedCid && <MemberDetailModal cid={selectedCid} onClose={() => setSelectedCid(null)} />}
    </div>
  );
}

function LiveTab() {
  const { data, isLoading } = useSWR<LiveData>("/api/live", fetcher, { refreshInterval: 15000 });

  if (isLoading) {
    return <LoadingState message="Loading live data from VATSIM..." />;
  }

  const controllers = data?.controllers;
  const pilots = data?.pilots;
  const cached = data?.cachedStats;

  return (
    <div>
      {/* Status Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00c853", animation: "pulse 2s infinite" }} />
          <span style={{ color: "#00c853", fontSize: 12, fontWeight: 600 }}>LIVE</span>
        </div>
        {data?.updated && (
          <span style={{ color: "#64748b", fontSize: 12 }}>
            Updated: {new Date(data.updated).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}Z • Auto-refresh: 15s
          </span>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard title="Live Controllers" value={controllers?.count?.toString() || "0"} icon="🎧" color="#00c853" />
        <KpiCard title="Live Pilots" value={pilots?.count?.toString() || "0"} icon="✈️" color="#2196f3" />
        <KpiCard title="Cached ATC Hours" value={cached?.totalControllerHours || "0"} suffix="h" icon="📊" color="#fbbf24" />
        <KpiCard title="Cached Sessions" value={cached?.totalControllerSessions?.toString() || "0"} icon="📝" color="#fbbf24" />
      </div>

      {/* Live Map */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          🗺️ Live Map - Controllers & Pilots
        </h2>
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, border: "1px solid #334155" }}>
          <div style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#00c853", border: "2px solid #fff" }}></div>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Active Controller</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#ef4444", border: "2px solid #fff" }}></div>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Inactive Controller</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#2196f3", border: "2px solid #fff" }}></div>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Pilot</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 2, background: "#2196f3", opacity: 0.6, borderTop: "1px dashed #2196f3" }}></div>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Route (Dep → Current)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 2, background: "#00c853", opacity: 0.6, borderTop: "1px dashed #00c853" }}></div>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Route (Current → Arr)</span>
            </div>
          </div>
          <LiveMap
            controllers={controllers?.list?.filter((c) => c.latitude && c.longitude) || []}
            pilots={pilots?.list?.filter((p) => p.latitude && p.longitude) || []}
          />
        </div>
      </section>

      {/* Recent Changes */}
      {(data?.recentChanges?.added?.length || data?.recentChanges?.removed?.length) ? (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
          <h3 style={{ color: "#fff", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Recent Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data?.recentChanges?.added?.map((a, i) => (
              <div key={`added-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#00c853", fontSize: 16 }}>+</span>
                <span style={{ color: "#00c853", fontSize: 13, flex: 1 }}>{a.message}</span>
                <span style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>
                  {new Date(a.timestamp).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}Z
                </span>
              </div>
            ))}
            {data?.recentChanges?.removed?.map((r, i) => (
              <div key={`removed-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#f87171", fontSize: 16 }}>-</span>
                <span style={{ color: "#f87171", fontSize: 13, flex: 1 }}>{r.message}</span>
                <span style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>
                  {new Date(r.timestamp).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}Z
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Controllers Table */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          🎧 Live Pakistan Controllers ({controllers?.count || 0})
        </h2>
        {controllers?.list?.length ? (
          <DataTable
            headers={["Callsign", "Controller Name", "Rating", "Type", "Frequency", "Position", "Online", "CID"]}
            rows={controllers.list.map((c) => {
              const rowStyle = c.isInactive ? { background: "rgba(239, 68, 68, 0.1)", borderLeft: "3px solid #ef4444" } : {};
              return [
                <Badge key="cs" color={c.isInactive ? "#ef4444" : "#00c853"}>{c.callsign}</Badge>,
                <span key="name" style={{ color: c.isInactive ? "#ef4444" : "#fff", fontWeight: 500 }}>{c.name || "Unknown"}</span>,
                <span key="rating" style={{ color: "#94a3b8", fontSize: 12 }}>
                  {c.ratingName || "N/A"}
                </span>,
                <span key="type" style={{ 
                  background: c.memberType === "Resident" ? "#00c853" : "#64748b",
                  color: "#fff",
                  padding: "2px 8px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600
                }}>
                  {c.memberType || "Unknown"}
                </span>,
                <span key="freq" style={{ fontFamily: "monospace", color: "#fbbf24" }}>{c.frequency}</span>,
                c.facility,
                <span key="dur" style={{ color: "#00c853", fontWeight: 600 }}>{c.duration}</span>,
                <span key="cid" style={{ fontFamily: "monospace", color: "#00c853", fontWeight: 600 }}>{c.cid}</span>,
              ];
            })}
          />
        ) : (
          <EmptyState message="No controllers currently online in Pakistan" icon="🎧" />
        )}
      </section>

      {/* Pilots Table */}
      <section>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          ✈️ Pilots Flying To/From Pakistan ({pilots?.count || 0})
        </h2>
        {pilots?.list?.length ? (
          <DataTable
            headers={["Callsign", "Pilot Name", "VATSIM ID", "Route", "Aircraft", "Alt / GS", "Distance", "ETA", "Online"]}
            rows={pilots.list.map((p) => [
              <Badge key="cs" color="#2196f3">{p.callsign}</Badge>,
              <span key="name" style={{ color: "#fff", fontWeight: 500 }}>{p.name || "Unknown"}</span>,
              <span key="cid" style={{ fontFamily: "monospace", color: "#00c853", fontWeight: 600 }}>{p.cid}</span>,
              <span key="route">
                <span style={{ color: "#fbbf24", fontFamily: "monospace" }}>{p.departure}</span>
                <span style={{ color: "#64748b", margin: "0 8px" }}>→</span>
                <span style={{ color: "#00c853", fontFamily: "monospace" }}>{p.arrival}</span>
              </span>,
              <span key="ac" style={{ fontFamily: "monospace" }}>{p.aircraft}</span>,
              <span key="alt" style={{ fontFamily: "monospace", color: "#94a3b8" }}>
                FL{Math.round(p.altitude / 100)} / {p.groundspeed}kt
              </span>,
              <span key="dist" style={{ fontFamily: "monospace", color: "#fbbf24", fontWeight: 600 }}>
                {p.distanceToArrival !== null && p.distanceToArrival !== undefined 
                  ? `${p.distanceToArrival} nm`
                  : "N/A"}
              </span>,
              <span key="eta" style={{ color: p.etaTime ? "#00c853" : "#64748b", fontWeight: 600, fontFamily: "monospace" }}>
                {p.etaTime ? (
                  <span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.etaTime}</span>
                    {p.etaMinutes !== null && p.etaMinutes !== undefined && (
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4, display: "block" }}>
                        Landing in {p.etaMinutes}m
                      </span>
                    )}
                  </span>
                ) : (
                  "N/A"
                )}
              </span>,
              <span key="dur" style={{ color: "#2196f3", fontWeight: 600 }}>{p.duration}</span>,
            ])}
          />
        ) : (
          <EmptyState message="No pilots currently flying to/from Pakistan" icon="✈️" />
        )}
      </section>
    </div>
  );
}

function GlobalATCTab() {
  const [filter, setFilter] = useState("all");
  const [region, setRegion] = useState("all");
  
  const { data, isLoading } = useSWR<GlobalATCData>(
    `/api/global-atc?filter=${filter}&region=${region}`,
    fetcher,
    { refreshInterval: 15000 }
  );

  if (isLoading) {
    return <LoadingState message="Loading global ATC data..." />;
  }

  return (
    <div>
      {/* Global Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard title="ATC Online" value={data?.totalGlobal?.toString() || "0"} icon="🎧" color="#00c853" />
        <KpiCard title="Total Clients" value={data?.globalStats?.connectedClients?.toString() || "0"} icon="🌍" color="#2196f3" />
        <KpiCard title="Unique Users" value={data?.globalStats?.uniqueUsers?.toString() || "0"} icon="👥" color="#fbbf24" />
        <KpiCard title="Showing" value={data?.totalOnline?.toString() || "0"} icon="📋" color="#a855f7" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Position Type</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontSize: 14 }}
          >
            <option value="all">All Positions</option>
            <option value="ctr">Center (CTR)</option>
            <option value="app">Approach (APP)</option>
            <option value="twr">Tower (TWR)</option>
            <option value="gnd">Ground (GND/DEL)</option>
          </select>
        </div>
        <div>
          <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontSize: 14 }}
          >
            <option value="all">All Regions</option>
            <option value="pakistan">Pakistan</option>
            <option value="usa">USA</option>
            <option value="uk">UK</option>
            <option value="germany">Germany</option>
            <option value="france">France</option>
            <option value="india">India</option>
            <option value="australia">Australia</option>
          </select>
        </div>
      </div>

      {/* Region Stats */}
      {data?.regionStats && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
          <h3 style={{ color: "#fff", fontSize: 14, margin: "0 0 12px" }}>Controllers by Region</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {data.regionStats.slice(0, 12).map((r) => (
              <span
                key={r.region}
                style={{
                  background: r.region === "Pakistan" ? "#00c853" : "#334155",
                  color: r.region === "Pakistan" ? "#000" : "#fff",
                  padding: "4px 12px",
                  borderRadius: 20,
                  fontSize: 13,
                }}
              >
                {r.region}: {r.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controllers Table */}
      <section>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          🌍 Global Controllers ({data?.totalOnline || 0})
        </h2>
        {data?.controllers?.length ? (
          <DataTable
            headers={["Callsign", "Controller", "Freq", "Type", "Rating", "Region", "Online"]}
            rows={data.controllers.map((c) => [
              <Badge key="cs" color={c.region === "Pakistan" ? "#00c853" : "#64748b"}>{c.callsign}</Badge>,
              c.name,
              <span key="freq" style={{ fontFamily: "monospace", color: "#fbbf24" }}>{c.frequency}</span>,
              c.facility,
              <span key="rat" style={{ color: "#a855f7" }}>{c.rating}</span>,
              <span key="reg" style={{ color: c.region === "Pakistan" ? "#00c853" : "#94a3b8" }}>{c.region}</span>,
              <span key="dur" style={{ color: "#2196f3", fontWeight: 600 }}>{c.duration}</span>,
            ])}
          />
        ) : (
          <EmptyState message="No controllers match the current filter" icon="🎧" />
        )}
      </section>
    </div>
  );
}

function HistoryTab() {
  const { data, isLoading } = useSWR<CachedHistory>(`/api/cached-history?groupBy=day`, fetcher, { refreshInterval: 30000 });

  if (isLoading) {
    return <LoadingState message="Loading cached history..." />;
  }

  return (
    <div>
      <div style={{ background: "#1e3a5f", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
        <p style={{ color: "#94a3b8", margin: 0, fontSize: 14 }}>
          📦 <strong>Local Cache:</strong> Sessions are automatically tracked when controllers/pilots go online or offline.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KpiCard title="Total ATC Hours" value={data?.totals?.controllerHours || "000:00:00"} icon="🎧" color="#00c853" />
        <KpiCard title="ATC Sessions" value={data?.totals?.controllerSessions?.toString() || "0"} icon="📡" color="#00c853" />
        <KpiCard title="Total Pilot Hours" value={data?.totals?.pilotHours || "000:00:00"} icon="✈️" color="#2196f3" />
        <KpiCard title="Pilot Sessions" value={data?.totals?.pilotSessions?.toString() || "0"} icon="🛫" color="#2196f3" />
      </div>


      {/* Recent Sessions */}
      <section>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>📝 Recent Sessions</h2>
        {data?.recentSessions?.length ? (
          <DataTable
            headers={["Type", "Callsign", "Name", "Details", "Duration", "End Time"]}
            rows={data.recentSessions.map((s, i) => [
              s.type === "controller" ? "🎧" : "✈️",
              <Badge key="cs" color={s.type === "controller" ? "#00c853" : "#2196f3"}>{s.callsign}</Badge>,
              s.name,
              s.type === "controller" ? `${s.facility} @ ${s.frequency}` : `${s.departure} → ${s.arrival}`,
              <span key="dur" style={{ fontWeight: 600 }}>{s.duration}</span>,
              new Date(s.endTime).toLocaleString("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) + "Z",
            ])}
          />
        ) : (
          <EmptyState message="No sessions recorded yet" icon="📝" />
        )}
      </section>
    </div>
  );
}

function PilotDatabaseTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useSWR(
    `/api/pilots-database?limit=${limit}&offset=${page * limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: status } = useSWR("/api/data-status", fetcher, { refreshInterval: 60000 });

  if (isLoading) {
    return <LoadingState message="Loading pilot database..." />;
  }

  const pilots = data?.pilots || [];
  const total = data?.total || 0;

  return (
    <div>
      {/* Status Banner */}
      <div style={{ background: "#1e3a5f", borderRadius: 12, padding: 16, marginBottom: 24, border: "1px solid #334155" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h3 style={{ color: "#fff", margin: "0 0 8px", fontSize: 16 }}>📊 Data Storage Status</h3>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>
                Database: {status?.database?.connected ? "✅ Connected" : "❌ Not configured"}
              </span>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>
                Cache: ✅ Active ({status?.cache?.pilotSessions || 0} sessions)
              </span>
              {status?.database?.connected && (
                <span style={{ color: "#94a3b8", fontSize: 13 }}>
                  DB Pilots: {status?.database?.pilotSessions || 0}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#00c853", fontSize: 24, fontWeight: 700 }}>{total}</div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Total Flights</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search by callsign, name, or VATSIM ID..."
          style={{
            width: "100%",
            maxWidth: 500,
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#fff",
            fontSize: 16,
          }}
        />
      </div>

      {/* Pilots Table */}
      <section>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>
          ✈️ Pilot Database - Flights To/From Pakistan ({total})
        </h2>
        {pilots.length > 0 ? (
          <>
            <DataTable
              headers={["Date", "Callsign", "Pilot Name", "VATSIM ID", "Route", "Aircraft", "Duration", "Source"]}
              rows={pilots.map((p: any) => [
                <span key="date" style={{ fontFamily: "monospace", color: "#fbbf24" }}>
                  {new Date(p.date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" })}
                  <div style={{ fontSize: 11, color: "#64748b" }}>
                    {new Date(p.startTime).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })}Z
                  </div>
                </span>,
                <Badge key="cs" color="#2196f3">{p.callsign}</Badge>,
                <span key="name" style={{ color: "#fff", fontWeight: 500 }}>{p.name}</span>,
                <span key="cid" style={{ fontFamily: "monospace", color: "#00c853", fontWeight: 600 }}>
                  {p.cid || "N/A"}
                </span>,
                <span key="route">
                  <span style={{ color: "#fbbf24", fontFamily: "monospace" }}>{p.departure}</span>
                  <span style={{ color: "#64748b", margin: "0 8px" }}>→</span>
                  <span style={{ color: "#00c853", fontFamily: "monospace" }}>{p.arrival}</span>
                </span>,
                <span key="ac" style={{ fontFamily: "monospace" }}>{p.aircraft}</span>,
                <span key="dur" style={{ color: "#2196f3", fontWeight: 600 }}>{p.duration}</span>,
                <span key="src" style={{ color: "#64748b", fontSize: 12 }}>
                  {p.source === "database" ? "💾 DB" : "📦 Cache"}
                </span>,
              ])}
            />
            {/* Pagination */}
            {total > limit && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24, alignItems: "center" }}>
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #334155",
                    background: page === 0 ? "#334155" : "#1e293b",
                    color: page === 0 ? "#64748b" : "#fff",
                    cursor: page === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  ← Previous
                </button>
                <span style={{ color: "#94a3b8" }}>
                  Page {page + 1} of {Math.ceil(total / limit)} ({total} total)
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= total}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #334155",
                    background: (page + 1) * limit >= total ? "#334155" : "#1e293b",
                    color: (page + 1) * limit >= total ? "#64748b" : "#fff",
                    cursor: (page + 1) * limit >= total ? "not-allowed" : "pointer",
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            message={search ? "No flights found matching your search" : "No pilot flights recorded yet. Flights will appear here as pilots disconnect."}
            icon="✈️"
          />
        )}
      </section>
    </div>
  );
}

function MemberLookupTab() {
  const [cid, setCid] = useState("");
  const [searchCid, setSearchCid] = useState("");
  const { data: member, isLoading } = useSWR<MemberData>(searchCid ? `/api/member/${searchCid}` : null, fetcher);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (cid.trim()) setSearchCid(cid.trim());
  };

  return (
    <div>
      <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 16 }}>🔍 Member Lookup</h2>
      <p style={{ color: "#94a3b8", marginBottom: 24 }}>
        Look up any VATSIM member by CID to see their rating and division info.
      </p>

      <form onSubmit={handleSearch} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, maxWidth: 400 }}>
          <input
            type="text"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            placeholder="Enter CID (e.g., 1234567)"
            style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontSize: 16 }}
          />
          <button type="submit" style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: "#00c853", color: "#000", fontWeight: 600, cursor: "pointer" }}>
            Search
          </button>
        </div>
      </form>

      {isLoading && <div style={{ color: "#94a3b8", padding: 24 }}>Loading member data...</div>}

      {member && !member.error && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, border: "1px solid #334155" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: member.isPakistan ? "#00c853" : "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
              {member.isPakistan ? "🇵🇰" : "👤"}
            </div>
            <div>
              <h3 style={{ color: "#fff", fontSize: 24, margin: 0 }}>CID: {member.cid}</h3>
              {member.isPakistan && (
                <span style={{ background: "#00c853", color: "#000", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Pakistan Member</span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <InfoCard label="ATC Rating" value={member.ratingName} highlight />
            <InfoCard label="Pilot Rating" value={member.pilotRatingName} />
            <InfoCard label="Division" value={`${member.division}`} />
            <InfoCard label="Subdivision" value={member.subdivision || "None"} highlight={member.subdivision === "PAK"} />
            <InfoCard label="Registered" value={new Date(member.registrationDate).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" })} />
            <InfoCard label="Status" value={member.suspended ? "Suspended" : "Active"} highlight={!member.suspended} />
          </div>
        </div>
      )}

      {member?.error && (
        <div style={{ background: "#7f1d1d", border: "1px solid #dc2626", borderRadius: 12, padding: 16, color: "#fecaca" }}>{member.error}</div>
      )}
    </div>
  );
}

// Shared Components
function KpiCard({ title, value, suffix = "", icon, color }: { title: string; value: string; suffix?: string; icon: string; color: string }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, border: "1px solid #334155", borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>
            {value}<span style={{ fontSize: 14, fontWeight: 500 }}>{suffix}</span>
          </div>
        </div>
        <span style={{ fontSize: 24 }}>{icon}</span>
      </div>
    </div>
  );
}

function InfoCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: 16, borderLeft: highlight ? "3px solid #00c853" : "3px solid #334155" }}>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color: highlight ? "#00c853" : "#fff", fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ background: color, color: color === "#00c853" ? "#000" : "#fff", padding: "4px 8px", borderRadius: 4, fontWeight: 600, fontFamily: "monospace", fontSize: 13 }}>
      {children}
    </span>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, overflow: "auto", border: "1px solid #334155" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
        <thead>
          <tr style={{ background: "#0f172a" }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: "12px 16px", textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: 12, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "1px solid #334155" }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "12px 16px", color: "#94a3b8", fontSize: 14 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon: string }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: 48, textAlign: "center", border: "1px solid #334155" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>{icon}</div>
      <p style={{ color: "#64748b", margin: 0 }}>{message}</p>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      {message}
    </div>
  );
}

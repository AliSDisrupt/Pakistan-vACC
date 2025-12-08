import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadHistory } from "@/lib/cache";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const search = url.searchParams.get("search"); // Search by callsign, name, or CID

  try {
    // Try database first
    let dbPilots: any[] = [];
    let totalCount = 0;

    if (process.env.DATABASE_URL) {
      try {
        const where: any = {
          inPakistan: true,
        };

        if (from) {
          where.start = { ...where.start, gte: new Date(from) };
        }
        if (to) {
          where.start = { ...where.start, lte: new Date(to) };
        }
        if (search) {
          const searchNum = parseInt(search);
          if (!isNaN(searchNum)) {
            where.OR = [
              { cid: searchNum },
              { callsign: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ];
          } else {
            where.OR = [
              { callsign: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ];
          }
        }

        const [pilots, count] = await Promise.all([
          prisma.pilotSession.findMany({
            where,
            orderBy: { start: "desc" },
            take: limit,
            skip: offset,
          }),
          prisma.pilotSession.count({ where }),
        ]);

        dbPilots = pilots.map((p) => ({
          id: p.id,
          cid: p.cid,
          name: p.name || "Unknown",
          callsign: p.callsign,
          departure: p.dep || "N/A",
          arrival: p.arr || "N/A",
          aircraft: p.aircraft || "N/A",
          date: p.start.toISOString().slice(0, 10),
          startTime: p.start.toISOString(),
          endTime: p.end.toISOString(),
          duration: `${Math.floor(p.minutes / 60)}h ${p.minutes % 60}m`,
          minutes: p.minutes,
          source: "database",
        }));

        totalCount = count;
      } catch (dbError) {
        console.error("Database query error:", dbError);
        // Fall through to cache
      }
    }

    // Also get from cache
    const cache = loadHistory();
    const cachePilots = cache.sessions
      .filter((s) => s.type === "pilot")
      .map((s) => ({
        id: s.id,
        cid: s.cid,
        name: s.name || "Unknown",
        callsign: s.callsign,
        departure: s.departure || "N/A",
        arrival: s.arrival || "N/A",
        aircraft: s.aircraft || "N/A",
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: `${Math.floor(s.durationMinutes / 60)}h ${s.durationMinutes % 60}m`,
        minutes: s.durationMinutes,
        source: "cache",
      }));

    // Merge and deduplicate (prefer database over cache)
    const allPilots = [...dbPilots];
    const cacheIds = new Set(dbPilots.map((p) => p.id));
    for (const cp of cachePilots) {
      if (!cacheIds.has(cp.id)) {
        allPilots.push(cp);
      }
    }

    // Apply search filter if provided and not already applied to DB
    let filteredPilots = allPilots;
    if (search && !process.env.DATABASE_URL) {
      const searchLower = search.toLowerCase();
      filteredPilots = allPilots.filter(
        (p) =>
          p.callsign.toLowerCase().includes(searchLower) ||
          p.name.toLowerCase().includes(searchLower) ||
          String(p.cid).includes(search)
      );
    }

    // Apply date filters if not already applied to DB
    if ((from || to) && !process.env.DATABASE_URL) {
      filteredPilots = filteredPilots.filter((p) => {
        const date = p.date;
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
      });
    }

    // Sort by date descending
    filteredPilots.sort((a, b) => b.startTime.localeCompare(a.startTime));

    // Apply pagination
    const paginated = filteredPilots.slice(offset, offset + limit);

    return NextResponse.json({
      total: process.env.DATABASE_URL ? totalCount : filteredPilots.length,
      from: offset,
      limit,
      pilots: paginated,
      sources: {
        database: dbPilots.length,
        cache: cachePilots.length,
      },
    });
  } catch (error) {
    console.error("Error fetching pilot database:", error);
    return NextResponse.json(
      { error: "Failed to fetch pilot database" },
      { status: 500 }
    );
  }
}


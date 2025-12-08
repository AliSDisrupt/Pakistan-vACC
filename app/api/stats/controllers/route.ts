import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Group = "day" | "week" | "month" | "quarter" | "year";
const allowed: Record<Group, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year"
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const groupBy = (url.searchParams.get("groupBy") as Group) || "month";
  const unit = allowed[groupBy] || "month";
  const from = url.searchParams.get("from") || "2020-01-01T00:00:00Z";
  const to = url.searchParams.get("to") || new Date().toISOString();
  const fir = url.searchParams.get("fir");

  const whereFir = fir ? `AND "fir" = '${fir.replace(/'/g, "")}'` : "";
  // Exclude ATIS sessions from all calculations
  const sql = `
    SELECT date_trunc('${unit}', "start") AS period,
           SUM(minutes)::float / 60.0 AS hours,
           COUNT(*) AS sessions,
           COUNT(DISTINCT callsign) AS unique_callsigns
    FROM "ControllerSession"
    WHERE "start" >= $1::timestamp AND "start" < $2::timestamp
      AND UPPER("callsign") NOT LIKE '%_ATIS'
    ${whereFir}
    GROUP BY 1
    ORDER BY 1;
  `;
  const rows = await prisma.$queryRawUnsafe<
    { period: Date; hours: number; sessions: bigint; unique_callsigns: bigint }[]
  >(sql, from, to);

  const result = rows.map((r) => ({
    period: r.period.toISOString(),
    hours: r.hours,
    sessions: Number(r.sessions),
    unique_callsigns: Number(r.unique_callsigns)
  }));

  return NextResponse.json(result);
}



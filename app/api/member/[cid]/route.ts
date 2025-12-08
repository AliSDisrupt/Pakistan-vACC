import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

interface VatsimMember {
  id: string;
  rating: number;
  pilotrating: number;
  militaryrating: number;
  susp_date: string | null;
  reg_date: string;
  region: string;
  division: string;
  subdivision: string;
  lastratingchange: string | null;
}

const RATING_NAMES: Record<number, string> = {
  "-1": "Inactive",
  0: "Suspended",
  1: "Observer (OBS)",
  2: "Student 1 (S1)",
  3: "Student 2 (S2)",
  4: "Student 3 (S3)",
  5: "Controller 1 (C1)",
  6: "Controller 2 (C2)",
  7: "Controller 3 (C3)",
  8: "Instructor 1 (I1)",
  9: "Instructor 2 (I2)",
  10: "Instructor 3 (I3)",
  11: "Supervisor (SUP)",
  12: "Administrator (ADM)",
};

const PILOT_RATING_NAMES: Record<number, string> = {
  0: "No Rating",
  1: "PPL",
  3: "IR",
  7: "CMEL",
  15: "ATPL",
};

const DIVISION_NAMES: Record<string, string> = {
  "WA": "West Asia (VATWA)",
  "MENA": "Middle East & North Africa",
  "USA": "United States",
  "EUR": "Europe",
  "PAC": "Pacific",
};

export async function GET(
  req: NextRequest,
  { params }: { params: { cid: string } }
) {
  const cid = params.cid;

  if (!cid || !/^\d+$/.test(cid)) {
    return NextResponse.json({ error: "Invalid CID" }, { status: 400 });
  }

  try {
    const { data } = await axios.get<VatsimMember>(
      `https://api.vatsim.net/api/ratings/${cid}/`,
      { timeout: 10000 }
    );

    const isPakistan = data.subdivision === "PAK" || data.division === "WA";

    return NextResponse.json({
      cid: data.id,
      rating: data.rating,
      ratingName: RATING_NAMES[data.rating] || `Rating ${data.rating}`,
      pilotRating: data.pilotrating,
      pilotRatingName: PILOT_RATING_NAMES[data.pilotrating] || `P${data.pilotrating}`,
      region: data.region,
      division: data.division,
      divisionName: DIVISION_NAMES[data.division] || data.division,
      subdivision: data.subdivision || "None",
      isPakistan,
      registrationDate: data.reg_date,
      lastRatingChange: data.lastratingchange,
      suspended: data.susp_date !== null,
    });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    console.error("Member lookup error:", error);
    return NextResponse.json(
      { error: "Failed to fetch member data" },
      { status: 500 }
    );
  }
}



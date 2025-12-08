import "dotenv/config";
import { loadRoster, saveRoster, fetchMemberInfo } from "../lib/roster";
import axios from "axios";

// Try to get last callsign from VATSIM Core API v2
async function getLastCallsign(cid: number): Promise<string | null> {
  try {
    const { data } = await axios.get(
      `https://api.vatsim.net/v2/atc/history?cid=${cid}&limit=1`,
      { timeout: 5000 }
    );
    if (data?.results && data.results.length > 0) {
      return data.results[0].callsign || null;
    }
  } catch (error) {
    // API might not be available or rate limited
  }
  return null;
}

async function main() {
  console.log("Loading roster...");
  const roster = loadRoster();
  const members = Object.values(roster.members);
  
  console.log(`Found ${members.length} members to update\n`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const member of members) {
    // Skip if already has complete info (not Unknown)
    if (member.ratingName !== "Unknown" && member.rating !== 0) {
      console.log(`⏭️  CID ${member.cid} already has info, skipping...`);
      skipped++;
      continue;
    }

    try {
      console.log(`📡 Fetching info for CID ${member.cid}...`);
      
      // Fetch member info
      const result = await fetchMemberInfo(member.cid);
      
      if (result.info) {
        // Update member info
        roster.members[member.cid] = {
          ...member,
          ...result.info,
          // Preserve existing data
          source: member.source,
          addedAt: member.addedAt,
          totalControllerMinutes: member.totalControllerMinutes || 0,
          totalPilotMinutes: member.totalPilotMinutes || 0,
          sessionsCount: member.sessionsCount || 0,
          lastCallsign: member.lastCallsign || null,
          lastSeen: member.lastSeen || null,
        };
        
        // Try to get last callsign
        const lastCallsign = await getLastCallsign(member.cid);
        if (lastCallsign) {
          roster.members[member.cid].lastCallsign = lastCallsign;
        }
        
        console.log(`✅ Updated CID ${member.cid} - ${result.info.ratingName}`);
        updated++;
      } else {
        // Mark as "Not Tracked" if we can't fetch
        if (!roster.members[member.cid].ratingName || roster.members[member.cid].ratingName === "Unknown") {
          // Keep as is, will be updated when they come online
          console.log(`⚠️  CID ${member.cid} - Could not fetch, will update when online`);
        }
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.log(`❌ Error updating CID ${member.cid}: ${error.message}`);
      failed++;
    }
  }

  // Save updated roster
  saveRoster(roster);

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📝 Total: ${members.length}`);
}

main().catch(console.error);


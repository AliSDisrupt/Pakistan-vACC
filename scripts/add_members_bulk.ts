import "dotenv/config";
import { addMemberToRoster, loadRoster } from "../lib/roster";

const cidsToAdd = [
  1542642, 1640978, 1307332, 1323685, 1542049, 1549083, 1593704, 1280308, 1390611, 1306312,
  1623745, 1735177, 1797446, 1514217, 1304916, 1644871, 1536974, 1561981, 1549035, 1288127,
  1361994, 1543984, 1213180, 1278388, 1499880, 1585429, 888835, 1733740, 1636844, 1457028,
  1386145, 1441064, 1828638, 1258042, 1448507, 1424752, 1835561, 1937611, 1559845, 1866029,
  1570139, 1432732, 1576117, 1720404, 1465400, 1887963, 1413750, 1685578, 1601155, 1208205,
  1816865, 1503241, 1496933, 964520, 1441652, 1597249, 1612239, 1732396, 1630620, 1400163,
  1303668, 1597400, 1676445, 1874841, 1432770, 1427130, 1943719, 1343436, 1496059, 1696501,
  1931046, 1431261, 1499863, 1497772, 1436020, 1486821, 1722085, 1476012, 1737223
];

async function main() {
  console.log("Loading current roster...");
  const roster = loadRoster();
  const existingCids = new Set(Object.keys(roster.members).map(Number));
  
  console.log(`Found ${existingCids.size} existing members in roster`);
  console.log(`Adding ${cidsToAdd.length} new members...\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const cid of cidsToAdd) {
    if (existingCids.has(cid)) {
      console.log(`⏭️  CID ${cid} already exists, skipping...`);
      skipped++;
      continue;
    }

    try {
      // Force add even if not in PAK subdivision
      const result = await addMemberToRoster(cid, "manual", true);
      if (result.success) {
        console.log(`✅ Added CID ${cid} - ${result.member?.ratingName || "Unknown"} (${result.member?.subdivision || "N/A"})`);
        added++;
      } else {
        console.log(`❌ Failed to add CID ${cid}: ${result.error}`);
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error: any) {
      console.log(`❌ Error adding CID ${cid}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Added: ${added}`);
  console.log(`   ⏭️  Skipped (already exists): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📝 Total processed: ${cidsToAdd.length}`);
}

main().catch(console.error);


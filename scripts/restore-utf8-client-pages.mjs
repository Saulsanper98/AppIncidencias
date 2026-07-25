import { execSync } from "node:child_process";
import fs from "node:fs";

const pairs = [
  [
    "src/app/(private)/tickets/[ticketId]/page.tsx",
    "src/app/(private)/tickets/[ticketId]/ticket-detail-page-client.tsx",
  ],
  [
    "src/app/(private)/dashboards/[dashboardId]/page.tsx",
    "src/app/(private)/dashboards/[dashboardId]/dashboard-detail-page-client.tsx",
  ],
];

for (const [gitPath, outPath] of pairs) {
  const content = execSync(`git show HEAD:"${gitPath}"`, { encoding: "utf8" });
  fs.writeFileSync(outPath, content, "utf8");
  console.log(`restored ${outPath} (${content.length} chars)`);
}

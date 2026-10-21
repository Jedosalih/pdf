// Dependency security gate for CI: fails on any high/critical advisory in
// a package's PRODUCTION dependencies, except advisories listed in
// security/audit-allowlist.json -- each with a written reason and an
// expiry date, after which it fails again and must be re-reviewed.
//
//   node scripts/audit-gate.mjs <package-dir> [<package-dir> ...]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const allowlist = JSON.parse(readFileSync(path.join(root, "security", "audit-allowlist.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);
let failed = false;

for (const dir of process.argv.slice(2)) {
  let output;
  try {
    output = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      cwd: path.resolve(root, dir),
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    output = error.stdout;
  }
  const report = JSON.parse(output);
  const blocking = [];
  for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== "object" || !["high", "critical"].includes(via.severity)) continue;
      const entry = allowlist.find((a) => a.package === dir && a.advisory === via.url);
      if (entry && entry.expires >= today) {
        console.log(`allowed  ${dir}: ${name} ${via.severity} ${via.url} (until ${entry.expires})`);
      } else {
        blocking.push(`${name} ${via.severity} ${via.url}${entry ? ` (allowlist entry EXPIRED ${entry.expires})` : ""}`);
      }
    }
  }
  if (blocking.length) {
    failed = true;
    console.log(`FAIL     ${dir}:\n  ${blocking.join("\n  ")}`);
  } else {
    console.log(`ok       ${dir}`);
  }
}
process.exit(failed ? 1 : 0);

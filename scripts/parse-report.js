// Puts the same passages from every parser output side by side in parsed/report.md,
// so you can judge them against the bake-off checklist.
// Usage: npm run parse:report
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "parsed");

// Each check: where to look (first line matching `find`) and how many lines to show
const CHECKS = [
  { name: "PED clause intact?", find: /48 months of continuous/i, before: 6, after: 2 },
  {
    name: "Claim documents list together?",
    find: /claim documents\s*\**\s*$/im,
    before: 0,
    after: 14,
  },
  { name: "Grace period clause", find: /grace period as/i, before: 2, after: 3 },
  { name: "Columns in reading order? (exclusions area)", find: /Excl01/, before: 4, after: 4 },
  { name: "Tables? (itemised list)", find: /ambulance collar/i, before: 4, after: 4 },
];

function stats(text) {
  const lines = text.split("\n");
  const count = (re) => lines.filter((l) => re.test(l)).length;
  return {
    chars: text.length,
    headings: count(/^#{1,6}\s/),
    "list items": count(/^\s*([-*]|\d+\.)\s/),
    "table rows": count(/^\s*\|/),
  };
}

function excerpt(text, { find, before, after }) {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => find.test(line));
  if (index === -1) return "(not found)";
  return lines
    .slice(Math.max(0, index - before), index + after + 1)
    .map((line) => (line.length > 160 ? `${line.slice(0, 160)}…` : line))
    .join("\n");
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".md") && f !== "report.md")
  .sort();
const outputs = Object.fromEntries(
  files.map((f) => [path.basename(f, ".md"), fs.readFileSync(path.join(DIR, f), "utf8")]),
);

let report = "# Parser bake-off report\n\n## Stats\n\n";
report += "| parser | chars | headings | list items | table rows |\n|---|---|---|---|---|\n";
for (const [name, text] of Object.entries(outputs)) {
  const s = stats(text);
  report += `| ${name} | ${s.chars} | ${s.headings} | ${s["list items"]} | ${s["table rows"]} |\n`;
}

for (const check of CHECKS) {
  report += `\n## ${check.name}\n`;
  for (const [name, text] of Object.entries(outputs)) {
    report += `\n### ${name}\n\n\`\`\`text\n${excerpt(text, check)}\n\`\`\`\n`;
  }
}

fs.writeFileSync(path.join(DIR, "report.md"), report);
console.log(`Wrote parsed/report.md (${Object.keys(outputs).join(", ")})`);

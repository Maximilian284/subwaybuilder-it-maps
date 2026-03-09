const fs = require("fs");
const path = require("path");

const scriptsDir = __dirname;
const inputPath = path.join(scriptsDir, "release-data.json");
const outputPath = path.join(scriptsDir, "release-notes.md");

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

let md = "";

md += `## ${data.title}\n\n`;

if (data.intro) {
  md += `${data.intro}\n\n`;
}

if (Array.isArray(data.cities) && data.cities.length > 0) {
  md += `| City | Code | Population | Map Version | Notes |\n`;
  md += `|------|------|------------|-------------|-------|\n`;

  for (const city of data.cities) {
    md += `| ${city.name} | ${city.code} | ${city.population} | ${city.version} | ${city.notes} |\n`;
  }

  md += `\n`;
}

if (Array.isArray(data.changelog) && data.changelog.length > 0) {
  md += `## Changelog\n\n`;

  for (const item of data.changelog) {
    md += `- ${item}\n`;
  }

  md += `\n`;
}

fs.writeFileSync(outputPath, md, "utf8");

console.log(`Generated ${outputPath}`);
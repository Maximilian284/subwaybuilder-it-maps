const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const REPO_SLUG = "Maximilian284/subwaybuilder-it-maps";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function zipDirectory(sourceDir, zipPath) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  const sourceAbs = path.resolve(sourceDir);
  const zipAbs = path.resolve(zipPath);

  execSync(
    `powershell -Command "Compress-Archive -Path '${sourceAbs}\\*' -DestinationPath '${zipAbs}'"`,
    { stdio: "inherit" }
  );
}

function generateReleaseNotes(scriptsDir) {
  execSync(`node "${path.join(scriptsDir, "generate-release-notes.js")}"`, {
    stdio: "inherit"
  });

  return path.join(scriptsDir, "release-notes.md");
}

function updateMapJson(
  releasesDir,
  cityCode,
  mapVersion,
  gameVersion,
  changelog,
  downloadUrl,
  sha256
) {
  const jsonPath = path.join(releasesDir, `${cityCode}.json`);

  const data = loadJson(jsonPath, {
    schema_version: 1,
    versions: []
  });

  const today = new Date().toISOString().slice(0, 10);

  const newEntry = {
    version: mapVersion,
    game_version: gameVersion,
    date: today,
    changelog,
    download: downloadUrl,
    sha256
  };

  data.versions = [
    newEntry,
    ...data.versions.filter(v => v.version !== mapVersion)
  ];

  saveJson(jsonPath, data);
}

function releaseExists(version) {
  try {
    execSync(`gh release view ${version}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function createOrUpdateGitHubRelease(version, notesPath, zipPaths) {
  if (!releaseExists(version)) {
    const assetArgs = zipPaths.map(p => `"${p}"`).join(" ");

    execSync(
      `gh release create ${version} ${assetArgs} --title "${version}" --notes-file "${notesPath}"`,
      { stdio: "inherit" }
    );
  } else {
    for (const zipPath of zipPaths) {
      execSync(`gh release upload ${version} "${zipPath}" --clobber`, {
        stdio: "inherit"
      });
    }
  }
}

function main() {

  const repoRoot = path.resolve(__dirname, "..");
  const scriptsDir = path.join(repoRoot, "scripts");
  const sourceDir = path.join(repoRoot, "source");
  const distDir = path.join(repoRoot, "dist");
  const releasesDir = path.join(repoRoot, "releases");

  const releaseDataPath = path.join(scriptsDir, "release-data.json");
  const releaseData = loadJson(releaseDataPath);

  if (!releaseData) {
    throw new Error(`Missing file: ${releaseDataPath}`);
  }

  const version = releaseData.version;
  const gameVersion = releaseData.gameVersion;
  const releaseCities = releaseData.releaseCities || [];
  const updatedCities = releaseData.updatedCities || [];
  const globalMapChangelog = releaseData.mapChangelog || "";

  if (!version) {
    throw new Error("release-data.json: missing 'version'");
  }

  if (!gameVersion) {
    throw new Error("release-data.json: missing 'gameVersion'");
  }

  ensureDir(distDir);
  ensureDir(releasesDir);

  /*
  ----------------------------------------------------
  Creazione indice città per accesso veloce
  ----------------------------------------------------
  */

  const citiesIndex = {};

  for (const city of releaseData.cities || []) {
    citiesIndex[city.code] = city;
  }

  /*
  ----------------------------------------------------
  Creazione ZIP delle mappe
  ----------------------------------------------------
  */

  const zipPaths = [];

  for (const cityCode of releaseCities) {

    const citySourceDir = path.join(sourceDir, cityCode);
    const zipPath = path.join(distDir, `${cityCode}.zip`);

    zipDirectory(citySourceDir, zipPath);

    zipPaths.push(zipPath);

    console.log(`Created ${zipPath}`);
  }

  /*
  ----------------------------------------------------
  Generazione release notes
  ----------------------------------------------------
  */

  const notesPath = generateReleaseNotes(scriptsDir);

  /*
  ----------------------------------------------------
  Creazione o aggiornamento release GitHub
  ----------------------------------------------------
  */

  createOrUpdateGitHubRelease(version, notesPath, zipPaths);

  /*
  ----------------------------------------------------
  Aggiornamento JSON delle mappe
  ----------------------------------------------------
  */

  for (const cityCode of updatedCities) {

    const cityData = citiesIndex[cityCode];

    if (!cityData) {
      throw new Error(`City ${cityCode} not defined in release-data.json`);
    }

    const mapVersion = cityData.version;

    const cityChangelog =
      cityData.mapChangelog && cityData.mapChangelog.trim() !== ""
        ? cityData.mapChangelog
        : globalMapChangelog;

    const zipPath = path.join(distDir, `${cityCode}.zip`);

    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP not found for updated city ${cityCode}: ${zipPath}`);
    }

    const sha256 = sha256File(zipPath);

    const downloadUrl =
      `https://github.com/${REPO_SLUG}/releases/download/${version}/${cityCode}.zip`;

    updateMapJson(
      releasesDir,
      cityCode,
      mapVersion,
      gameVersion,
      cityChangelog,
      downloadUrl,
      sha256
    );

    console.log(`Updated releases/${cityCode}.json`);
  }

  console.log("");
  console.log("Done.");
  console.log("Now run:");
  console.log("  git add .");
  console.log(`  git commit -m "Release ${version}"`);
  console.log("  git push");
}

main();
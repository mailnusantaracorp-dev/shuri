import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../game js/game/data.js", import.meta.url));
const outputPath = fileURLToPath(new URL("../assets/json/game_data.json", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { AREA_DATA, SKINS, SHEET_KEYS } = await import(moduleUrl);

await writeFile(
  outputPath,
  `${JSON.stringify({ areas: AREA_DATA, skins: SKINS, sheetKeys: SHEET_KEYS }, null, 2)}\n`,
  "utf8",
);

console.log(`Exported ${AREA_DATA.length} areas and ${SHEET_KEYS.length} sprite sheets to ${outputPath}`);

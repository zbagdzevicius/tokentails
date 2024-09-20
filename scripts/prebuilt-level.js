const fs = require("fs");
const path = require("path");

const blockedDir = "../public/purrquest2/levels/blocked";
const exitDir = "../public/purrquest2/levels/exit";
const spawnDir = "../public/purrquest2/levels/spawn";
const withoutDir = "../public/purrquest2/levels/without";
const outputDir = "../components/purrquest/prebuiltRooms";
const outputBlockedFileName = "PrebuiltRooms.ts";
const outputExitFileName = "ExitRoom.ts";
const outputSpawnFileName = "SpawnRoom.ts";
const outputWithoutFileName = "PrebuiltRoomsWithoutWalls.ts";

const defaultSecondLayer = [
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
  "0,0,0,0,0,0,0,0,0,0",
];

// Function to read, process, and write data for a given directory
function processDirectory(
  inputDir,
  outputFileName,
  exportName,
  asObject = false
) {
  const outputObjects = asObject ? {} : [];

  const files = fs.readdirSync(inputDir);

  files.forEach((file) => {
    const filePath = path.join(inputDir, file);
    const data = fs.readFileSync(filePath, "utf8");

    try {
      const tiledMap = JSON.parse(data);
      const roomLayer = tiledMap.layers[0].data;

      let secondLayer;
      if (tiledMap.layers[1] && tiledMap.layers[1].data) {
        secondLayer = formatArray(tiledMap.layers[1].data);
      } else {
        secondLayer = defaultSecondLayer;
      }

      const formattedRoomLayer = formatArray(roomLayer);

      if (asObject) {
        outputObjects.layers = [formattedRoomLayer, secondLayer];
      } else {
        outputObjects.push({ layers: [formattedRoomLayer, secondLayer] });
      }
    } catch (parseError) {
      console.error("Error parsing JSON from file:", file, parseError);
    }
  });

  writeFormattedDataToFile(outputObjects, outputFileName, exportName);
}

// Function to format the array data (flattening structure)
function formatArray(arr) {
  const chunkSize = 10;
  const result = [];

  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize).join(",");
    result.push(chunk);
  }

  return result;
}

// Function to write formatted data to a specified file
function writeFormattedDataToFile(data, outputFileName, exportName) {
  const filePath = path.join(outputDir, outputFileName);
  const formattedData = `export const ${exportName} = ${JSON.stringify(data)};`;

  fs.writeFile(filePath, formattedData, (err) => {
    if (err) {
      console.error("Error writing to file:", err);
      return;
    }
    console.log(`Formatted data has been written to ${filePath}`);
  });
}

processDirectory(blockedDir, outputBlockedFileName, "prebuiltRooms");
processDirectory(exitDir, outputExitFileName, "exitRoom", true); // Use object format
processDirectory(spawnDir, outputSpawnFileName, "spawnRoom", true); // Use object format
processDirectory(
  withoutDir,
  outputWithoutFileName,
  "prebuiltRoomsWithoutWalls"
);

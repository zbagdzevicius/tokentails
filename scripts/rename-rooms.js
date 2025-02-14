const fs = require("fs");
const path = require("path");

const blockedDir = "../public/purrquest2/levels/spawn";
const outputDir = "../public/purrquest2/levels/spawn";

function updateImageInJSON(inputDir) {
  const files = fs.readdirSync(inputDir);

  files.forEach((file) => {
    const filePath = path.join(inputDir, file);
    const data = fs.readFileSync(filePath, "utf8");
    const parsedData = JSON.parse(data);

    // Ensure parsedData has the expected structure before modifying
    if (parsedData.tilesets && parsedData.tilesets[0]) {
      parsedData.tilesets[0].image = "../../../base/winter-packed.png";

      const outputFilePath = path.join(outputDir, file);
      fs.writeFileSync(
        outputFilePath,
        JSON.stringify(parsedData, null, 2),
        "utf8"
      );
      console.log(`Updated image path in: ${outputFilePath}`);
    } else {
      console.log(`Skipping file with unexpected structure: ${file}`);
    }
  });
}

updateImageInJSON(blockedDir);

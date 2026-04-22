const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

/**
 * Bulk image resizing script
 *
 * Usage:
 *   node resize.js [options]
 *
 * Options:
 *   --width <number>     Target width (maintains aspect ratio if height not specified)
 *   --height <number>    Target height (maintains aspect ratio if width not specified)
 *   --quality <number>   WebP quality (1-100, default: 80)
 *   --input <path>       Input directory (default: current directory)
 *   --output <path>      Output directory (default: current directory)
 *   --format <string>    Output format: webp, png, jpeg (default: webp)
 *   --overwrite          Overwrite existing files (default: false, creates new files)
 *   --suffix <string>    Suffix for output files when not overwriting (default: _resized)
 */

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  width: null,
  height: null,
  quality: 80,
  inputDir: __dirname,
  outputDir: __dirname,
  format: "webp",
  overwrite: false,
  suffix: "_resized",
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--width":
      options.width = parseInt(args[++i]);
      break;
    case "--height":
      options.height = parseInt(args[++i]);
      break;
    case "--quality":
      options.quality = parseInt(args[++i]);
      break;
    case "--input":
      options.inputDir = args[++i];
      break;
    case "--output":
      options.outputDir = args[++i];
      break;
    case "--format":
      options.format = args[++i].toLowerCase();
      break;
    case "--overwrite":
      options.overwrite = true;
      break;
    case "--suffix":
      const val = args[++i];
      options.suffix = val || "";
      break;
    case "--help":
      console.log(`
Bulk Image Resizer

Usage:
  node resize.js [options]

Options:
  --width <number>     Target width in pixels (maintains aspect ratio if height not specified)
  --height <number>    Target height in pixels (maintains aspect ratio if width not specified)
  --quality <number>   Image quality 1-100 (default: 80)
  --input <path>       Input directory path (default: current directory)
  --output <path>      Output directory path (default: current directory)
  --format <string>    Output format: webp, png, jpeg (default: webp)
  --overwrite          Overwrite existing files (default: false)
  --suffix <string>    Suffix for output files when not overwriting (default: _resized)
  --help               Show this help message

Examples:
  # Resize all images to 256px width (maintains aspect ratio)
  node resize.js --width 256

  # Resize to 128x128 (may crop/distort)
  node resize.js --width 128 --height 128

  # Resize with custom quality and output directory
  node resize.js --width 512 --quality 90 --output ./resized

  # Resize and overwrite original files
  node resize.js --width 256 --overwrite
      `);
      process.exit(0);
  }
}

// Validate options
if (!options.width && !options.height) {
  console.error("Error: At least --width or --height must be specified");
  console.log('Run "node resize.js --help" for usage information');
  process.exit(1);
}

if (options.quality < 1 || options.quality > 100) {
  console.error("Error: Quality must be between 1 and 100");
  process.exit(1);
}

if (!["webp", "png", "jpeg"].includes(options.format)) {
  console.error("Error: Format must be one of: webp, png, jpeg");
  process.exit(1);
}

// Supported image extensions
const supportedExtensions = [".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg"];

/**
 * Get all image files from a directory
 */
function getImageFiles(dir) {
  const files = fs.readdirSync(dir);
  return files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return supportedExtensions.includes(ext) && file !== "resize.js";
  });
}

/**
 * Resize a single image
 */
async function resizeImage(inputPath, outputPath, options) {
  try {
    let sharpInstance = sharp(inputPath);

    // Resize options
    const resizeOptions = {};
    if (options.width && options.height) {
      resizeOptions.width = options.width;
      resizeOptions.height = options.height;
      resizeOptions.fit = "cover"; // or 'contain', 'fill', 'inside', 'outside'
    } else if (options.width) {
      resizeOptions.width = options.width;
    } else if (options.height) {
      resizeOptions.height = options.height;
    }

    sharpInstance = sharpInstance.resize(resizeOptions);

    // Format-specific options
    const formatOptions = {};
    if (options.format === "webp") {
      formatOptions.quality = options.quality;
    } else if (options.format === "jpeg") {
      formatOptions.quality = options.quality;
    } else if (options.format === "png") {
      formatOptions.compressionLevel = 9;
    }

    await sharpInstance
      .toFormat(options.format, formatOptions)
      .toFile(outputPath);

    return { success: true, inputPath, outputPath };
  } catch (error) {
    return { success: false, inputPath, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  console.log("Starting bulk image resize...");
  console.log("Options:", JSON.stringify(options, null, 2));
  console.log("");

  // Ensure output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  // Get all image files
  const imageFiles = getImageFiles(options.inputDir);

  if (imageFiles.length === 0) {
    console.log("No image files found in", options.inputDir);
    return;
  }

  console.log(`Found ${imageFiles.length} image file(s) to process\n`);

  // Process images
  const results = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const inputPath = path.join(options.inputDir, file);

    // Determine output filename
    let outputFilename;
    if (options.overwrite) {
      const ext = path.extname(file);
      outputFilename = path.basename(file, ext) + "." + options.format;
    } else {
      const ext = path.extname(file);
      outputFilename =
        path.basename(file, ext) + options.suffix + "." + options.format;
    }
    const outputPath = path.join(options.outputDir, outputFilename);

    // If input and output paths are the same, backup the original file first
    const resolvedInputPath = path.resolve(inputPath);
    const resolvedOutputPath = path.resolve(outputPath);
    let actualInputPath = inputPath; // Track the actual input path to use

    if (resolvedInputPath === resolvedOutputPath && fs.existsSync(outputPath)) {
      const ext = path.extname(outputPath);
      const backupPath = path.join(
        path.dirname(outputPath),
        path.basename(outputPath, ext) + "_original" + ext
      );

      // If backup already exists, add a number suffix
      let finalBackupPath = backupPath;
      let counter = 1;
      while (fs.existsSync(finalBackupPath)) {
        finalBackupPath = path.join(
          path.dirname(outputPath),
          path.basename(outputPath, ext) + `_original_${counter}` + ext
        );
        counter++;
      }

      fs.renameSync(outputPath, finalBackupPath);
      // Update input path to point to the renamed file
      actualInputPath = finalBackupPath;
      console.log(
        `\n  → Backed up original to: ${path.basename(finalBackupPath)}`
      );
    }

    process.stdout.write(
      `[${i + 1}/${imageFiles.length}] Processing ${file}... `
    );

    const result = await resizeImage(actualInputPath, outputPath, options);
    results.push(result);

    if (result.success) {
      console.log("✓");
    } else {
      console.log("✗ Error:", result.error);
    }
  }

  // Summary
  console.log("\n--- Summary ---");
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Successfully processed: ${successful}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed files:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${path.basename(r.inputPath)}: ${r.error}`);
      });
  }
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FILE = 'C:\\Users\\ernes\\Desktop\\tokentails-cats\\cats\\public\\catnip-chaos\\levels\\level-81.json';
const OUTPUT_FILE = 'C:\\Users\\ernes\\Desktop\\tokentails-cats\\cats\\public\\catnip-chaos\\levels\\level-81-modified-1.json';
const VALUES_TO_REPLACE = [1058, 1059, 1088, 1089, 1148, 1149, 1178, 1179, 1208, 1209, 1238, 1239,1118, 1119];
const REPLACEMENT_VALUE = 159;

/**
 * Processes all layers and their chunks to find and replace tile values
 * @param {Object} tilemap - The tilemap object
 * @returns {number} - Total number of replacements made
 */
function processTilemap(tilemap) {
    let totalReplacements = 0;
    
    if (!tilemap.layers || !Array.isArray(tilemap.layers)) {
        console.log('No layers found in tilemap');
        return 0;
    }
    
    console.log(`Found ${tilemap.layers.length} layers to process:`);
    
    tilemap.layers.forEach((layer, layerIndex) => {
        console.log(`\nProcessing layer ${layerIndex + 1}: "${layer.name}" (id: ${layer.id})`);
        
        if (!layer.chunks || !Array.isArray(layer.chunks)) {
            console.log(`  No chunks in layer "${layer.name}"`);
            return;
        }
        
        console.log(`  Found ${layer.chunks.length} chunks`);
        
        layer.chunks.forEach((chunk, chunkIndex) => {
            if (!chunk.data || !Array.isArray(chunk.data)) {
                console.log(`    Chunk ${chunkIndex + 1}: No data array`);
                return;
            }
            
            console.log(`    Chunk ${chunkIndex + 1}: Processing ${chunk.data.length} tiles (${chunk.width}x${chunk.height}) at position (${chunk.x}, ${chunk.y})`);
            
            // Check if this chunk contains any of our target values
            const foundValues = new Set();
            chunk.data.forEach(value => {
                if (VALUES_TO_REPLACE.includes(Number(value))) {
                    foundValues.add(Number(value));
                }
            });
            
            if (foundValues.size > 0) {
                console.log(`      *** Found target values: ${Array.from(foundValues).join(', ')} ***`);
                const replacements = replaceValuesInData(chunk.data, chunkIndex + 1);
                totalReplacements += replacements;
            } else {
                console.log(`      No target values found in this chunk`);
            }
        });
    });
    
    return totalReplacements;
}

/**
 * Replaces specified values in a data array
 * @param {Array} data - The tile data array to process
 * @param {number} chunkNum - Chunk number for logging
 * @returns {number} - Number of replacements made
 */
function replaceValuesInData(data, chunkNum) {
    let count = 0;
    
    for (let i = 0; i < data.length; i++) {
        const numValue = Number(data[i]);
        if (VALUES_TO_REPLACE.includes(numValue)) {
            console.log(`        Replacing tile ${data[i]} with ${REPLACEMENT_VALUE} at index ${i} (chunk ${chunkNum})`);
            data[i] = REPLACEMENT_VALUE;
            count++;
        }
    }
    
    console.log(`      Made ${count} replacements in chunk ${chunkNum}`);
    return count;
}

/**
 * Main function to process the tilemap
 */
function processLevel() {
    try {
        // Check if input file exists
        if (!fs.existsSync(INPUT_FILE)) {
            console.error(`Error: Input file '${INPUT_FILE}' not found!`);
            console.log('Please make sure the level file exists and update the INPUT_FILE path in the script.');
            return;
        }

        console.log(`Reading level from: ${INPUT_FILE}`);
        
        // Read the tilemap file
        const tilemapData = fs.readFileSync(INPUT_FILE, 'utf8');
        const tilemap = JSON.parse(tilemapData);
        
        console.log('Level loaded successfully!');
        console.log(`Tilemap size: ${tilemap.width}x${tilemap.height}`);
        console.log(`Tile size: ${tilemap.tilewidth}x${tilemap.tileheight}`);
        console.log(`Looking for tile values: ${VALUES_TO_REPLACE.join(', ')}`);
        console.log(`Will replace them with: ${REPLACEMENT_VALUE}`);
        console.log('=====================================');
        
        // Process the tilemap
        const totalReplacements = processTilemap(tilemap);
        
        console.log('\n=====================================');
        console.log(`SUMMARY: Total replacements made: ${totalReplacements}`);
        
        if (totalReplacements > 0) {
            // Write the modified tilemap
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tilemap, null, 1));
            console.log(`Modified level saved to: ${OUTPUT_FILE}`);
            console.log('\nYou can now:');
            console.log('1. Review the changes in the modified file');
            console.log('2. Replace the original file if everything looks good');
            console.log('3. Or adjust the script and run again');
        } else {
            console.log('No tile values were replaced. Original file unchanged.');
            console.log('\nPossible reasons:');
            console.log('- The values you\'re looking for don\'t exist in this level');
            console.log('- The values might be different than expected');
            console.log('- Check if you have the correct level file');
        }
        
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error('Error: Invalid JSON in level file!');
            console.error(error.message);
        } else {
            console.error('Error processing level:', error.message);
        }
    }
}

// Run the script
console.log('Tokentails Cats - Level Tile Replacer');
console.log('====================================');
processLevel();
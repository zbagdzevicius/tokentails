const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FILE = 'C:\\Users\\ernes\\Desktop\\tokentails-cats\\cats\\public\\catnip-chaos\\levels\\level-81.json';
const TARGET_VALUE = 248; // The tile value to count

/**
 * Counts occurrences of target value specifically in catnip layer
 * @param {Object} tilemap - The tilemap object
 * @returns {Object} - Detailed count information
 */
function countCatnipTiles(tilemap) {
    const results = {
        catnipTotal: 0,
        catnipChunks: {},
        positions: []
    };
    
    if (!tilemap.layers || !Array.isArray(tilemap.layers)) {
        console.log('No layers found in tilemap');
        return results;
    }
    
    // Find the catnip layer
    const catnipLayer = tilemap.layers.find(layer => layer.name === 'catnip');
    
    if (!catnipLayer) {
        console.log('❌ No "catnip" layer found in tilemap');
        return results;
    }
    
    console.log(`🐱 Found catnip layer (id: ${catnipLayer.id})`);
    console.log(`🔍 Scanning for tile value ${TARGET_VALUE} in catnip chunks...`);
    console.log('='.repeat(60));
    
    if (!catnipLayer.chunks || !Array.isArray(catnipLayer.chunks)) {
        console.log('❌ No chunks in catnip layer');
        return results;
    }
    
    console.log(`📦 Found ${catnipLayer.chunks.length} chunks in catnip layer`);
    
    if (catnipLayer.chunks.length === 0) {
        console.log('⚠️  Catnip layer has no chunks (empty layer)');
        return results;
    }
    
    catnipLayer.chunks.forEach((chunk, chunkIndex) => {
        if (!chunk.data || !Array.isArray(chunk.data)) {
            console.log(`   Chunk ${chunkIndex + 1}: No data array`);
            return;
        }
        
        let chunkCount = 0;
        const chunkPositions = [];
        
        console.log(`\n📍 Chunk ${chunkIndex + 1}: Scanning ${chunk.data.length} tiles (${chunk.width}x${chunk.height}) at world position (${chunk.x}, ${chunk.y})`);
        
        // Count tiles in this chunk
        chunk.data.forEach((value, tileIndex) => {
            if (Number(value) === TARGET_VALUE) {
                chunkCount++;
                
                // Calculate world position
                const localX = tileIndex % chunk.width;
                const localY = Math.floor(tileIndex / chunk.width);
                const worldX = chunk.x + localX;
                const worldY = chunk.y + localY;
                
                const position = {
                    chunk: chunkIndex + 1,
                    localIndex: tileIndex,
                    localPos: { x: localX, y: localY },
                    worldPos: { x: worldX, y: worldY }
                };
                
                chunkPositions.push(position);
                results.positions.push(position);
                
                console.log(`   ✅ Found tile ${TARGET_VALUE} at world (${worldX}, ${worldY})`);
            }
        });
        
        results.catnipChunks[chunkIndex + 1] = {
            count: chunkCount,
            positions: chunkPositions
        };
        
        console.log(`   📊 Chunk ${chunkIndex + 1} total: ${chunkCount} tiles`);
        results.catnipTotal += chunkCount;
    });
    
    return results;
}

/**
 * Displays catnip-specific results
 * @param {Object} results - Count results
 */
function displayCatnipResults(results) {
    console.log('\n' + '='.repeat(60));
    console.log('🐱 CATNIP LAYER RESULTS');
    console.log('='.repeat(60));
    
    console.log(`🎯 TOTAL CATNIP TILES (${TARGET_VALUE}): ${results.catnipTotal}`);
    
    if (results.catnipTotal === 0) {
        console.log(`\n❌ No tiles with value ${TARGET_VALUE} found in catnip layer.`);
        console.log('   This could mean:');
        console.log('   - No catnip collectibles placed yet');
        console.log('   - Catnip uses a different tile value');
        console.log('   - Catnip layer is empty');
        return;
    }
    
    console.log(`\n📦 Breakdown by Chunks:`);
    Object.entries(results.catnipChunks).forEach(([chunkNum, chunkData]) => {
        if (chunkData.count > 0) {
            console.log(`   Chunk ${chunkNum}: ${chunkData.count} tiles`);
        }
    });
    
    console.log(`\n📍 All Catnip Positions:`);
    results.positions.forEach((pos, index) => {
        console.log(`   ${index + 1}. World pos (${pos.worldPos.x}, ${pos.worldPos.y}) - Chunk ${pos.chunk}`);
    });
    
    // Show big summary
    console.log('\n' + '🟢'.repeat(20));
    console.log(`🏆 FINAL ANSWER: ${results.catnipTotal} catnip tiles found!`);
    console.log('🟢'.repeat(20));
    

}

/**
 * Main function to count tiles
 */
function countLevel() {
    try {
        // Check if input file exists
        if (!fs.existsSync(INPUT_FILE)) {
            console.error(`❌ Error: Input file '${INPUT_FILE}' not found!`);
            console.log('Please make sure the level file exists and update the INPUT_FILE path in the script.');
            return;
        }

        console.log(`📂 Reading level from: ${INPUT_FILE}`);
        
        // Read the tilemap file
        const tilemapData = fs.readFileSync(INPUT_FILE, 'utf8');
        const tilemap = JSON.parse(tilemapData);
        
        console.log('✅ Level loaded successfully!');
        console.log(`📏 Tilemap size: ${tilemap.width}x${tilemap.height}`);
        console.log(`🔍 Searching for tile value: ${TARGET_VALUE}`);
        
        // Count the catnip tiles
        const results = countCatnipTiles(tilemap);
        
        // Display results
        displayCatnipResults(results);
        
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error('❌ Error: Invalid JSON in level file!');
            console.error(error.message);
        } else {
            console.error('❌ Error processing level:', error.message);
        }
    }
}

// Run the script
console.log('🐱 Tokentails Cats - Catnip Counter');
console.log('🔍 Counting catnip tiles (value ' + TARGET_VALUE + ')');
console.log('='.repeat(60));
countLevel();
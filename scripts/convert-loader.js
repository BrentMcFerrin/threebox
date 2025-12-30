/**
 * Script to convert Three.js ES module loaders to CommonJS format for Threebox
 * Usage: node convert-loader.js <input-file> <output-file>
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
    console.error('Usage: node convert-loader.js <input-file> <output-file>');
    process.exit(1);
}

let content = fs.readFileSync(inputFile, 'utf8');

// Extract the class name from export statement
const exportMatch = content.match(/export\s*\{\s*(\w+)\s*\}/);
const className = exportMatch ? exportMatch[1] : null;

if (!className) {
    console.error('Could not find export statement');
    process.exit(1);
}

console.log(`Converting ${className}...`);

// Collect all imported names from 'three'
const threeImports = [];
const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]three['"]/g;
let match;
while ((match = importRegex.exec(content)) !== null) {
    const imports = match[1].split(',').map(s => s.trim()).filter(s => s);
    threeImports.push(...imports);
}

// Remove all import statements from 'three'
content = content.replace(/import\s*\{[^}]+\}\s*from\s*['"]three['"];?\n?/g, '');

// Handle BufferGeometryUtils import - we'll inline toTrianglesDrawMode
const bufferGeomUtilsMatch = content.match(/import\s*\{\s*toTrianglesDrawMode\s*\}\s*from\s*['"]\.\.\/utils\/BufferGeometryUtils\.js['"];?/);
if (bufferGeomUtilsMatch) {
    content = content.replace(bufferGeomUtilsMatch[0], '');
    // We'll add toTrianglesDrawMode function inline later
}

// Handle fflate import for FBXLoader
content = content.replace(
    /import\s*\*\s*as\s*fflate\s*from\s*['"]\.\.\/libs\/fflate\.module\.js['"];?\n?/g,
    "const fflate = require('../fflate.min.js');\n"
);

// Handle NURBSCurve import for FBXLoader
content = content.replace(
    /import\s*\{\s*NURBSCurve\s*\}\s*from\s*['"]\.\.\/curves\/NURBSCurve\.js['"];?\n?/g,
    '' // Remove - will need to handle separately if used
);

// Handle TGALoader import for ColladaLoader
content = content.replace(
    /import\s*\{\s*TGALoader\s*\}\s*from\s*['"][^'"]+TGALoader\.js['"];?\n?/g,
    '' // Remove - ColladaLoader will work without TGA support
);

// Remove any remaining import statements (catch-all)
content = content.replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?\n?/g, '');

// Replace all bare imported names with THREE.Name
threeImports.forEach(name => {
    // Only replace whole word matches, not partial matches
    const regex = new RegExp(`(?<![\\w.])${name}(?![\\w])`, 'g');
    content = content.replace(regex, `THREE.${name}`);
});

// Remove export statement
content = content.replace(/export\s*\{\s*\w+\s*\};?\s*$/, '');

// Add CommonJS require at the top
const header = `const THREE = require('../../three.js');

`;

// Add CommonJS export at the bottom
const footer = `
THREE.${className} = ${className};
module.exports = exports = ${className};
`;

// Add toTrianglesDrawMode function if needed (for GLTFLoader)
let toTrianglesDrawModeFunc = '';
if (bufferGeomUtilsMatch) {
    toTrianglesDrawModeFunc = `
// Inlined from BufferGeometryUtils.js
function toTrianglesDrawMode( geometry, drawMode ) {

    if ( drawMode === THREE.TrianglesDrawMode ) {

        console.warn( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.' );
        return geometry;

    }

    if ( drawMode === THREE.TriangleFanDrawMode || drawMode === THREE.TriangleStripDrawMode ) {

        let index = geometry.getIndex();

        if ( index === null ) {

            const indices = [];

            const position = geometry.getAttribute( 'position' );

            if ( position !== undefined ) {

                for ( let i = 0; i < position.count; i ++ ) {

                    indices.push( i );

                }

                geometry.setIndex( indices );
                index = geometry.getIndex();

            } else {

                console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.' );
                return geometry;

            }

        }

        const numberOfTriangles = index.count - 2;
        const newIndices = [];

        if ( drawMode === THREE.TriangleFanDrawMode ) {

            for ( let i = 1; i <= numberOfTriangles; i ++ ) {

                newIndices.push( index.getX( 0 ) );
                newIndices.push( index.getX( i ) );
                newIndices.push( index.getX( i + 1 ) );

            }

        } else {

            for ( let i = 0; i < numberOfTriangles; i ++ ) {

                if ( i % 2 === 0 ) {

                    newIndices.push( index.getX( i ) );
                    newIndices.push( index.getX( i + 1 ) );
                    newIndices.push( index.getX( i + 2 ) );

                } else {

                    newIndices.push( index.getX( i + 2 ) );
                    newIndices.push( index.getX( i + 1 ) );
                    newIndices.push( index.getX( i ) );

                }

            }

        }

        if ( ( newIndices.length / 3 ) !== numberOfTriangles ) {

            console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

        }

        const newGeometry = geometry.clone();
        newGeometry.setIndex( newIndices );

        return newGeometry;

    } else {

        console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
        return geometry;

    }

}

`;
}

content = header + toTrianglesDrawModeFunc + content + footer;

fs.writeFileSync(outputFile, content);
console.log(`Converted ${className} -> ${outputFile}`);

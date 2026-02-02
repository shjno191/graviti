import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceIcon = 'C:/Users/09204113161/.gemini/antigravity/brain/765b926d-1dfe-4245-936f-bbed495c1d1b/sql_icon_1024_1770004458267.png';
const iconsDir = path.join(__dirname, 'src-tauri', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 }
];

async function generateIcons() {
    console.log('🎨 Generating icons...');

    // Generate PNG icons
    for (const { name, size } of sizes) {
        const outputPath = path.join(iconsDir, name);
        await sharp(sourceIcon)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .png()
            .toFile(outputPath);
        console.log(`✓ Created ${name} (${size}x${size})`);
    }

    // Generate ICO file (Windows) using png-to-ico
    console.log('🪟 Generating Windows ICO...');
    const tempIcoPath = path.join(iconsDir, 'temp-256.png');
    await sharp(sourceIcon)
        .resize(256, 256)
        .png()
        .toFile(tempIcoPath);

    const icoBuffer = await pngToIco(tempIcoPath);
    const icoPath = path.join(iconsDir, 'icon.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    fs.unlinkSync(tempIcoPath); // Clean up temp file
    console.log(`✓ Created icon.ico`);

    // For macOS ICNS, create a 1024x1024 PNG
    console.log('🍎 Generating macOS icon base...');
    const icnsPath = path.join(iconsDir, 'icon.icns');
    await sharp(sourceIcon)
        .resize(1024, 1024)
        .png()
        .toFile(icnsPath);
    console.log(`✓ Created icon.icns (as 1024x1024 PNG)`);

    console.log('✅ All icons generated successfully!');
}

generateIcons().catch(err => {
    console.error('❌ Error generating icons:', err);
    process.exit(1);
});

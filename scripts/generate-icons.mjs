import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = process.cwd();
const iconsDir = path.join(root, 'public', 'icons');

const appIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bgCore" cx="35%" cy="25%" r="85%">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="55%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="48%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <filter id="drop" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect width="512" height="512" rx="112" fill="url(#bgCore)"/>
  <rect x="86" y="76" width="340" height="12" rx="6" fill="url(#accent)" opacity="0.9"/>
  <rect x="86" y="398" width="340" height="12" rx="6" fill="url(#accent)" opacity="0.65"/>
  <g filter="url(#drop)">
    <text x="256" y="246" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="150" font-weight="900" letter-spacing="4" fill="#f8fafc" stroke="#020617" stroke-width="12" paint-order="stroke fill">SN</text>
    <text x="256" y="326" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="4" fill="#e0f2fe">SOMOS NOCHE</text>
    <text x="256" y="366" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="7" fill="#fbbf24">TRANSPORTE</text>
  </g>
</svg>`;

const installerSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg2" cx="30%" cy="22%" r="90%">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="70%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fcd34d"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="boxLeft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>
    <linearGradient id="boxRight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d97706"/>
      <stop offset="100%" stop-color="#92400e"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="112" fill="url(#bg2)"/>
  <circle cx="256" cy="256" r="212" fill="none" stroke="#cbd5e1" stroke-width="10" opacity="0.75"/>

  <path d="M92 194l164-76 164 76-164 80-164-80z" fill="url(#boxTop)"/>
  <path d="M92 194v146l164 82V274L92 194z" fill="url(#boxLeft)"/>
  <path d="M420 194v146l-164 82V274l164-80z" fill="url(#boxRight)"/>

  <rect x="206" y="214" width="100" height="50" rx="12" fill="#111827"/>
  <rect x="218" y="223" width="76" height="20" rx="7" fill="#93c5fd"/>
  <circle cx="230" cy="251" r="8" fill="#030712"/>
  <circle cx="282" cy="251" r="8" fill="#030712"/>

  <text x="256" y="454" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="1.3" fill="#f8fafc">SETUP</text>
</svg>`;

async function main() {
  await fs.mkdir(iconsDir, { recursive: true });

  const svg512Path = path.join(iconsDir, 'icon-512.svg');
  const svg192Path = path.join(iconsDir, 'icon-192.svg');
  const png512Path = path.join(iconsDir, 'icon-512.png');
  const png192Path = path.join(iconsDir, 'icon-192.png');
  const icoPath = path.join(iconsDir, 'icon.ico');
  const installerIcoPath = path.join(iconsDir, 'installer.ico');

  await fs.writeFile(svg512Path, appIconSvg, 'utf8');
  await fs.writeFile(svg192Path, appIconSvg.replace('width="512" height="512"', 'width="192" height="192"'), 'utf8');

  const svgBuffer = Buffer.from(appIconSvg, 'utf8');
  await sharp(svgBuffer).resize(512, 512).png().toFile(png512Path);
  await sharp(svgBuffer).resize(192, 192).png().toFile(png192Path);

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoSources = [];
  for (const size of icoSizes) {
    const icoPngPath = path.join(iconsDir, `icon-${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(icoPngPath);
    icoSources.push(icoPngPath);
  }

  const icoBuffer = await pngToIco(icoSources);
  await fs.writeFile(icoPath, icoBuffer);

  const installerBuffer = Buffer.from(installerSvg, 'utf8');
  const installerSources = [];
  for (const size of icoSizes) {
    const installerPngPath = path.join(iconsDir, `installer-${size}.png`);
    await sharp(installerBuffer).resize(size, size).png().toFile(installerPngPath);
    installerSources.push(installerPngPath);
  }
  const installerIcoBuffer = await pngToIco(installerSources);
  await fs.writeFile(installerIcoPath, installerIcoBuffer);

  console.log('Iconos generados:');
  console.log(`- ${path.relative(root, svg512Path)}`);
  console.log(`- ${path.relative(root, svg192Path)}`);
  console.log(`- ${path.relative(root, png512Path)}`);
  console.log(`- ${path.relative(root, png192Path)}`);
  console.log(`- ${path.relative(root, icoPath)}`);
  console.log(`- ${path.relative(root, installerIcoPath)}`);
}

main().catch((error) => {
  console.error('Error generando iconos:', error);
  process.exit(1);
});

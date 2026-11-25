// Gera os ícones do app a partir de um SVG, usando o Chromium do Playwright.
// Uso: node scripts/generate-icons.js   (só precisa rodar de novo se o desenho mudar)
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const ACCENT = '#c2410c';

/**
 * Linha de batimento ("ritmo") em branco sobre o laranja do app.
 * O traço fica dentro do círculo central de 60% do ícone, a área segura dos
 * ícones adaptáveis (maskable), então nada é cortado pelo formato do sistema.
 * @param {number} radius  arredondamento do fundo (0 = quadrado para maskable/iOS)
 */
function svg(radius) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${ACCENT}"/>
  <polyline points="120,272 188,272 222,196 268,336 304,236 330,272 392,272"
    fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const outputs = [
  { file: 'icon-192.png', size: 192, radius: 96 },
  { file: 'icon-512.png', size: 512, radius: 96 },
  { file: 'maskable-512.png', size: 512, radius: 0 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0 },
];

await mkdir('app/icons', { recursive: true });
await writeFile('app/icons/icon.svg', svg(96));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, radius } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(radius).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: `app/icons/${file}`, omitBackground: true });
  console.log(`app/icons/${file}`);
}
await browser.close();

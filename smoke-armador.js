/**
 * smoke-armador.js — test visual del Armador de Protocolos
 * Correr desde el directorio vitaverse: node ./scratchpad/smoke-armador.js
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE  = 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');

// ── Helper screenshot ─────────────────────────────────────────────────────────
async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${name}.png`);
  return file;
}

// ── Cookies de auth mínimas (ajustar si el layout requiere más) ───────────────
// Primero probamos sin auth para ver qué carga
const NO_AUTH = [];

;(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX' });

  const errors   = [];
  const warnings = [];
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error')   errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', e => errors.push(e.message));

  // ── 1. Home ─────────────────────────────────────────────────────────────────
  console.log('\n── 1. Cargando /armador-carritos (sin auth)');
  await page.goto(`${BASE}/armador-carritos`, { waitUntil: 'networkidle', timeout: 25000 }).catch(e => console.log('nav:', e.message));
  await page.waitForTimeout(2000);
  await shot(page, '01-home-sin-auth');
  console.log(`  URL actual: ${page.url()}`);

  // Verificar si hay un header / si la app cargó o redirigió a login
  const title = await page.title();
  const h1    = await page.locator('h1').first().textContent().catch(() => '(sin h1)');
  console.log(`  Título: ${title}`);
  console.log(`  H1: ${h1}`);

  // ── 2. Tabs de navegación visibles ──────────────────────────────────────────
  console.log('\n── 2. Verificando tabs de navegación');
  const tabsCount = await page.locator('button:has-text("Probióticos")').count();
  console.log(`  Tab "Probióticos" encontrado: ${tabsCount > 0 ? '✅' : '⚠️  no encontrado'}`);

  const tabNAD = await page.locator('button:has-text("NAD+")').count();
  console.log(`  Tab "NAD+" encontrado: ${tabNAD > 0 ? '✅' : '⚠️  no encontrado'}`);

  // ── 3. Collection cards en home ──────────────────────────────────────────────
  console.log('\n── 3. Verificando collection cards');
  const cards = await page.locator('.grid > button').count();
  console.log(`  Cards en grid: ${cards}`);
  await shot(page, '02-home-cards');

  // ── 4. Protocolo indicator deshabilitado ─────────────────────────────────────
  console.log('\n── 4. ProtocolIndicator vacío');
  const protBtn = await page.locator('button:has-text("Crear protocolo")').count();
  console.log(`  Botón "Crear protocolo" (disabled): ${protBtn > 0 ? '✅' : '⚠️'}`);

  // ── 5. Clic en tab Marcas Profesionales ─────────────────────────────────────
  console.log('\n── 5. Cargando colección Marcas Profesionales');
  await page.locator('button:has-text("Marcas Profesionales")').first().click();
  await page.waitForTimeout(3500);
  await shot(page, '03-coleccion-marcas-pro');
  const productCards = await page.locator('.grid > div').count();
  console.log(`  ProductCards visibles: ${productCards}`);

  // ── 6. Clic en primer producto ───────────────────────────────────────────────
  if (productCards > 0) {
    console.log('\n── 6. Abriendo detalle de producto');
    await page.locator('.grid > div').first().click();
    await page.waitForTimeout(1000);
    await shot(page, '04-product-detail');

    const h1Detail = await page.locator('h1').first().textContent().catch(() => '');
    console.log(`  Producto: ${h1Detail.slice(0, 60)}…`);

    // Verificar acordeón de indicaciones
    const instrAccordion = await page.locator('button:has-text("Indicaciones de toma")').count();
    console.log(`  Acordeón indicaciones: ${instrAccordion > 0 ? '✅' : '⚠️'}`);

    // Verificar botón agregar
    const addBtn = await page.locator('button:has-text("Agregar al protocolo")').count();
    console.log(`  Botón "Agregar al protocolo": ${addBtn > 0 ? '✅' : '⚠️'}`);

    // Corazón / favorito
    const heartBtn = await page.locator('button:has-text("Agregar a favoritos")').count();
    console.log(`  Botón favorito: ${heartBtn > 0 ? '✅' : '⚠️'}`);

    // ── 7. Agregar al protocolo ─────────────────────────────────────────────────
    if (addBtn > 0) {
      console.log('\n── 7. Agregando al protocolo');
      await page.locator('button:has-text("Agregar al protocolo")').click();
      await page.waitForTimeout(400);
      await shot(page, '05-agregado-protocolo');

      // Verificar que el indicador cambió
      const protCount = await page.locator('.bg-\\[\\#1E8FA8\\]').count();
      console.log(`  Badge teal (protocolo): ${protCount > 0 ? '✅ visible' : '⚠️ no encontrado'}`);
    }
  }

  // ── 8. Resumen ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────');
  if (errors.length) {
    console.error(`\n❌ Errores de consola (${errors.length}):`);
    errors.forEach(e => console.error('  ', e.slice(0, 120)));
  } else {
    console.log('✅ Sin errores de consola JS');
  }

  await browser.close();
  console.log('\n✓ Done. Screenshots en ./screenshots/\n');
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

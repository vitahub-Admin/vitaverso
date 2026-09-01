/**
 * smoke-armador.js â€” test visual del Armador de Protocolos
 * Correr desde vitaverse/: node smoke-armador.cjs
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE      = 'http://localhost:3000';
const CUST_ID   = '8203251581249'; // del testing skill
const SHOTS_DIR = 'C:/Users/KOMASAN/AppData/Local/Temp/claude/h--WEB-projects-PROYECTOS-POSTA/d5fa8997-77f7-4abb-b7e3-74fe552a628a/scratchpad/screenshots';

async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ðŸ“¸ ${name}.png`);
  return file;
}

;(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX' });

  const errors = [];
  const page   = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  // â”€â”€ Auth: inyectar customerId vÃ­a URL param (lo lee SetCustomerId.jsx) â”€â”€â”€â”€â”€
  console.log('\nâ”€â”€ Auth: seteando customerId via URL param');
  await page.goto(`${BASE}/?customerId=${CUST_ID}`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Verificar que la cookie quedÃ³ seteada
  const cookies = await ctx.cookies();
  const cidCookie = cookies.find(c => c.name === 'customerId');
  console.log(`  Cookie customerId: ${cidCookie ? `âœ… ${cidCookie.value}` : 'âš ï¸  no seteada'}`);

  // â”€â”€ 1. Navegar a armador â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nâ”€â”€ 1. Cargando /armador-carritos');
  await page.goto(`${BASE}/armador-carritos`, { waitUntil: 'networkidle', timeout: 25000 }).catch(e => {
    console.log('  nav error:', e.message);
  });
  await page.waitForTimeout(2500); // esperar render del CustomerContext

  const url = page.url();
  console.log(`  URL final: ${url}`);

  const h1 = await page.locator('h1').first().textContent().catch(() => '(sin h1)');
  console.log(`  H1: "${h1}"`);

  await shot(page, '01-armador-home');

  if (url.includes('/armador-carritos')) {
    // â”€â”€ 2. Verificar estructura del header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\nâ”€â”€ 2. Header y tabs');
    const tabs = ['Inicio', 'ProbiÃ³ticos', 'Marcas Profesionales', 'Vitamina C', 'Magnesio', 'NAD+'];
    for (const label of tabs) {
      const found = await page.locator(`button:has-text("${label}")`).count();
      console.log(`  Tab "${label}": ${found > 0 ? 'âœ…' : 'âš ï¸  no encontrado'}`);
    }

    // â”€â”€ 3. Collection cards en home â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\nâ”€â”€ 3. Collection cards');
    await page.waitForTimeout(1000); // esperar batch de imÃ¡genes de colecciones
    await shot(page, '02-home-colecciones');

    // â”€â”€ 4. Clic en Marcas Profesionales (Ãºnica que devuelve datos) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\nâ”€â”€ 4. Abriendo Marcas Profesionales');
    await page.locator('button:has-text("Marcas Profesionales")').first().click();
    await page.waitForTimeout(4000); // esperar API Shopify + Supabase

    const prodCount = await page.locator('.grid > div').count();
    console.log(`  Productos visibles: ${prodCount}`);
    await shot(page, '03-marcas-pro-grid');

    // â”€â”€ 5. Abrir detalle de un producto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (prodCount > 0) {
      console.log('\nâ”€â”€ 5. Detalle de producto');
      await page.locator('.grid > div').first().click();
      await page.waitForTimeout(1200);
      await shot(page, '04-product-detail');

      const productTitle = await page.locator('h1').first().textContent().catch(() => '');
      console.log(`  Producto: "${productTitle.slice(0, 70)}"`);

      // Verificar elementos clave del detalle
      const checks = [
        ['Indicaciones de toma',  'AcordeÃ³n indicaciones'],
        ['Agregar al protocolo',  'BotÃ³n agregar'],
        ['Agregar a favoritos',   'BotÃ³n favorito'],
        ['Componente principal',  'SecciÃ³n componente'],
      ];
      for (const [text, label] of checks) {
        const n = await page.locator(`text="${text}"`).count()
          + await page.locator(`button:has-text("${text}")`).count()
          + await page.locator(`p:has-text("${text}")`).count();
        console.log(`  ${label}: ${n > 0 ? 'âœ…' : 'âš ï¸  no encontrado'}`);
      }

      // â”€â”€ 6. Agregar al protocolo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      console.log('\nâ”€â”€ 6. Agregar al protocolo');
      const addBtn = page.locator('button:has-text("Agregar al protocolo")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(400);
        await shot(page, '05-product-agregado');

        // El botÃ³n debe cambiar a "Actualizar en protocolo"
        const updBtn = await page.locator('button:has-text("Actualizar en protocolo")').count();
        console.log(`  BotÃ³n cambiÃ³ a "Actualizar": ${updBtn > 0 ? 'âœ…' : 'âš ï¸'}`);

        // Volver a la colecciÃ³n
        await page.locator('button:has-text("Marcas")').first().click().catch(() => {});
        await page.locator('button[class*="ArrowLeft"], button:has-text("Volver")').first().click().catch(async () => {
          await page.goBack().catch(() => {});
        });
        await page.waitForTimeout(800);

        // â”€â”€ 7. ProtocolIndicator con item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        console.log('\nâ”€â”€ 7. ProtocolIndicator con 1 item');
        const protBtn = page.locator('button:has-text("Protocolo")');
        if (await protBtn.count() > 0) {
          await protBtn.click();
          await page.waitForTimeout(400);
          await shot(page, '06-protocol-indicator-open');

          // Verificar campos de paciente
          const nameInput = await page.locator('input[placeholder*="Nombre"]').count();
          console.log(`  Campo nombre paciente: ${nameInput > 0 ? 'âœ…' : 'âš ï¸'}`);

          const draftBtn = await page.locator('button:has-text("borrador")').count();
          console.log(`  BotÃ³n "Ir al borrador": ${draftBtn > 0 ? 'âœ…' : 'âš ï¸'}`);

          // Abrir borrador
          if (draftBtn > 0) {
            await page.fill('input[placeholder*="Nombre"]', 'Juan PÃ©rez Test');
            await page.locator('button:has-text("borrador")').first().click();
            await page.waitForTimeout(600);
            await shot(page, '07-draft-view');
            console.log('  Vista borrador: âœ… abierta');
          }
        } else {
          console.log('  âš ï¸  BotÃ³n protocolo no encontrado (posible: indicador aÃºn disabled)');
        }
      }
    }

    // â”€â”€ 8. Favoritos (toggle corazÃ³n) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    console.log('\nâ”€â”€ 8. Favoritos');
    await page.goto(`${BASE}/armador-carritos`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Marcas Profesionales")').first().click();
    await page.waitForTimeout(3500);

    const heartBtns = page.locator('button').filter({ has: page.locator('svg') });
    // Encontrar el primer botÃ³n corazÃ³n (top-right de product card)
    const firstHeart = page.locator('.grid > div button').first();
    if (await firstHeart.count() > 0) {
      await firstHeart.click({ force: true });
      await page.waitForTimeout(400);
      // Tab Favoritos deberÃ­a aparecer
      const favTab = await page.locator('button:has-text("Favoritos")').count();
      console.log(`  Tab Favoritos apareciÃ³: ${favTab > 0 ? 'âœ…' : 'âš ï¸'}`);
      if (favTab > 0) {
        await page.locator('button:has-text("Favoritos")').first().click();
        await page.waitForTimeout(500);
        await shot(page, '08-favoritos-view');
        console.log('  Vista Favoritos: âœ…');
      }
    } else {
      console.log('  âš ï¸  No se encontraron botones en cards');
    }

  } else {
    console.log(`\nâš ï¸  Redirigido a: ${url} (posiblemente auth fallÃ³)`);
    await shot(page, '01-redirect');
  }

  // â”€â”€ Resumen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log('\nâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
  if (errors.length) {
    console.error(`\nâŒ Errores JS (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.error('  ', e.slice(0, 150)));
  } else {
    console.log('âœ… Sin errores de consola JS');
  }

  await browser.close();
  console.log('\nâœ“ Done. Screenshots en:', SHOTS_DIR, '\n');
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});


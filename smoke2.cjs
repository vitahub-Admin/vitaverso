const { chromium } = require('playwright');
const SHOTS  = 'C:/Users/KOMASAN/AppData/Local/Temp/claude/h--WEB-projects-PROYECTOS-POSTA/d5fa8997-77f7-4abb-b7e3-74fe552a628a/scratchpad/screenshots';
const BASE   = 'http://localhost:3000';
const CUSTID = '8203251581249';

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

;(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX' });

  await ctx.addCookies([{
    name: 'customerId', value: CUSTID,
    domain: 'localhost', path: '/',
    httpOnly: false, secure: false, sameSite: 'Lax',
  }]);

  const errors = [];
  const page   = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  // ── 1. Home ──────────────────────────────────────────────────────────────
  console.log('\n── 1. Home');
  await page.goto(`${BASE}/armador-carritos`, { waitUntil: 'networkidle', timeout: 25000 }).catch(e => console.log('nav:', e.message));
  await page.waitForTimeout(3000);
  const h1 = await page.locator('h1').first().textContent().catch(() => '(sin h1)');
  console.log(`  H1: ${h1}`);

  // ── 2. Abrir Marcas Profesionales ────────────────────────────────────────
  console.log('\n── 2. Marcas Profesionales');
  await page.locator('button').filter({ hasText: 'Marcas Profesionales' }).first().click();
  await page.waitForTimeout(5000);
  const prods = await page.locator('.grid > div').count();
  console.log(`  Productos: ${prods}`);

  // ── 3. Agregar primer producto al protocolo ───────────────────────────────
  if (prods > 0) {
    console.log('\n── 3. Abrir detalle y agregar al protocolo');
    await page.locator('.grid > div').first().click();
    await page.waitForTimeout(1500);

    const addBtn = page.locator('button:has-text("Agregar al protocolo")');
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const updated = await page.locator('button:has-text("Actualizar en protocolo")').count();
      console.log(`  Botón → "Actualizar": ${updated > 0 ? '✅' : '⚠️'}`);

      // ── 4. ProtocolIndicator desde la vista de detalle ─────────────────────
      console.log('\n── 4. ProtocolIndicator dropdown');
      // El indicator muestra precio "$299" — lo distinguimos del H1 por el signo $
      // El H1 "Protocolos Clínicos" está también en un <button> pero no tiene precio
      const indBtn = page.locator('button').filter({ hasText: /\$\d/ }).first();
      const indCount = await indBtn.count();
      console.log(`  Botón indicator encontrado: ${indCount > 0 ? '✅' : '⚠️'}`);

      if (indCount > 0) {
        const indText = await indBtn.textContent().catch(() => '');
        console.log(`  Texto indicator: "${indText.trim().slice(0, 50)}"`);
        await indBtn.click();
        await page.waitForTimeout(600);
        await shot(page, '05-indicator-open');

        // Verificar campos de paciente — placeholder="Nombre del paciente"
        const nameInput  = await page.locator('input[placeholder*="aciente"]').count(); // "Nombre del paciente"
        const telInput   = await page.locator('input[type="tel"]').count();
        const draftBtns  = await page.locator('button').filter({ hasText: /borrador/i }).count();
        console.log(`  Input nombre:   ${nameInput > 0 ? '✅' : '⚠️'}`);
        console.log(`  Input teléfono: ${telInput > 0 ? '✅' : '⚠️'}`);
        console.log(`  Botón borrador: ${draftBtns > 0 ? '✅' : '⚠️'}`);

        // ── 5. Abrir DraftView ─────────────────────────────────────────────
        if (draftBtns > 0) {
          // Llenar nombre antes de ir al borrador
          const ni = page.locator('input[placeholder*="aciente"]');
          if (await ni.count() > 0) {
            await ni.fill('Ana García');
          }
          await page.locator('button').filter({ hasText: /borrador/i }).first().click();
          await page.waitForTimeout(800);
          await shot(page, '06-draft-view');
          const draftH = await page.locator('h2, h3').filter({ hasText: /borrador|protocolo/i }).count();
          console.log(`  Vista borrador: ${draftH > 0 ? '✅ h2/h3 encontrado' : '⚠️ sin heading (check screenshot)'}`);
        }
      }
    }
  }

  // ── 6. Favoritos ─────────────────────────────────────────────────────────
  console.log('\n── 6. Favoritos');
  // Volver al grid de Marcas Pro
  await page.goto(`${BASE}/armador-carritos`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.locator('button').filter({ hasText: 'Marcas Profesionales' }).first().click();
  await page.waitForTimeout(4000);

  const gridCards = await page.locator('.grid > div').count();
  console.log(`  Cards en grid: ${gridCards}`);

  if (gridCards > 0) {
    // El primer botón dentro de una card es el corazón (top-right)
    // Los cards tienen position:relative, el botón corazón es el primero con clase absolute
    // Intentamos con el botón dentro del primer card
    const firstCard = page.locator('.grid > div').first();
    const heartBtn  = firstCard.locator('button').first();
    const heartCount = await heartBtn.count();
    console.log(`  Botón corazón en card: ${heartCount > 0 ? '✅' : '⚠️'}`);

    if (heartCount > 0) {
      await heartBtn.click({ force: true });
      await page.waitForTimeout(600);
      await shot(page, '07-after-fav-toggle');

      // Verificar que aparece tab Favoritos
      const favTab = await page.locator('button').filter({ hasText: /^Favoritos$|Favoritos/ }).count();
      console.log(`  Tab Favoritos apareció: ${favTab > 0 ? '✅' : '⚠️'}`);

      if (favTab > 0) {
        await page.locator('button').filter({ hasText: /Favoritos/ }).first().click();
        await page.waitForTimeout(500);
        await shot(page, '08-favoritos-view');
        const favGrid = await page.locator('.grid > div, [class*="slider"] > div').count();
        console.log(`  Items en vista favoritos: ${favGrid > 0 ? `✅ (${favGrid})` : '⚠️ sin items'}`);
      }
    }
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────');
  // Filtrar 404s de imágenes externas — no son errores reales de JS
  const realErrors = errors.filter(e => !e.includes('404') && !e.includes('net::ERR_'));
  if (realErrors.length) {
    console.error(`❌ Errores JS (${realErrors.length}):`);
    realErrors.slice(0, 5).forEach(e => console.error('  ', e.slice(0, 150)));
  } else {
    console.log(`✅ Sin errores JS reales (${errors.length} 404s de imágenes ignorados)`);
  }
  await browser.close();
  console.log('✓ Done\n');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

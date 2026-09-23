import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lineasDeProducto } from '@/lib/lineItems';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Contactos de un profesional: la unión de sus carritos compartidos y sus ventas.
 *
 * Quién es el contacto lo define el paciente del carrito, no quien pagó: si le
 * armo un protocolo a José y lo compra María, el contacto es José. Casi la
 * mitad de las órdenes que vienen de un carrito las paga otra persona, así que
 * agrupar por comprador partía al mismo paciente en varios contactos —
 * y dejaba fuera a todos los que todavía no compraron.
 *
 * Identidad (dentro de un mismo profesional, en cascada):
 *   1. la orden trae el token del carrito  → es el paciente de ese carrito
 *   2. teléfono normalizado a 10 dígitos
 *   3. email
 *   4. nombre normalizado
 * Después, un grupo que solo tiene nombre se absorbe en el grupo con teléfono
 * que se llama igual, si hay uno solo. Nombres iguales con teléfonos distintos
 * quedan separados: son dos personas.
 */

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const telClave    = (s) => soloDigitos(s).slice(-10);
const normalizar  = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

// Nombre del paciente en un sharecart: la columna directa o el patient_info
const nombrePaciente = (sc) =>
  (sc.name || sc.extra?.patient_info?.name || sc.extra?.patient_info?.nombre || '').trim();
const telPaciente = (sc) =>
  telClave(sc.phone || sc.extra?.patient_info?.phone || sc.extra?.patient_info?.telefono);

// ¿Son la misma persona? Alcanza con que coincida el primer nombre: el
// comprador suele escribir su nombre distinto al del paciente, pero cuando es
// él mismo el primer nombre coincide.
const mismaPersona = (a, b) => {
  const x = normalizar(a), y = normalizar(b);
  if (!x || !y) return true;               // sin datos, no afirmamos que difieren
  if (x === y) return true;
  return x.split(' ')[0] === y.split(' ')[0];
};

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'No hay id en parámetros' }, { status: 400 });
    }

    // 1. Órdenes del especialista. Las que llegaron sin ref y resolvió el
    //    webhook quedan con "0000" en specialist_ref y el ID en corrected_ref.
    const [{ data: orders, error: ordersError }, { data: carts, error: cartsError }] =
      await Promise.all([
        supabase
          .from('orders')
          .select('order_id, order_name, customer_email, customer_name, customer_phone, share_cart, shopify_created_at, line_items, total_discounts')
          .or(`specialist_ref.eq.${String(id)},corrected_ref.eq.${String(id)}`),
        supabase
          .from('sharecarts')
          .select('token, name, phone, extra, created_at')
          .eq('owner_id', String(id)),
      ]);

    if (ordersError) throw ordersError;
    if (cartsError)  throw cartsError;

    // 2. Comisiones por product_id
    const productIds = [...new Set(
      (orders || []).flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean))
    )];

    const commMap = {};
    if (productIds.length) {
      const { data: commissions } = await supabase
        .from('product_variant_commissions')
        .select('product_id, commission_percent')
        .in('product_id', productIds)
        .eq('active', true);
      for (const c of (commissions || [])) {
        commMap[String(c.product_id)] = Number(c.commission_percent);
      }
    }

    // 3. Grupos de contacto
    const grupos    = new Map();   // clave → contacto
    const claveDeCarrito = new Map(); // token → clave del grupo

    const nuevo = (clave) => ({
      id:                clave,
      nombre_paciente:   null,     // el que manda: sale del carrito
      nombre_comprador:  null,     // respaldo si nunca hubo carrito con nombre
      email_cliente:     null,
      telefono_cliente:  null,
      cantidad_ordenes:  0,
      cantidad_carritos: 0,
      ganancia_total:    0,
      fecha_ultima_orden:   null,
      fecha_ultimo_carrito: null,
      _fechaNombre:      null,     // para quedarnos con el nombre más reciente
      compradores:       new Set(),
      tokens:            [],
    });

    const tomar = (clave) => {
      if (!grupos.has(clave)) grupos.set(clave, nuevo(clave));
      return grupos.get(clave);
    };

    // 3a. Los carritos definen los contactos y sus nombres
    for (const sc of (carts || [])) {
      const nombre = nombrePaciente(sc);
      if (!nombre) continue;           // un carrito sin paciente no es un contacto
      const tel   = telPaciente(sc);
      const clave = tel ? `tel:${tel}` : `nom:${normalizar(nombre)}`;
      const g     = tomar(clave);

      claveDeCarrito.set(sc.token, clave);
      g.cantidad_carritos++;
      g.tokens.push(sc.token);
      if (tel && !g.telefono_cliente) g.telefono_cliente = tel;
      if (!g.fecha_ultimo_carrito || sc.created_at > g.fecha_ultimo_carrito) {
        g.fecha_ultimo_carrito = sc.created_at;
      }
      if (!g._fechaNombre || sc.created_at > g._fechaNombre) {
        g.nombre_paciente = nombre;
        g._fechaNombre    = sc.created_at;
      }
    }

    // 3b. Las órdenes se cuelgan de su carrito; si no tienen, arman su propio grupo
    for (const order of (orders || [])) {
      const tel   = telClave(order.customer_phone);
      const email = (order.customer_email || '').trim().toLowerCase();

      let clave = order.share_cart ? claveDeCarrito.get(order.share_cart) : null;
      if (!clave) {
        clave = tel   ? `tel:${tel}`
              : email ? `mail:${email}`
              : order.customer_name ? `nom:${normalizar(order.customer_name)}`
              : null;
      }
      if (!clave) continue;            // orden anónima: no hay a quién atribuirla

      const g = tomar(clave);
      g.cantidad_ordenes++;
      if (email && !g.email_cliente)   g.email_cliente    = email;
      if (tel   && !g.telefono_cliente) g.telefono_cliente = tel;
      if (order.customer_name && !g.nombre_comprador) g.nombre_comprador = order.customer_name.trim();
      // Si pagó alguien distinto al paciente, queda registrado
      if (order.customer_name && g.nombre_paciente && !mismaPersona(order.customer_name, g.nombre_paciente)) {
        g.compradores.add(order.customer_name.trim());
      }

      // Ganancia de esta orden (sin propinas ni líneas de referencia)
      const items         = lineasDeProducto(order.line_items);
      const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0);
      const totalDiscount = Number(order.total_discounts || 0);

      for (const item of items) {
        const commission   = commMap[String(item.product_id || '')] ?? 0;
        const lineSubtotal = Number(item.price || 0) * (item.quantity || 1);
        const lineDiscount = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0;
        g.ganancia_total += (lineSubtotal - lineDiscount) * (commission / 100);
      }

      if (!g.fecha_ultima_orden || order.shopify_created_at > g.fecha_ultima_orden) {
        g.fecha_ultima_orden = order.shopify_created_at;
      }
    }

    // 4. Absorber los grupos que solo tienen nombre dentro del grupo con
    //    teléfono que se llama igual, si hay uno solo. Con dos candidatos no
    //    adivinamos: son dos pacientes homónimos.
    const porNombre = new Map();       // nombre normalizado → [claves con teléfono]
    for (const g of grupos.values()) {
      if (!g.telefono_cliente) continue;
      const n = normalizar(g.nombre_paciente || g.nombre_comprador);
      if (!n) continue;
      if (!porNombre.has(n)) porNombre.set(n, []);
      porNombre.get(n).push(g.id);
    }

    for (const [clave, g] of [...grupos]) {
      if (!clave.startsWith('nom:')) continue;
      const candidatos = porNombre.get(normalizar(g.nombre_paciente || g.nombre_comprador)) || [];
      if (candidatos.length !== 1) continue;
      const destino = grupos.get(candidatos[0]);
      if (!destino || destino === g) continue;

      destino.cantidad_carritos += g.cantidad_carritos;
      destino.cantidad_ordenes  += g.cantidad_ordenes;
      destino.ganancia_total    += g.ganancia_total;
      destino.tokens.push(...g.tokens);
      g.compradores.forEach(c => destino.compradores.add(c));
      if (!destino.email_cliente && g.email_cliente) destino.email_cliente = g.email_cliente;
      if (g.fecha_ultima_orden   > (destino.fecha_ultima_orden   || '')) destino.fecha_ultima_orden   = g.fecha_ultima_orden;
      if (g.fecha_ultimo_carrito > (destino.fecha_ultimo_carrito || '')) destino.fecha_ultimo_carrito = g.fecha_ultimo_carrito;
      grupos.delete(clave);
    }

    // 5. Serializar. Se mantienen los nombres de campo que ya usaba la página.
    const data = [...grupos.values()].map(g => {
      const nombre  = g.nombre_paciente || g.nombre_comprador || '';
      const partes  = nombre.trim().split(/\s+/);
      const ultima  = [g.fecha_ultima_orden, g.fecha_ultimo_carrito]
        .filter(Boolean).sort().reverse()[0] || null;

      return {
        id:                g.id,
        nombre_cliente:    partes[0] || null,
        apellido_cliente:  partes.slice(1).join(' ') || null,
        email_cliente:     g.email_cliente,
        telefono_cliente:  g.telefono_cliente,
        cantidad_ordenes:  g.cantidad_ordenes,
        cantidad_carritos: g.cantidad_carritos,
        ganancia_total:    g.ganancia_total,
        compradores:       [...g.compradores],
        tokens:            g.tokens.slice(0, 50),
        fecha_ultima_orden:            g.fecha_ultima_orden,
        fecha_ultima_orden_formateada: g.fecha_ultima_orden ? g.fecha_ultima_orden.slice(0, 10) : null,
        fecha_ultimo_carrito:          g.fecha_ultimo_carrito,
        ultima_actividad:              ultima,
        ultima_actividad_formateada:   ultima ? ultima.slice(0, 10) : null,
      };
    }).sort((a, b) => (b.ultima_actividad || '').localeCompare(a.ultima_actividad || ''));

    return NextResponse.json({
      success: true,
      data,
      message: `Encontrados ${data.length} contactos`,
    });

  } catch (error) {
    console.error('Error en contacts:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

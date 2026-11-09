// GET /api/protocolo-pdf?token=SHARECART_TOKEN
// Genera y devuelve el PDF del protocolo de suplementación al vuelo.
// Se enlaza desde el email de prescripción — no requiere auth, el token actúa como clave.
//
// Mismo diseño que el correo nuevo de protocolo (franja azul, banda turquesa, pastilla de toma, bloque de la
// app Mi Vitahub) y mismos datos: si se cambia uno, se cambia el otro. Los datos salen de
// armarProtocolo (src/lib/protocoloDatos.js).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import { armarProtocolo, etiquetaDeProducto } from "@/lib/protocoloDatos";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Estilos PDF ───────────────────────────────────────────────────────────────

const APP_IOS_URL = "https://apps.apple.com/mx/app/mi-vitahub/id6821184197";
const APP_ANDROID_URL = "https://play.google.com/store/apps/details?id=mx.vitahub.cliente";
// La app de Android solo se ofrece cuando ya está publicada (misma variable que usan los correos).
const ANDROID_PUBLICA = process.env.MI_VITAHUB_ANDROID_PUBLICA === "1";

const S = StyleSheet.create({
  page:        { fontFamily: "Helvetica", backgroundColor: "#fff" },
  header:      { backgroundColor: "#1b3f7a", padding: "20 40 18" },
  headerEye:   { color: "#7eb8c9", fontSize: 9, fontWeight: "bold", letterSpacing: 2, marginBottom: 5 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  band:        { backgroundColor: "#2BB9B8", flexDirection: "row", justifyContent: "space-between", padding: "10 40" },
  bandLabel:   { color: "rgba(13,33,51,0.7)", fontSize: 8, fontWeight: "bold", letterSpacing: 1.5, marginBottom: 3 },
  bandValue:   { color: "#0D2133", fontSize: 13, fontWeight: "bold" },
  meta:        { flexDirection: "row", justifyContent: "space-between", padding: "7 40", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  metaText:    { color: "#9ca3af", fontSize: 10 },
  body:        { backgroundColor: "#fff", padding: "12 40 6" },
  sectionLbl:  { color: "#9ca3af", fontSize: 8, fontWeight: "bold", letterSpacing: 2, marginBottom: 12 },
  item:        { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 8, marginTop: 8 },
  itemFirst:   { marginTop: 0, borderTopWidth: 0, paddingTop: 0 },
  foto:        { width: 58, height: 58, borderRadius: 9, borderWidth: 1, borderColor: "#D0E4EC", objectFit: "cover" },
  fotoVacia:   { width: 58, height: 58, borderRadius: 9, borderWidth: 1, borderColor: "#D0E4EC", backgroundColor: "#F7F9FB" },
  itemTexto:   { flex: 1, marginLeft: 14 },
  doseBadge:   { backgroundColor: "#2BB9B8", color: "#0D2133", fontSize: 9, fontWeight: "bold", padding: "3 9", borderRadius: 20, alignSelf: "flex-start" },
  qtyBadge:    { backgroundColor: "#1b3f7a", color: "#fff", fontSize: 9, fontWeight: "bold", padding: "3 9", borderRadius: 20, alignSelf: "flex-start" },
  itemTitle:   { color: "#1b3f7a", fontSize: 12, fontWeight: "bold", marginTop: 7, lineHeight: 1.35 },
  itemDesc:    { color: "#6b7280", fontSize: 10, lineHeight: 1.65, marginTop: 5 },
  itemNota:    { color: "#9ca3af", fontSize: 9, marginTop: 5 },
  itemUso:     { color: "#1b3f7a", fontSize: 9, marginTop: 5 },
  app:         { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f3f4f6", padding: "9 40 8", alignItems: "center" },
  appTitle:    { color: "#1b3f7a", fontSize: 13, fontWeight: "bold", textAlign: "center" },
  appText:     { color: "#4b5563", fontSize: 10, lineHeight: 1.5, textAlign: "center", marginTop: 4, maxWidth: 400 },
  appLinks:    { flexDirection: "row", justifyContent: "center", marginTop: 9 },
  appBtn:      { backgroundColor: "#1b3f7a", color: "#fff", fontSize: 10, fontWeight: "bold", padding: "7 16", borderRadius: 20, marginHorizontal: 5, textDecoration: "none" },
  footer:      { backgroundColor: "#f9fafb", borderTopWidth: 1, borderTopColor: "#f3f4f6", padding: "7 40", alignItems: "center" },
  footerText:  { color: "#9ca3af", fontSize: 8, lineHeight: 1.6, textAlign: "center" },
});

// ── Componente JSX del documento ──────────────────────────────────────────────

function ProtocoloPDF({ affiliateName, patientName, orderNumber, date, lineItems }) {
  return (
    <Document title={`Protocolo — ${patientName}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <Text style={S.headerEye}>VITAHUB PRO</Text>
          <Text style={S.headerTitle}>Sigue tu protocolo en la app Mi Vitahub</Text>
        </View>

        {/* Paciente / Especialista */}
        <View style={S.band}>
          <View>
            <Text style={S.bandLabel}>PROTOCOLO DE</Text>
            <Text style={S.bandValue}>{patientName}</Text>
          </View>
          <View>
            <Text style={[S.bandLabel, { textAlign: "right" }]}>ESPECIALISTA</Text>
            <Text style={[S.bandValue, { textAlign: "right" }]}>{affiliateName}</Text>
          </View>
        </View>

        {/* Orden + Fecha. Un protocolo compartido antes de comprar no tiene
            orden: mostrar "Orden #—" ahí no le dice nada al paciente, así que
            en ese caso queda solo la fecha. */}
        <View style={orderNumber ? S.meta : [S.meta, { justifyContent: "flex-end" }]}>
          {orderNumber ? <Text style={S.metaText}>Orden #{orderNumber}</Text> : null}
          <Text style={S.metaText}>{date}</Text>
        </View>

        {/* Productos */}
        <View style={S.body}>
          <Text style={S.sectionLbl}>TU PROTOCOLO DE SUPLEMENTOS</Text>

          {lineItems.map((item, i) => {
            const etiqueta = etiquetaDeProducto(item);
            return (
              // wrap={false}: un producto no se parte entre dos páginas
              <View key={i} wrap={false} style={i === 0 ? [S.item, S.itemFirst] : S.item}>
                {item.fotoDatos
                  ? <Image src={item.fotoDatos} style={S.foto} />
                  : <View style={S.fotoVacia} />}
                <View style={S.itemTexto}>
                  <Text style={etiqueta.tipo === "dosis" ? S.doseBadge : S.qtyBadge}>{etiqueta.texto}</Text>
                  <Text style={S.itemTitle}>{item.title}</Text>
                  <Text style={S.itemDesc}>{item.desc}</Text>
                  {item.modo_de_uso
                    ? <Text style={S.itemUso}><Text style={{ fontFamily: "Helvetica-Bold" }}>Modo de uso:</Text> {item.modo_de_uso}</Text>
                    : null}
                  {item.nota ? <Text style={S.itemNota}>Nota: {item.nota}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* La app y el pie, juntos: el mismo mensaje, los mismos enlaces y la misma nota general que el correo */}
        <View wrap={false}>
          <View style={S.app}>
            <Text style={S.appTitle}>Descarga Mi Vitahub y no te pierdas ninguna dosis</Text>
            <Text style={S.appText}>
              Programa tus dosis a la hora indicada y te mandaremos un recordatorio. Podrás hacer seguimiento del envío
              hasta que llegue. Te avisaremos antes de que tu suplemento se termine. Entra con el correo con el que compraste
              y tus suplementos ya van a estar cargados.
            </Text>
            <View style={S.appLinks}>
              <Link src={APP_IOS_URL} style={S.appBtn}>Descargar para iPhone</Link>
              {ANDROID_PUBLICA ? <Link src={APP_ANDROID_URL} style={S.appBtn}>Descargar para Android</Link> : null}
            </View>
          </View>

          <View style={S.footer}>
            <Text style={S.footerText}>
              Protocolo diseñado para ti por {affiliateName} a través de Vitahub Pro.{"\n"}
              Esta guía es de carácter general. Ante cualquier duda, consulta a un profesional de la salud. vitahub.mx
            </Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}

// react-pdf necesita los bytes de la imagen y solo lee JPG y PNG (Shopify las sirve en el formato en que se
// subieron, y a veces es WebP, que se descarta). Se descargan antes de armar el PDF; si una foto no baja a
// tiempo o no es legible, ese producto sale sin foto y el PDF se entrega igual.
async function descargarFoto(url) {
  if (!url) return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data[0] === 0x89 && data[1] === 0x50) return { data, format: "png" };
    if (data[0] === 0xff && data[1] === 0xd8) return { data, format: "jpg" };
    return null;
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    // 1. Obtener sharecart
    const { data: cart } = await supabase
      .from("sharecarts")
      .select("owner_id, name, extra, items")
      .eq("token", token)
      .maybeSingle();

    if (!cart || cart.extra?.origen !== "protocolo") {
      return NextResponse.json({ error: "Protocolo no encontrado" }, { status: 404 });
    }

    // 2. Datos del especialista
    // `display_name` vive en booking_affiliates, no acá: pedirlo hacía fallar
    // la consulta entera y el PDF salía firmado "Tu especialista en Vitahub"
    // en vez del nombre de quien lo armó. El error pasaba desapercibido porque
    // maybeSingle() no lo lanza, solo devuelve data en null — por eso se mira.
    const { data: affiliate, error: errAf } = await supabase
      .from("affiliates")
      .select("first_name, last_name")
      .eq("shopify_customer_id", Number(cart.owner_id))
      .maybeSingle();

    if (errAf) console.error("[protocolo-pdf] no se pudo leer el afiliado:", errAf.message);

    const affiliateName =
      [affiliate?.first_name, affiliate?.last_name].filter(Boolean).join(" ") ||
      "Tu especialista en Vitahub";

    const patientName = cart.name || "Paciente";

    // 3. Los mismos datos que el correo: productos, indicación de toma, descripción y foto
    const lineItems = await armarProtocolo({
      items:    cart.items || [],
      dosisMap: cart.extra?.dosis_map || {},
    });
    await Promise.all(lineItems.map(async (l) => { l.fotoDatos = await descargarFoto(l.foto); }));

    // 4. Generar PDF. La fecha es la de la orden (igual que el correo); sin orden, la de hoy.
    const fecha = cart.extra?.order_date ? new Date(cart.extra.order_date) : new Date();
    const date = fecha.toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric",
    });

    const pdfBuffer = await renderToBuffer(
      <ProtocoloPDF
        affiliateName={affiliateName}
        patientName={patientName}
        orderNumber={cart.extra?.order_number || null}
        date={date}
        lineItems={lineItems}
      />
    );

    const safePatient = patientName.replace(/\s+/g, "-").replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ0-9-]/g, "") || "paciente";

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type":        "application/pdf",
        // `inline` y no `attachment`: este link se manda por WhatsApp y se abre
        // en su navegador interno, que descarta las descargas sin avisar — el
        // paciente toca el link y no pasa nada. Mostrado en el visor, se ve al
        // instante y desde ahí puede guardarlo o compartirlo. El filename se
        // sigue respetando cuando lo descarga.
        "Content-Disposition": `inline; filename="protocolo-vitahub-${safePatient}.pdf"`,
        "Cache-Control":       "private, max-age=3600",
      },
    });

  } catch (err) {
    console.error("[protocolo-pdf]", err?.message);
    return NextResponse.json({ error: "Error generando el PDF" }, { status: 500 });
  }
}

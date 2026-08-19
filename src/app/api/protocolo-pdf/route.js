// GET /api/protocolo-pdf?token=SHARECART_TOKEN
// Genera y devuelve el PDF del protocolo de suplementación al vuelo.
// Se enlaza desde el email de prescripción — no requiere auth, el token actúa como clave.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Estilos PDF ───────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:        { fontFamily: "Helvetica", backgroundColor: "#F7F9FB", paddingBottom: 40 },
  header:      { backgroundColor: "#1b3f7a", padding: "28 40 24" },
  headerEye:   { color: "#7eb8c9", fontSize: 9, fontWeight: "bold", letterSpacing: 2, marginBottom: 5 },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  band:        { backgroundColor: "#1e8fa8", flexDirection: "row", justifyContent: "space-between", padding: "14 40" },
  bandLabel:   { color: "rgba(255,255,255,0.7)", fontSize: 8, fontWeight: "bold", letterSpacing: 1.5, marginBottom: 3 },
  bandValue:   { color: "#fff", fontSize: 13, fontWeight: "bold" },
  meta:        { flexDirection: "row", justifyContent: "space-between", padding: "10 40", backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  metaText:    { color: "#9ca3af", fontSize: 10 },
  body:        { backgroundColor: "#fff", padding: "24 40" },
  sectionLbl:  { color: "#9ca3af", fontSize: 8, fontWeight: "bold", letterSpacing: 2, marginBottom: 16 },
  item:        { borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 16, marginTop: 16 },
  itemFirst:   { marginTop: 0, borderTopWidth: 0, paddingTop: 0 },
  doseBadge:   { backgroundColor: "#1e8fa8", color: "#fff", fontSize: 9, fontWeight: "bold", padding: "3 9", borderRadius: 20, alignSelf: "flex-start", marginBottom: 7 },
  qtyBadge:    { backgroundColor: "#1b3f7a", color: "#fff", fontSize: 9, fontWeight: "bold", padding: "3 9", borderRadius: 20, alignSelf: "flex-start", marginBottom: 7 },
  itemTitle:   { color: "#1b3f7a", fontSize: 13, fontWeight: "bold", marginBottom: 5 },
  itemDesc:    { color: "#6b7280", fontSize: 10, lineHeight: 1.65 },
  itemNota:    { color: "#9ca3af", fontSize: 9, marginTop: 5 },
  footer:      { backgroundColor: "#f9fafb", borderTopWidth: 1, borderTopColor: "#f3f4f6", padding: "20 40", alignItems: "center" },
  footerText:  { color: "#9ca3af", fontSize: 9, lineHeight: 1.9, textAlign: "center" },
});

// ── Componente JSX del documento ──────────────────────────────────────────────

function ProtocoloPDF({ affiliateName, patientName, orderNumber, date, lineItems, protocolName }) {
  return (
    <Document title={`Protocolo — ${patientName}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <Text style={S.headerEye}>
            Vitahub Pro{protocolName ? `  ·  ${protocolName}` : ""}
          </Text>
          <Text style={S.headerTitle}>Protocolo de Suplementación</Text>
        </View>

        {/* Paciente / Especialista */}
        <View style={S.band}>
          <View>
            <Text style={S.bandLabel}>Paciente</Text>
            <Text style={S.bandValue}>{patientName}</Text>
          </View>
          <View>
            <Text style={[S.bandLabel, { textAlign: "right" }]}>Especialista</Text>
            <Text style={[S.bandValue, { textAlign: "right" }]}>{affiliateName}</Text>
          </View>
        </View>

        {/* Orden + Fecha */}
        <View style={S.meta}>
          <Text style={S.metaText}>Orden #{orderNumber}</Text>
          <Text style={S.metaText}>{date}</Text>
        </View>

        {/* Productos */}
        <View style={S.body}>
          <Text style={S.sectionLbl}>TU PROTOCOLO INCLUYE</Text>

          {lineItems.map((item, i) => (
            <View key={i} style={i === 0 ? S.itemFirst : S.item}>
              {item.dosis_amount
                ? <Text style={S.doseBadge}>
                    {item.dosis_amount} {item.dosis_unit || "cápsula"}{item.dosis_amount > 1 ? "s" : ""}  ·  {item.quantity} unid.
                  </Text>
                : <Text style={S.qtyBadge}>×{item.quantity}</Text>
              }
              <Text style={S.itemTitle}>{item.title}</Text>
              <Text style={S.itemDesc}>{item.desc}</Text>
              {item.nota ? <Text style={S.itemNota}>Nota: {item.nota}</Text> : null}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footerText}>
            Este protocolo fue diseñado para ti por {affiliateName}{"\n"}
            a través de Vitahub Pro.{"\n"}
            Para dudas o ajustes, contacta directamente a tu especialista.{"\n\n"}
            vitahub.mx
          </Text>
        </View>

      </Page>
    </Document>
  );
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

    const dosisMap = cart.extra?.dosis_map || {};

    // 2. Datos del especialista
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("display_name, first_name, last_name")
      .eq("shopify_customer_id", Number(cart.owner_id))
      .maybeSingle();

    const affiliateName =
      affiliate?.display_name ||
      [affiliate?.first_name, affiliate?.last_name].filter(Boolean).join(" ") ||
      "Tu especialista en Vitahub";

    const patientName = cart.name || "Paciente";

    // 3. Enriquecer productos: items del sharecart → product_catalog → componentes
    const sharecartItems = cart.items || [];
    const variantIds = sharecartItems.map(i => Number(i.variant_id ?? i.id)).filter(Boolean);

    const [catalogResult, compResult] = await Promise.all([
      variantIds.length
        ? supabase.from("product_catalog").select("variant_id, product_id, title, componente").in("variant_id", variantIds)
        : Promise.resolve({ data: [] }),
      supabase.from("componentes").select("slug, descripcion"),
    ]);

    const catalogMap = {};
    (catalogResult.data || []).forEach(r => { catalogMap[r.variant_id] = r; });

    const descMap = {};
    (compResult.data || []).forEach(r => {
      if (r.slug) descMap[r.slug.trim().toLowerCase()] = r.descripcion;
    });

    const FALLBACK = "Suplemento de alta calidad seleccionado especialmente para tu protocolo de salud.";

    const lineItems = sharecartItems.map(item => {
      const vid   = Number(item.variant_id ?? item.id ?? 0);
      const cat   = catalogMap[vid] || {};
      const slug  = (cat.componente || "").trim().toLowerCase();
      const desc  = (slug && descMap[slug]) || FALLBACK;
      const dosis = dosisMap[String(vid)] || {};

      return {
        title:        cat.title || item.title || `Variante ${vid}`,
        quantity:     item.quantity || 1,
        desc,
        dosis_amount: dosis.dosis_amount || null,
        dosis_unit:   dosis.dosis_unit   || null,
        nota:         dosis.nota         || null,
      };
    });

    // 4. Generar PDF
    const date = new Date().toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric",
    });

    const pdfBuffer = await renderToBuffer(
      <ProtocoloPDF
        affiliateName={affiliateName}
        patientName={patientName}
        orderNumber={cart.extra?.order_number || "—"}
        date={date}
        lineItems={lineItems}
        protocolName={cart.extra?.protocol_name || null}
      />
    );

    const safePatient = patientName.replace(/\s+/g, "-").replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ0-9-]/g, "") || "paciente";

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="protocolo-vitahub-${safePatient}.pdf"`,
        "Cache-Control":       "private, max-age=3600",
      },
    });

  } catch (err) {
    console.error("[protocolo-pdf]", err?.message);
    return NextResponse.json({ error: "Error generando el PDF" }, { status: 500 });
  }
}

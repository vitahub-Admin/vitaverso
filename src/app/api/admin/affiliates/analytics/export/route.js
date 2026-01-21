// pages/api/admin/affiliates/analytics/export.js
import { NextResponse } from "next/server";
import { getCombinedAnalyticsData } from "@/lib/analyticsData";

/**
 * Convierte datos a CSV
 */
function toCSV(data) {
  // Extraer todos los meses únicos
  const allMonths = new Set();
  data.forEach(row => {
    Object.keys(row.monthly || {}).forEach(month => {
      allMonths.add(month);
    });
  });
  
  const months = Array.from(allMonths).sort();
  
  // Formatear meses: 2025-01 → 01-25
  const formattedMonths = months.map(month => {
    try {
      if (month.includes('-')) {
        const [year, monthNum] = month.split('-');
        if (year && monthNum) {
          const shortYear = year.length > 2 ? year.slice(-2) : year;
          return `${monthNum.padStart(2, '0')}-${shortYear}`;
        }
      }
      return month;
    } catch {
      return month;
    }
  });

  // Headers del CSV
  const headers = [
    "ID Shopify",
    "Nombre",
    "Apellido",
    "Email",
    "Total SC",
    "Total Ord",
    "Activo Carrito",
    "Vendió",
    "Activo Tienda",
    ...formattedMonths.flatMap(month => [
      `${month} SC`,
      `${month} Ord`,
    ]),
  ];

  // Filas del CSV
  const rows = data.map(row => {
    // Valores base
    const baseValues = [
      row.affiliate_shopify_customer_id || "",
      row.first_name || "",
      row.last_name || "",
      row.email || "",
      row.totals?.sharecarts || 0,
      row.totals?.orders || 0,
      row.activo_carrito ? "Sí" : "No",
      row.vendio ? "Sí" : "No",
      row.activo_tienda ? "Sí" : "No",
    ];

    // Valores mensuales
    const monthlyValues = months.map(month => [
      row.monthly?.[month]?.sharecarts || 0,
      row.monthly?.[month]?.orders || 0,
    ]).flat();

    // Combinar
    const allValues = [...baseValues, ...monthlyValues];
    
    // Escapar para CSV
    return allValues
      .map(value => {
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
  });

  // Combinar todo
  return [headers.join(','), ...rows].join('\n');
}

export async function GET() {
  try {
    console.log("📤 Iniciando exportación CSV...");
    
    const { data, stats } = await getCombinedAnalyticsData();
    
    console.log(`📤 Exportando ${data.length} registros...`);
    
    const csvContent = toCSV(data);
    
    // Nombre del archivo con fecha
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const filename = `analytics_afiliados_${dateStr}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (err) {
    console.error("❌ Export analytics error:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}
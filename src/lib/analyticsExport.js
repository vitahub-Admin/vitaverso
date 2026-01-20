// lib/analyticsExport.js

/**
 * Formatea el mes: 2025-01 → 01-25
 */
 function formatMonth(monthString) {
    if (!monthString) return '';
    
    try {
      if (monthString.includes('-')) {
        const [year, month] = monthString.split('-');
        if (year && month) {
          const shortYear = year.length > 2 ? year.slice(-2) : year;
          return `${month.padStart(2, '0')}-${shortYear}`;
        }
      }
      return monthString;
    } catch {
      return monthString;
    }
  }
  
  /**
   * Extrae los meses únicos de los datos
   */
  function extractMonthsFromData(data) {
    const set = new Set();
  
    data.forEach(row => {
      Object.keys(row.monthly || {}).forEach(month => {
        set.add(month);
      });
    });
  
    return Array.from(set).sort();
  }
  
  /**
   * Convierte datos a formato CSV - SOLO datos del frontend (sin earnings)
   */
  export function toCSV(data) {
    // Extraer y formatear meses
    const months = extractMonthsFromData(data);
    const formattedMonths = months.map(month => formatMonth(month));
    
    // Headers del CSV (exactamente como en el frontend)
    const headers = [
      "Nombre",
      "Apellido",
      "Email",
      "ID Shopify",
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
    const csvRows = data.map(row => {
      // Valores base (columnas fijas)
      const baseValues = [
        row.first_name || "",
        row.last_name || "",
        row.email || "",
        row.affiliate_shopify_customer_id || "",
        row.totals?.sharecarts || 0,
        row.totals?.orders || 0,
        row.activo_carrito ? "Sí" : "No",
        row.vendio ? "Sí" : "No",
        row.activo_tienda ? "Sí" : "No",
      ];
  
      // Valores mensuales
      const monthlyValues = months.flatMap(month => [
        row.monthly?.[month]?.sharecarts || 0,
        row.monthly?.[month]?.orders || 0,
      ]);
  
      // Combinar todos los valores
      const allValues = [...baseValues, ...monthlyValues];
  
      // Escapar valores para CSV
      return allValues
        .map(value => {
          const stringValue = String(value);
          // Si el valor contiene comas, comillas o saltos de línea, encerrarlo en comillas
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(',');
    });
  
    // Combinar headers y filas
    return [headers.join(','), ...csvRows].join('\n');
  }
  
  /**
   * Prepara datos para CSV (igual que en el frontend)
   */
  export function prepareDataForCSV(allAffiliates, activityMap) {
    return allAffiliates.map(affiliate => {
      const shopifyId = affiliate.shopify_customer_id;
      const hasActivity = activityMap[shopifyId];
      
      if (hasActivity) {
        // Afiliado CON actividad
        return {
          affiliate_shopify_customer_id: shopifyId,
          first_name: affiliate.first_name || "",
          last_name: affiliate.last_name || "",
          email: affiliate.email || "",
          totals: {
            sharecarts: hasActivity.totals.sharecarts || 0,
            orders: hasActivity.totals.orders || 0,
          },
          monthly: hasActivity.monthly || {},
          activo_carrito: (hasActivity.totals.sharecarts || 0) > 0,
          vendio: (hasActivity.totals.orders || 0) > 0,
          activo_tienda: affiliate.active_store || false,
        };
      } else {
        // Afiliado SIN actividad - CEROS en todo
        return {
          affiliate_shopify_customer_id: shopifyId,
          first_name: affiliate.first_name || "",
          last_name: affiliate.last_name || "",
          email: affiliate.email || "",
          totals: {
            sharecarts: 0,
            orders: 0,
          },
          monthly: {},
          activo_carrito: false,
          vendio: false,
          activo_tienda: affiliate.active_store || false,
        };
      }
    });
  }
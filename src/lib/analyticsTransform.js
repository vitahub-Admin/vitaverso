export function transformAnalytics(rows) {
    return rows.map(row => {
      const monthly = {};
  
      row.monthly.forEach(m => {
        monthly[m.year_month] = {
          sharecarts: m.sharecarts,
          orders: m.orders,
          earnings: m.earnings,
        };
      });
  
      return {
        affiliate_shopify_customer_id: row.affiliate_shopify_customer_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        tags: row.tags,
  
        totals: {
          sharecarts: row.total_sharecarts,
          orders: row.total_orders,
          earnings: row.total_earnings,
        },
  
        monthly,
      };
    });
  }
  
export const ANALYTICS_QUERY = `
/* =========================
   1. SHARECARTS BASE
==========================*/
WITH SHARECARTS_BASE AS (
  SELECT
    sh.customer_id AS specialist_id,
    FORMAT_DATE('%Y-%m', DATE(sh.created_at)) AS year_month,
    sh.code,
    CASE
      WHEN o.order_number IS NOT NULL THEN "Completed"
      ELSE "Pending"
    END AS status
  FROM \`vitahub-435120.sharecart.carritos\` sh
  LEFT JOIN \`vitahub-435120.silver.orders\` o
    ON sh.code = o.share_cart
  WHERE sh.customer_id IS NOT NULL
),

SHARECARTS_MONTHLY AS (
  SELECT
    specialist_id,
    year_month,
    COUNT(DISTINCT code) AS sharecarts,
    COUNTIF(status = "Completed") AS completed_sharecarts,
    COUNTIF(status = "Pending") AS pending_sharecarts
  FROM SHARECARTS_BASE
  GROUP BY specialist_id, year_month
),

ORDEN_PRODUCTO AS (
  SELECT
    COALESCE(o.specialist_ref, o.referrer_id) AS specialist_id,
    FORMAT_DATE('%Y-%m', DATE(o.created_at)) AS year_month,
    o.order_number,
    o.line_items_quantity,
    o.line_items_price,
    o.discount_allocations_amount,
    p.variant_id,
    pc.comission,
    ROW_NUMBER() OVER (
      PARTITION BY o.order_number, p.variant_id
      ORDER BY
        CASE WHEN pc.updated_at <= o.created_at THEN 0 ELSE 1 END,
        pc.updated_at DESC
    ) AS rn
  FROM \`vitahub-435120.silver.orders\` o
  LEFT JOIN \`vitahub-435120.silver.product\` p
    ON o.line_items_sku = p.variant_sku
   AND o.line_items_product_id = p.id
  LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pc
    ON pc.variant_id = p.variant_id
  WHERE o.customer_email IS NOT NULL
    AND LOWER(o.line_items_name) NOT LIKE '%tip%'
    AND COALESCE(o.specialist_ref, o.referrer_id) IS NOT NULL
),

ORDENES_LIMPIAS AS (
  SELECT
    specialist_id,
    year_month,
    order_number,
    SUM(
      (line_items_price * line_items_quantity)
      - COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
    ) AS net_amount,
    SUM(
      (
        (line_items_price * line_items_quantity)
        - COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
      ) * COALESCE(comission, 0)
    ) AS earning
  FROM ORDEN_PRODUCTO
  WHERE rn = 1
  GROUP BY specialist_id, year_month, order_number
),

ORDENES_MONTHLY AS (
  SELECT
    specialist_id,
    year_month,
    COUNT(DISTINCT order_number) AS orders,
    SUM(earning) AS earnings
  FROM ORDENES_LIMPIAS
  GROUP BY specialist_id, year_month
),

MONTHLY AS (
  SELECT
    COALESCE(sc.specialist_id, o.specialist_id) AS specialist_id,
    COALESCE(sc.year_month, o.year_month) AS year_month,
    COALESCE(sc.sharecarts, 0) AS sharecarts,
    COALESCE(o.orders, 0) AS orders,
    COALESCE(o.earnings, 0) AS earnings
  FROM SHARECARTS_MONTHLY sc
  FULL OUTER JOIN ORDENES_MONTHLY o
    ON sc.specialist_id = o.specialist_id
   AND sc.year_month = o.year_month
),

TOTALS AS (
  SELECT
    specialist_id,
    SUM(sharecarts) AS total_sharecarts,
    SUM(orders) AS total_orders,
    SUM(earnings) AS total_earnings
  FROM MONTHLY
  GROUP BY specialist_id
)

SELECT
  c.id AS affiliate_shopify_customer_id,
  c.first_name,
  c.last_name,
  c.email,
  c.tags,
  t.total_sharecarts,
  t.total_orders,
  t.total_earnings,
  ARRAY_AGG(
    STRUCT(
      m.year_month,
      m.sharecarts,
      m.orders,
      m.earnings
    )
    ORDER BY m.year_month
  ) AS monthly
FROM TOTALS t
JOIN MONTHLY m
  ON m.specialist_id = t.specialist_id
LEFT JOIN \`vitahub-435120.Shopify.customers\` c
  ON c.id = t.specialist_id
GROUP BY
  affiliate_shopify_customer_id,
  c.first_name,
  c.last_name,
  c.email,
  c.tags,
  t.total_sharecarts,
  t.total_orders,
  t.total_earnings
ORDER BY t.total_earnings DESC
`;

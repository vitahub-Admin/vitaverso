import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔐 SUPABASE ADMIN CLIENT (Service Role)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Campos permitidos para ordenar (protección básica)
const ALLOWED_ORDER_FIELDS = [
  "created_at",
  "updated_at",
  "email",
  "first_name",
  "last_name",
  "status",
  "profession"
];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    // ========= PARÁMETROS =========
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = (page - 1) * limit;

    const status = searchParams.get("status");
    const profession = searchParams.get("profession");

    const search = searchParams.get("search");
    const searchField = searchParams.get("searchField") || "all";

    const orderByRaw = searchParams.get("orderBy") || "created_at";
    const orderBy = ALLOWED_ORDER_FIELDS.includes(orderByRaw)
      ? orderByRaw
      : "created_at";

    const order = searchParams.get("order") === "asc" ? "asc" : "desc";

    const createdAfter = searchParams.get("createdAfter");
    const createdBefore = searchParams.get("createdBefore");

    // ========= SELECT INTELIGENTE =========
    const trimmedSearch = search?.trim();

const isNumeric = trimmedSearch && /^\d+$/.test(trimmedSearch);

const isSearchMode =
  trimmedSearch &&
  (
    trimmedSearch.length >= 2 && !isNumeric // texto mínimo 2
    ||
    isNumeric && trimmedSearch.length >= 4 // número mínimo 4
  );

    const selectFields = isSearchMode
      ? `
        id,
        first_name,
        last_name,
        email,
        phone,
        status,
        shopify_customer_id,
        referral_id,
        created_at,
        clabe_interbancaria,
        vambe_contact_id
      `
      : "*";

    let query = supabase
      .from("affiliates")
      .select(selectFields, isSearchMode ? {} : { count: "exact" });

    // ========= FILTROS SIMPLES =========
    if (status) query = query.eq("status", status);
    if (profession) query = query.eq("profession", profession);

    // ========= BÚSQUEDA =========
 if (isSearchMode) {
  if (isNumeric) {
    const numSearch = Number(trimmedSearch);
    query = query.eq("shopify_customer_id", numSearch);
  } else {
    const searchTerm = `%${trimmedSearch}%`;

    query = query.or(
      `email.ilike.${searchTerm},` +
      `first_name.ilike.${searchTerm},` +
      `last_name.ilike.${searchTerm},` +
      `phone.ilike.${searchTerm},` +
      `referral_id.ilike.${searchTerm}`
    );
  }
}
    // ========= FILTROS POR FECHA =========
    if (createdAfter) query = query.gte("created_at", createdAfter);
    if (createdBefore) query = query.lte("created_at", createdBefore);

    // ========= EJECUCIÓN =========
    const { data, error, count } = await query
      .order(orderBy, { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("❌ Error Supabase:", error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        pagination: isSearchMode
          ? null
          : {
              page,
              limit,
              total: count,
              totalPages: Math.ceil(count / limit),
              hasNextPage: offset + limit < count,
              hasPrevPage: page > 1
            },
        filters: {
          status,
          profession,
          search: search || null,
          searchField,
          orderBy,
          order,
          dateRange: { createdAfter, createdBefore }
        }
      }
    });

  } catch (error) {
    console.error("❌ GET /admin/affiliates:", error.message);

    return NextResponse.json(
      { success: false, error: "Error obteniendo afiliados" },
      { status: 500 }
    );
  }
}

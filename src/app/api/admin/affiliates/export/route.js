import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function getAllAffiliates() {
  const PAGE_SIZE = 1000;
  let allAffiliates = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("affiliates")
      .select(`
        id,
        email,
        first_name,
        last_name,
        phone,
        profession,
        patient_count,
        social_media,
        referral_id,
        status,
        clabe_interbancaria,
        shopify_customer_id,
        shopify_collection_id,
        active_store,
        city,
        state,
        address,
        created_at
      `)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    allAffiliates = [...allAffiliates, ...data];

    if (data.length < PAGE_SIZE) break;

    page++;
  }

  return allAffiliates;
}

export async function GET() {
  try {
    const data = await getAllAffiliates();

    const headers = Object.keys(data[0] || {});
    const csvRows = [headers.join(",")];

    for (const row of data) {
      const values = headers.map((header) => {
        const val = row[header] ?? "";
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(","));
    }

    const csv = csvRows.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=affiliates.csv",
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { success: false, error: "Error exportando afiliados" },
      { status: 500 }
    );
  }
}
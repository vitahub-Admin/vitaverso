import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  try {

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
      .order("created_at", { ascending: false });

    if (error) throw error;

    // convertir a CSV
    const headers = Object.keys(data[0] || {});
    const csvRows = [];

    csvRows.push(headers.join(","));

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
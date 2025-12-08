import { cookies } from "next/headers";
import VitahuberPageClient from "./components/VitahuberPageClient";

export default async function Page() {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("customerId")?.value;

  console.log("🔵 SERVER customerId:", customerId);

  if (!customerId) {
    console.log("⚠️ No hay customerId → usuario sin carritos.");
    return <VitahuberPageClient carts={[]} />;
  }

  let carts = [];

  try {
    const res = await fetch(
      `https://pro.vitahub.mx/api/sharecart?customerId=${customerId}`,
      {
        method: "GET",
        credentials: "include", // 🔵 mantiene el token
        cache: "no-store",
      }
    );

    const text = await res.text();
    console.log("🔵 RAW RESPONSE:", text);

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    const data = JSON.parse(text);

    if (Array.isArray(data?.carts)) {
      carts = data.carts;
    }

  } catch (err) {
    console.error("❌ Error cargando carritos:", err);
  }

  return <VitahuberPageClient carts={carts} />;
}

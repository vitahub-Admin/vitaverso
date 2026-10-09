// GET /api/customer-app/me
// Perfil del cliente + su especialista (metafield de cliente custom.referido → affiliates)
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase, shopifyAdmin, getAppUser } from "@/lib/customerSupplements";

const PRO_URL = "https://pro.vitahub.mx";

// wa.me necesita solo dígitos con código de país; los números de 10 dígitos son de México
function whatsappUrl(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${full}`;
}

// social_media a veces es "@usuario" o un dominio sin protocolo
function socialUrl(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("@")) return `https://instagram.com/${v.slice(1)}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return `https://${v}`;
  return null;
}

async function loadSpecialist(specialistShopifyId) {
  const [{ data: aff }, { data: booking }] = await Promise.all([
    supabase
      .from("affiliates")
      .select("id, first_name, last_name, email, phone, profession, social_media")
      .eq("shopify_customer_id", specialistShopifyId)
      .maybeSingle(),
    supabase
      .from("booking_affiliates")
      .select("slug, display_name, photo_url, bio, specialty, is_active")
      .eq("shopify_customer_id", specialistShopifyId)
      .maybeSingle(),
  ]);
  if (!aff) return null;

  const bookingActive = booking?.is_active && booking?.slug;
  return {
    id: aff.id,
    firstName: aff.first_name,
    lastName: aff.last_name,
    displayName: booking?.display_name || [aff.first_name, aff.last_name].filter(Boolean).join(" "),
    email: aff.email || null,
    phone: aff.phone || null,
    whatsappUrl: whatsappUrl(aff.phone),
    profession: booking?.specialty || aff.profession || null,
    bio: booking?.bio || null,
    photoUrl: booking?.photo_url || null,
    socialUrl: socialUrl(aff.social_media),
    bookingUrl: bookingActive ? `${PRO_URL}/book/${booking.slug}` : null,
  };
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const appUser = await getAppUser(payload.userId);
    if (!appUser) return unauthorized();

    let customer = {
      id: appUser.id,
      firstName: appUser.first_name ?? null,
      lastName: appUser.last_name ?? null,
      email: appUser.email ?? payload.email,
      phone: appUser.phone ?? null,
      shopifyLinked: !!appUser.shopify_customer_id,
    };

    let specialistShopifyId = appUser.specialist_shopify_id ?? null;

    if (appUser.shopify_customer_id) {
      try {
        const data = await shopifyAdmin(
          `query customerMe($id: ID!) {
            customer(id: $id) {
              firstName lastName email phone
              referido: metafield(namespace: "custom", key: "referido") { value }
            }
          }`,
          { id: `gid://shopify/Customer/${appUser.shopify_customer_id}` }
        );
        const sc = data?.customer;
        if (sc) {
          customer = {
            ...customer,
            firstName: sc.firstName ?? customer.firstName,
            lastName: sc.lastName ?? customer.lastName,
            email: sc.email ?? customer.email,
            phone: sc.phone ?? customer.phone,
          };
          const ref = Number(sc.referido?.value);
          if (ref && ref !== Number(appUser.specialist_shopify_id)) {
            specialistShopifyId = ref;
            await supabase
              .from("customer_app_users")
              .update({ specialist_shopify_id: ref })
              .eq("id", appUser.id);
          }
        }
      } catch (err) {
        // Si Shopify falla seguimos con lo guardado en Supabase
        console.error("customer-app/me shopify error:", err.message);
      }
    }

    const specialist = specialistShopifyId ? await loadSpecialist(specialistShopifyId) : null;

    return NextResponse.json({ ok: true, customer, specialist });
  } catch (err) {
    console.error("customer-app/me error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}

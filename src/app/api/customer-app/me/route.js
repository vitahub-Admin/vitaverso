// GET /api/customer-app/me
// Perfil del cliente + su especialista (metafield de cliente custom.referido → affiliates)
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized, signAppCustomerToken, shouldRenewAppToken } from "@/lib/customerAppAuth";
import { supabase, shopifyAdmin, getAppUser } from "@/lib/customerSupplements";
import { ensureShopifyLink } from "@/lib/customerAppAccount";

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
      .select("id, first_name, last_name, email, phone, profession, social_media, shopify_collection_id")
      .eq("shopify_customer_id", specialistShopifyId)
      .maybeSingle(),
    supabase
      .from("booking_affiliates")
      .select("slug, display_name, photo_url, bio, specialty, is_active")
      .eq("shopify_customer_id", specialistShopifyId)
      .maybeSingle(),
  ]);
  if (!aff) return null;

  // Foto y tienda: la colección de Shopify del especialista (la misma de "Mi Tienda" en Vitahub Pro)
  let collection = null;
  if (aff.shopify_collection_id) {
    try {
      const data = await shopifyAdmin(
        `query specialistCollection($id: ID!) {
          collection(id: $id) { handle image { url } }
        }`,
        { id: `gid://shopify/Collection/${aff.shopify_collection_id}` }
      );
      collection = data?.collection ?? null;
    } catch (err) {
      console.error("customer-app/me colección del especialista:", err.message);
    }
  }

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
    photoUrl: collection?.image?.url || booking?.photo_url || null,
    storeUrl: collection?.handle ? `https://vitahub.mx/collections/${collection.handle}` : null,
    socialUrl: socialUrl(aff.social_media),
    bookingUrl: bookingActive ? `${PRO_URL}/book/${booking.slug}` : null,
  };
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    let appUser = await getAppUser(payload.userId);
    if (!appUser) return unauthorized();

    // Se registró antes de comprar: si ya aparece en Shopify con su correo, se vincula
    appUser = await ensureShopifyLink(appUser);

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

    // Sesión renovable: token nuevo cuando el actual ya pasó la mitad de su vida útil
    const token = shouldRenewAppToken(payload)
      ? signAppCustomerToken(appUser.id, appUser.email ?? payload.email, appUser.shopify_customer_id)
      : undefined;

    return NextResponse.json({ ok: true, customer, specialist, ...(token ? { token } : {}) });
  } catch (err) {
    console.error("customer-app/me error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}

// DELETE /api/customer-app/me
// Elimina la cuenta de la app (requisito de Apple y Google): perfil, seguimiento de
// suplementos, horarios, push token y códigos de acceso. NO toca la cuenta ni los
// pedidos en Shopify (la tienda los necesita para facturación y envíos).
export async function DELETE(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return NextResponse.json({ ok: true });

    const steps = [
      supabase.from("supplement_tracking").delete().eq("user_id", user.id),
      user.email ? supabase.from("customer_app_login_codes").delete().eq("email", user.email) : null,
    ].filter(Boolean);
    for (const step of steps) {
      const { error } = await step;
      if (error) throw new Error(error.message);
    }

    const { error } = await supabase.from("customer_app_users").delete().eq("id", user.id);
    if (error) throw new Error(error.message);

    console.log(`[customer-app] cuenta eliminada ${user.id}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/me DELETE error:", err);
    return NextResponse.json({ ok: false, error: "No se pudo eliminar la cuenta. Intenta de nuevo." }, { status: 500 });
  }
}

// PATCH /api/customer-app/me  { firstName, lastName, phone }
export async function PATCH(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const body = await req.json();
    const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const fields = {};
    if (body.firstName !== undefined) fields.first_name = clean(body.firstName, 60) || null;
    if (body.lastName !== undefined) fields.last_name = clean(body.lastName, 60) || null;
    if (body.phone !== undefined) fields.phone = clean(body.phone, 20) || null;

    if (fields.first_name === null) {
      return NextResponse.json({ ok: false, error: "Escribe tu nombre" }, { status: 400 });
    }
    if (!Object.keys(fields).length) return NextResponse.json({ ok: true });

    const { error } = await supabase
      .from("customer_app_users")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", payload.userId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/me PATCH error:", err);
    return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 });
  }
}

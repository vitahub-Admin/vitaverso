"use client";

import RequireTag from "@/app/components/RequireTag";

export default function VitahuberPageClient({ carts = [] }) {
  // Log para ver cómo llega la data
  console.log("🟦 CARRITOS EN CLIENT:", carts);

  return (
    <RequireTag tag="vitahuber">
      <div className="p-6">
        <h1 className="text-3xl">Bienvenido Vitahuber</h1>
        <p>Solo usuarios con el tag "vitahuber" pueden ver esto.</p>

        <div className="mt-6 space-y-6">
          {carts.length === 0 && (
            <p className="text-gray-500 text-sm">
              No tienes carritos creados todavía.
            </p>
          )}

          {carts.map((cart) => (
            <div
              key={cart.id}
              className="border rounded-lg p-4 bg-white shadow-sm"
            >
              <h2 className="text-lg font-bold">{cart.name}</h2>
              <p className="text-sm text-gray-500">Tel: {cart.phone}</p>
              <p className="text-xs text-gray-400">Token: {cart.token}</p>

              <div className="mt-4 space-y-3">
                {cart.products?.map((p, i) => (
                  <div
                    key={i}
                    className="p-3 border rounded-md bg-gray-50"
                  >
                    <p className="font-medium">{p.product_title}</p>
                    <p className="text-sm text-gray-600">{p.variant_title}</p>

                    {p.custom_fields?.dosis && (
                      <p className="text-xs mt-1">💊 Dosis: {p.custom_fields.dosis}</p>
                    )}

                    {p.custom_fields?.momentos && (
                      <p className="text-xs">🕒 Momento: {p.custom_fields.momentos}</p>
                    )}

                    <p className="text-xs text-gray-400 mt-1">
                      Cantidad: {p.quantity}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </RequireTag>
  );
}

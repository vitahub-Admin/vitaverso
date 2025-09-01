"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";

export default function MiTiendaPage() {
  const [collection, setCollection] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) {
      setError("No hay customerId disponible");
      return;
    }

    // Fetch a sheet
    fetch(`/api/sheet/${customerId}`)
      .then((res) => res.json())
      .then((sheetData) => {
        if (!sheetData.success) {
          setError(sheetData.message);
          return;
        }

        const collectionId = sheetData.data[1]; // columna B para sacar el id

        // Fetch a Shopify
        fetch(`/api/shopify/collections/${collectionId}`)
          .then((res) => res.json())
          .then((shopifyData) => {
            if (!shopifyData.success) {
              setError("No se encontró la colección en Shopify");
              return;
            }
            setCollection(shopifyData.data.custom_collection);
          })
          .catch((err) => setError(err.message));
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!collection) return <p>Cargando colección...</p>;

  const shopifyLink = `https://vitahub.mx/collections/${collection.handle}`;
  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(
    `Mira esta colección: ${collection.title} ${shopifyLink}`
  )}`;

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl md:text-4xl text-center text-[#1b3f7a] mb-12 font-lato">
        Mi Tienda
      </h1>

      <div className="bg-white border border-[#1b3f7a] rounded-[5px] p-6 shadow-md flex flex-col items-center gap-4 max-w-sm w-full">
        <h2 className="text-2xl font-bold text-center text-[#1b3f7a]">
          {collection.title}
        </h2>
        <div className="flex flex-col gap-3 w-full">
          <a
            href={shopifyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-white bg-[#1b3f7a] rounded hover:bg-[#16406a] text-center"
          >
            Ir a la tienda
          </a>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-center"
          >
            Compartir por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}

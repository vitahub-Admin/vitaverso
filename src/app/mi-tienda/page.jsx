"use client";

import { useEffect, useState, useRef } from "react";
import Cookies from "js-cookie";
import Image from "next/image";
import { Copy, Check, ExternalLink, X } from "lucide-react";
import Banner from "../components/Banner";

export default function MiTiendaPage() {
  const [collection, setCollection] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [socialUrl, setSocialUrl] = useState("");

  const fileInputRef = useRef(null);

  // ---- Helper para limpiar HTML ----
  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || "";
  }

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) {
      setError("No hay customerId disponible");
      return;
    }

    fetch(`/api/sheet/${customerId}`)
      .then((res) => res.json())
      .then((sheetData) => {
        if (!sheetData.success) {
          setError(sheetData.message);
          return;
        }

        const collectionId = sheetData.data[1];
        fetch(`/api/shopify/collections/${collectionId}`)
          .then((res) => res.json())
          .then((shopifyData) => {
            if (!shopifyData.success) {
              setError("No se encontró la colección en Shopify");
              return;
            }

            const col = shopifyData.collection;

            // convertimos descriptionHtml → texto plano
            const plainDescription = stripHtml(col.descriptionHtml);

            setCollection({
              ...col,
              description: plainDescription,
            });
            setSocialUrl(col.socialMediaUrl?.value || "");

            setProducts(shopifyData.products);
          })
          .catch((err) => setError(err.message));
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!collection) return <p>Cargando colección...</p>;

  const customerId = Cookies.get("customerId");
  const shopifyLink = `https://vitahub.mx/collections/${collection.handle}?sref=${customerId}`;
  const whatsappText = `Mira esta colección: ${collection.title} ${shopifyLink}`;
  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  const imageUrl = previewUrl || collection.image?.src;
  const altText = collection.image?.alt || collection.title;

  // ---------------- Upload imagen ----------------
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ["image/webp", "image/png", "image/jpeg"];
    if (!validTypes.includes(file.type)) {
      alert("Formato no válido. Solo se aceptan webp, jpg y png.");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const simpleId =
        typeof collection.id === "string"
          ? collection.id.split("/").pop()
          : collection.id;

      const response = await fetch(
        `/api/shopify/collections/${simpleId}/update`,
        { method: "POST", body: formData }
      );

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Error al subir la imagen");
        return;
      }

      setCollection((prev) => ({
        ...prev,
        image: {
          src: data.imageUrl || previewUrl,
          alt: prev.image?.alt || collection.title,
        },
      }));

      setSelectedFile(null);
      setPreviewUrl(null);
      setToast("Imagen subida exitosamente ✅");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setError("Error de conexión: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // ---------------- Quitar producto ----------------
  const handleRemoveProduct = async (productId) => {
    if (!confirm("¿Seguro querés quitar este producto de la colección?")) return;

    try {
      const simpleId = collection.id.split("/").pop();
      const response = await fetch(
        `/api/shopify/collections/${simpleId}/remove-product`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        alert("No se pudo quitar el producto: " + JSON.stringify(data.error));
        return;
      }

      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setToast("Producto eliminado ✅");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      alert("Error de conexión: " + err.message);
    }
  };

  // ---------------- Guardar title / description ----------------
  const handleSaveInfo = async () => {
  try {
    const simpleId =
      typeof collection.id === "string"
        ? collection.id.split("/").pop()
        : collection.id;

    const res = await fetch(
      `/api/shopify/collections/${simpleId}/update-info`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: collection.title,
          body_html: `<p>${collection.description}</p>`,
          social_url: socialUrl,
        }),
      }
    );

    const data = await res.json();
console.log("Response status:", res.status);

  if (!data.success) {
  console.log("ERROR BACKEND:", data);
  alert("Error al actualizar la colección: " + JSON.stringify(data));
  return;
}


    setToast("Colección actualizada ✅");
    setTimeout(() => setToast(null), 3000);
  } catch (err) {
    alert("Error de conexión: " + err.message);
  }
};

  // ---------------- Copiar enlace ----------------
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shopifyLink);
      setCopied(true);
      setToast("Enlace copiado al portapapeles ✅");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setToast("Error al copiar el enlace");
    }
  };

  // ---------------- Modal de compartir ----------------
  const ShareModal = () => {
    if (!showShareModal) return null;

    return (
      <div className="fixed inset-0 bg-[#1b3f7a]/30 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative">
          {/* Botón cerrar */}
          <button
            onClick={() => setShowShareModal(false)}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>

          {/* Título */}
          <h3 className="text-2xl font-bold text-[#1b3f7a] mb-6 text-center">
            Compartir tu tienda
          </h3>

          {/* Enlace para copiar */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2 flex items-center gap-1">
              <Copy size={16} />
              Copia este link y compártelo
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 border border-gray-300 rounded-lg px-4 py-3 bg-gray-50 overflow-x-auto">
                <code className="text-sm text-gray-800 break-all">
                  {shopifyLink}
                </code>
              </div>
              <button
                onClick={handleCopyLink}
                className="flex-shrink-0 px-4 py-3 bg-blue-100 text-[#1b3f7a] rounded-lg hover:bg-blue-200 flex items-center gap-2"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          {/* Texto para WhatsApp */}
          <div className="mb-8">
            <p className="text-sm text-gray-600 mb-2">
              Envía este mensaje con el enlace de tu tianda por Whastapp
            </p>
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <p className="text-gray-700">{whatsappText}</p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowShareModal(false)}
              className="px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 text-center flex items-center justify-center gap-2"
            >
              <span>Compartir por WhatsApp</span>
            </a>

            <button
              onClick={() => setShowShareModal(false)}
              className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>

          {/* Mensaje de ayuda */}
          <p className="text-xs text-gray-500 mt-6 text-center">
            Copia y comparte tu tienda con quien quieras
          </p>
        </div>
      </div>
    );
  };

  // ---------------- RENDER ----------------

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header */}
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=iL0j9PLsTjw" />
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">Mi Tienda</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-2 justify-center">
        {/* Card principal */}
        <div className="bg-white border border-[#1b3f7a] rounded-xl p-6 shadow-xl flex flex-col items-center gap-6 max-w-[400px]">
          {/* Imagen */}
          <div className="border rounded-xl p-4 flex flex-col items-center w-full shadow-lg hover:shadow-xl transition">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={altText}
                width={300}
                height={300}
                className="w-full h-auto object-contain rounded-lg imagen-mitienda"
              />
            ) : (
              <div className="w-full h-64 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg">
                No tiene imagen
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 w-full">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".webp,.jpg,.jpeg,.png"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="px-4 py-2 w-full bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                {selectedFile ? "Imagen seleccionada ✅" : "Seleccionar imagen"}
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-4 py-2 w-full bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {uploading ? "Subiendo..." : "Subir imagen"}
              </button>
            </div>
          </div>

          {/* Info colección */}
          <h2 className="text-2xl font-bold text-center text-[#1b3f7a]">
            {collection.title}
          </h2>

          {/* Editar título y descripción */}
          <div className="w-full flex flex-col gap-2 items-center mt-4">
            <input
              type="text"
              value={collection.title}
              onChange={(e) =>
                setCollection((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Título de la colección"
              className="border rounded-md px-3 py-2 w-full text-center focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]"
            />
<input
  type="url"
  value={socialUrl}
  onChange={(e) => setSocialUrl(e.target.value)}
  placeholder="https://instagram.com/tuusuario"
  className="border rounded-md px-3 py-2 w-full text-center focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]"
/>

<p className="text-xs text-gray-500 text-center">
  Agrega el enlace a tu red social (Instagram, TikTok, Facebook, etc).
</p>

            <textarea
              value={collection.description || ""}
              onChange={(e) =>
                setCollection((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Breve descripción / bio"
              className="border rounded-md px-3 py-2 w-full resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]"
            />

            <button
              onClick={handleSaveInfo}
              className="mt-2 bg-[#1b3f7a] text-white px-4 py-2 rounded hover:bg-[#16406a]"
            >
              Guardar cambios
            </button>
          </div>

          {/* Botones */}
          <div className="flex flex-row gap-3 w-full mt-4">
            <a
              href={shopifyLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 text-white bg-[#1b3f7a] rounded hover:bg-[#16406a] text-center flex items-center justify-center gap-2"
            >
              <ExternalLink size={18} />
              Ir a la tienda
            </a>

            <button
              onClick={() => setShowShareModal(true)}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-center flex items-center justify-center gap-2"
            >
              <span>Compartir</span>
            </button>
          </div>
        </div>

        {/* Tutorial */}
        <div className="flex flex-col gap-4 max-w-[400px]">
          <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-[#1b3f7a] mb-2">
              Cambiar la imagen
            </h3>
            <p className="text-sm text-gray-700 leading-snug">
              Para cambiar la imagen de tu tienda, haz click en{" "}
              <span className="font-semibold">Seleccionar imagen</span>. Recomendamos una imagen cuadrada. Luego presiona{" "}
              <span className="font-semibold">Subir imagen</span>.
            </p>
          </div>

          <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-[#1b3f7a] mb-2">
              Visitar o compartir tu tienda
            </h3>
            <p className="text-sm text-gray-700 leading-snug">
              <span className="font-semibold">Ir a la tienda</span> abre tu mini tienda.  
              <span className="font-semibold">Compartir</span> te permite enviarla por WhatsApp o copiar el enlace.
            </p>
          </div>

          <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-md">
            <h3 className="font-semibold text-[#1b3f7a] mb-2">
              Productos de tu tienda
            </h3>
            <p className="text-sm text-gray-700 leading-snug">
              Aquí puedes quitar productos que no quieras mostrar. Para agregar nuevos, hazlo desde la tienda principal.
            </p>
          </div>
        </div>
      </div>

      {/* Header productos */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">
          Productos ({products?.length || 0})
        </h1>
      </div>

      {/* Productos */}
      <div className="flex flex-wrap justify-center gap-4 w-full mt-2">
        {products?.map((p) => {
          const productLink = `https://vitahub.mx/products/${p.handle}?sref=${customerId}`;
          const imageUrl = p.images?.edges?.[0]?.node?.src;
          const price = p.variants?.edges?.[0]?.node?.price;

          return (
            <div
              key={p.id}
              className="border border-[#1b3f7a] rounded-xl p-3 flex flex-col items-center shadow-lg hover:shadow-xl transition max-w-[250px] w-full text-sm leading-snug"
            >
              {imageUrl && (
                <a href={productLink} target="_blank" rel="noopener noreferrer">
                  <Image
                    src={imageUrl}
                    alt={p.title}
                    width={150}
                    height={150}
                    className="object-contain rounded-lg"
                  />
                </a>
              )}

              <h4 className="text-center mt-2 text-sm">{p.title}</h4>

              {price && (
                <p className="text-[#1b3f7a] text-xl font-semibold mt-1">
                  ${price}
                </p>
              )}

              <button
                onClick={() => handleRemoveProduct(p.id)}
                className="mt-auto px-3 py-1 text-white bg-red-500 rounded hover:bg-red-600"
              >
                Quitar
              </button>
            </div>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Modal de compartir */}
      <ShareModal />
    </div>
  );
}
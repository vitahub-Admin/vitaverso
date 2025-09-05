"use client";

import { useEffect, useState, useRef } from "react";
import Cookies from "js-cookie";
import Image from "next/image";

export default function MiTiendaPage() {
  const [collection, setCollection] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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

        const collectionId = sheetData.data[1]; // columna B
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
  const customerId = Cookies.get("customerId");
  const shopifyLink = `https://vitahub.mx/collections/${collection.handle}?sref=${customerId}`;
  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(
    `Mira esta colección: ${collection.title} ${shopifyLink}`
  )}`;

  const imageUrl = previewUrl || collection.image?.src;
  const altText = collection.image?.alt || collection.title;

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
      const response = await fetch(
        `/api/shopify/collections/${collection.id}/update`,
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
      alert("Imagen subida exitosamente!");
    } catch (err) {
      setError("Error de conexión: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <h1 className="text-3xl md:text-4xl text-center text-[#1b3f7a] mb-12 font-lato">
        Mi Tienda
      </h1>

      <div className="bg-white border border-[#1b3f7a] rounded-xl p-6 shadow-xl flex flex-col items-center gap-6 max-w-md w-full ">
        {/* Imagen */}
        <div className="border rounded-xl  p-4 flex flex-col items-center w-full shadow-lg hover:shadow-xl transition">
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

          {/* Botones de carga */}
          <div className="mt-4 flex flex-col gap-3 w-full">
            {/* Oculto */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".webp,.jpg,.jpeg,.png"
              className="hidden"
            />

            {/* Botón para seleccionar */}
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="px-4 py-2 w-full bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              {selectedFile ? "Imagen seleccionada ✅" : "Seleccionar imagen"}
            </button>

            {/* Botón para subir */}
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="px-4 py-2 w-full bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {uploading ? "Subiendo..." : "Subir imagen"}
            </button>
          </div>
        </div>

        {/* Info de la colección */}
        <h2 className="text-2xl font-bold text-center text-[#1b3f7a]">
          {collection.title}
        </h2>

        <div className="flex flex-row gap-3 w-full">
          <a
            href={shopifyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2 text-white bg-[#1b3f7a] rounded hover:bg-[#16406a] text-center"
          >
            Ir a la tienda
          </a>
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-center"
          >
            Compartir
          </a>
        </div>
      </div>
    </div>
  );
}

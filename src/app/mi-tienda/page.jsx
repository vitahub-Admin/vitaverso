"use client";

import { useEffect, useState,useRef } from "react";
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
            console.log(shopifyData.data.custom_collection)
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


  const imageUrl = collection.image?.src;
  const altText = collection.image?.alt || collection.title;

  const handleButtonClick = () => {
    // Dispara el input oculto
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tipo de archivo
    const validTypes = ["image/webp", "image/png", "image/jpeg"];
    if (!validTypes.includes(file.type)) {
      alert("Formato no válido. Solo se aceptan webp, jpg y png.");
      return;
    }

    console.log("Archivo válido seleccionado:", file);
    // Aquí después harías el fetch a tu API para subirlo a Shopify
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }
 // En tu componente, actualiza handleUpload:
const handleUpload = async () => {
  if (!selectedFile) return;

  setUploading(true);
  setError(null); // Limpiar errores previos

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch(`/api/shopify/collections/${collection.id}/update`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!data.success) {
      setError(data.error || "Error al subir la imagen");
      console.error("Error details:", data.details);
      return;
    }

    // Actualizar con la URL real de Shopify (no la preview)
    setCollection((prev) => ({
      ...prev,
      image: { 
        src: data.imageUrl || previewUrl,
        alt: prev.image?.alt || collection.title
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

      <div className="bg-white border border-[#1b3f7a] rounded-[5px] p-6 shadow-md flex flex-row items-center gap-4 max-w-sm w-full">
      <div className="border rounded-xl shadow p-4 flex flex-col items-center">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={altText}
          width={400}
          height={400}
          className="w-full h-auto object-contain rounded-lg"
        />
      ) : (
        <div className="w-full h-48 flex items-center justify-center bg-gray-100 text-gray-500 rounded-lg">
          No tiene imagen
        </div>
      )}
        <div>
     
        <input
            type="file"
            accept=".webp,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="mt-2"
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {uploading ? "Subiendo..." : "Subir imagen"}
          </button>
    </div>
    </div>
    <div>
          <h2 className="text-2xl font-bold text-center text-[#1b3f7a]">
          {collection.title}
        </h2>
        <div className="flex flex-row gap-3 w-full">
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
    </div>
  );
}

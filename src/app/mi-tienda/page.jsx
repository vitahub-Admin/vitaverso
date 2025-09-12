"use client";

import { useEffect, useState, useRef } from "react";
import Cookies from "js-cookie";
import Image from "next/image";

export default function MiTiendaPage() {
  const [collection, setCollection] = useState(null);
  const [products, setProducts] = useState(null);
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
            setCollection(shopifyData.collection);
            setProducts(shopifyData.products);
            console.log(shopifyData.collection);
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
      const simpleId = collection.id.split("/").pop(); // "640990183745"
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
      alert("Imagen subida exitosamente!");
    } catch (err) {
      setError("Error de conexión: " + err.message);
    } finally {
      setUploading(false);
    }
  };
  const handleRemoveProduct = async (productId) => {
    if (!confirm("¿Seguro querés quitar este producto de la colección?")) return;
  
    try {
      console.log(collection.id)
      const simpleId = collection.id.split("/").pop(); // "640990183745"
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
  
      // Actualizamos el estado local para que desaparezca de la UI
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      alert("Error de conexión: " + err.message);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full  bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
  {/* Título */}
  <h1 className="text-3xl md:text-4xl text-white font-lato">
  Mi Tienda
  </h1>
</div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-2 justify-center">
  {/* Columna izquierda: card principal */}
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

      {/* Botones de carga */}
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

  {/* Columna derecha: tutorial */}
  <div className="flex flex-col gap-4 max-w-[400px]">
    {/* Caja 1 */}
    <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-md">
      <h3 className="font-semibold text-[#1b3f7a] mb-2">Cambiar la imagen</h3>
      <p className="text-sm text-gray-700 leading-snug">
        Para cambiar la imagen de tu tienda, haz click en{" "}
        <span className="font-semibold">Seleccionar imagen</span>.  
        Recomendamos usar una imagen cuadrada.  
        Una vez elegida, presiona{" "}
        <span className="font-semibold">Subir imagen</span> y espera unos segundos
        hasta ver el mensaje de carga exitosa.
      </p>
    </div>

    {/* Caja 2 */}
    <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-md">
      <h3 className="font-semibold text-[#1b3f7a] mb-2">Visitar o compartir tu tienda</h3>
      <p className="text-sm text-gray-700 leading-snug">
        El botón <span className="font-semibold">Ir a la tienda</span> abre tu
        mini tienda en el sitio.  
        El botón <span className="font-semibold">Compartir</span> te permite
        enviarla fácilmente por WhatsApp a tus contactos.
      </p>
    </div>

    {/* Caja 3 */}
    <div className="bg-white border border-gray-300 rounded-xl p-4 shadow-md">
      <h3 className="font-semibold text-[#1b3f7a] mb-2">Productos de tu tienda</h3>
      <p className="text-sm text-gray-700 leading-snug">
        Aquí se muestran los productos que tienes en tu tienda personal.  
        Puedes <span className="font-semibold">quitar</span> los que no quieras.  
        Haciendo click en una imagen irás a la página del producto.  
        Para <span className="font-semibold">agregar nuevos productos</span>,
        debes hacerlo desde la página de la tienda principal.
      </p>
    </div>
  </div>
</div>





      <div className="w-full  bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
  {/* Título */}
  <h1 className="text-3xl md:text-4xl text-white font-lato">
  Productos ({products.length})
  </h1>
</div>

<div className="flex flex-wrap justify-center gap-4 w-full mt-2">
  {products.map((p) => {
    const productLink = `https://vitahub.mx/products/${p.handle}?sref=${customerId}`;

    // Primer imagen
    const imageUrl = p.images?.edges?.[0]?.node?.src;

    // Primer precio
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
          <p className="text-[#1b3f7a] text-xl font-semibold mt-1">${price}</p>
        )}
    
        {/* 👇 esto empuja el botón hacia abajo */}
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



    </div>
  );
}

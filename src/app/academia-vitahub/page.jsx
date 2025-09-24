"use client";

export default function AcademiaVitahubPage() {
  return (
  
<main className="max-w-4xl mx-auto px-4 py-8">
<div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">Academia Vitahub</h1>
      </div>

    {/* Título principal */}
     <h1 className="text-3xl md:text-4xl text-center text-[#1b3f7a] mb-12 font-lato">
    Todo lo que necesitas saber para generar ingresos en Vitahub
  </h1>

  <section className="mb-16">

    <h2 className="text-xl md:text-2xl text-[#1b3f7a] mb-6 font-lato">
    Bhavani: Suplementos Naturales para tu Bienestar
  </h2>
    <div className="aspect-w-16 aspect-h-9">
      <iframe 
        src="https://www.youtube.com/embed/3G90B0J00Uw"
        title="Cómo registrarme y tener cuenta de Afiliado en Vitahub"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-64 md:h-96 rounded-lg shadow-md"
      ></iframe>
    </div>
    <div className="mt-6 max-w-3xl mx-auto text-left px-4 pt-5">
  <p className="text-gray-600 mb-4">
    Descubre cómo nuestros suplementos naturales pueden ayudarte a mantener tu energía, concentración y equilibrio diario. Fórmulas seguras con ingredientes de origen natural y respaldo científico.
  </p>
  <ul className="text-gray-600 list-disc list-inside mb-4 space-y-1">
    <li><strong>Bienestar integral:</strong> Equilibrio físico y emocional.</li>
    <li><strong>Apoyo en la menopausia:</strong> Reduce sofocos y cambios de ánimo.</li>
    <li><strong>Concentración y energía:</strong> Combate la fatiga y mejora la atención.</li>
    <li><strong>Ingredientes naturales:</strong> Fórmulas seguras y responsables.</li>
  </ul>
  <p className="text-gray-500 italic text-sm">
    Recomendamos siempre usar los suplementos bajo supervisión de un profesional de la salud, especialmente en embarazo, lactancia o enfermedades autoinmunes.
  </p>
</div>

  </section> 
</main>
  );
}

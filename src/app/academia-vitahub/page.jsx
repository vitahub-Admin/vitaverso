"use client";

export default function AcademiaVitahubPage() {
  return (
  
<main className="max-w-4xl mx-auto px-4 py-8">


  {/* Título principal */}
  <h1 className="text-3xl md:text-4xl text-center text-[#1b3f7a] mb-12 font-lato">
    Todo lo que necesitas saber para generar ingresos en Vitahub
  </h1>

  {/* Pregunta y video 1 */}
  <section className="mb-16">
    <h2 className="text-xl md:text-2xl text-[#1b3f7a] mb-6 font-lato">
      <strong>1- ¿Cómo registrarme y tener cuenta de Afiliado en Vitahub?</strong>
    </h2>
    <div className="aspect-w-16 aspect-h-9">
      <iframe 
        src="https://www.youtube.com/embed/7dauAom7pkE" 
        title="Cómo registrarme y tener cuenta de Afiliado en Vitahub"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-64 md:h-96 rounded-lg shadow-md"
      ></iframe>
    </div>
  </section>

  {/* Pregunta y video 2 */}
  <section className="mb-16">
    <h2 className="text-xl md:text-2xl text-[#1b3f7a] mb-6 font-lato">
      <strong>2- ¿Cómo armar y compartir un carrito para mi paciente?</strong>
    </h2>
    <div className="aspect-w-16 aspect-h-9">
      <iframe 
        src="https://www.youtube.com/embed/_SY2uqCy34E" 
        title="Cómo armar y compartir un carrito para mi paciente"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-64 md:h-96 rounded-lg shadow-md"
      ></iframe>
    </div>
  </section>

  {/* Pregunta y video 3 */}
  <section className="mb-16">
    <h2 className="text-xl md:text-2xl text-[#1b3f7a] mb-6 font-lato">
      <strong>3- ¿Cómo ver el Dashboard para hacer seguimiento de ventas y comisiones?</strong>
    </h2>
    <div className="aspect-w-16 aspect-h-9">
      <iframe 
        src="https://www.youtube.com/embed/zt4VESlSJt0" 
        title="Cómo ver el Dashboard para hacer seguimiento de ventas y comisiones"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-64 md:h-96 rounded-lg shadow-md"
      ></iframe>
    </div>
  </section>

  {/* Pregunta y video 4 */}
  <section className="mb-16">
    <h2 className="text-xl md:text-2xl text-[#1b3f7a] mb-6 font-lato">
      <strong>4- ¿Cómo hacer seguimiento de carritos enviados?</strong>
    </h2>
    <div className="aspect-w-16 aspect-h-9">
      <iframe 
        src="https://www.youtube.com/embed/Al--CNYZtLQ" 
        title="Cómo hacer seguimiento de carritos enviados"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-64 md:h-96 rounded-lg shadow-md"
      ></iframe>
    </div>
  </section>

  {/* Pregunta y video 5 */}
  <section className="mb-16">
    <h2 className="text-xl md:text-2xl text-[#1b3f7a] mb-6 font-lato">
      <strong>5- ¿Cómo cobrar las comisiones de los carritos vendidos?</strong>
    </h2>
    <div className="aspect-w-16 aspect-h-9">
      <iframe 
        src="https://www.youtube.com/embed/yLdRNxjV5-Y" 
        title="Cómo cobrar las comisiones de los carritos vendidos"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-64 md:h-96 rounded-lg shadow-md"
      ></iframe>
    </div>
  </section>
</main>
  );
}

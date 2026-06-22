export const metadata = {
  title: 'Términos y Condiciones — Vitahub Pro',
};

export default function TerminosPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Términos y Condiciones de Uso</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Última actualización: junio de 2026</p>

      <p>
        Al usar <strong>Vitahub Pro</strong> ("la App"), operada por Vitahub México, aceptás los siguientes términos.
        Si no estás de acuerdo, por favor no uses la App.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>1. Acceso y elegibilidad</h2>
      <p>
        La App está destinada exclusivamente a especialistas afiliados al programa de Vitahub México.
        El acceso es otorgado por Vitahub y puede ser revocado en cualquier momento si se incumplen estos términos
        o las condiciones del programa de afiliados.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>2. Uso permitido</h2>
      <ul>
        <li>Gestionar tu wallet de comisiones y consultar tu historial de transacciones.</li>
        <li>Administrar tu agenda de citas a través del módulo de booking.</li>
        <li>Acceder a capacitaciones y materiales del programa.</li>
        <li>Compartir carritos de compra con tus clientes.</li>
      </ul>
      <p>Queda prohibido el uso de la App para fines fraudulentos, el abuso del sistema de comisiones o cualquier actividad que perjudique a Vitahub México o a otros afiliados.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>3. Integración con Google Calendar</h2>
      <p>
        La App ofrece integración opcional con Google Calendar. Al conectar tu cuenta de Google autorizás a
        Vitahub Pro a leer tus eventos existentes y crear nuevos eventos relacionados con citas confirmadas.
        Esta autorización puede ser revocada en cualquier momento desde la App o desde tu cuenta de Google.
        El uso de esta integración está sujeto también a los{' '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer">Términos de Servicio de Google</a>.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>4. Comisiones y pagos</h2>
      <p>
        Las comisiones se calculan según las reglas vigentes del programa de afiliados de Vitahub México,
        las cuales pueden modificarse con previo aviso. Vitahub se reserva el derecho de corregir o revertir
        transacciones generadas de forma incorrecta o fraudulenta.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>5. Propiedad intelectual</h2>
      <p>
        Todo el contenido de la App (diseño, textos, funcionalidades) es propiedad de Vitahub México.
        No está permitida su reproducción o distribución sin autorización expresa.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>6. Limitación de responsabilidad</h2>
      <p>
        Vitahub México no se hace responsable por interrupciones del servicio, pérdida de datos o daños
        derivados del uso de la App. La App se provee "tal cual" sin garantías de disponibilidad continua.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>7. Modificaciones</h2>
      <p>
        Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios importantes
        serán notificados a través de la App. El uso continuado de la App implica la aceptación de los términos vigentes.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>8. Contacto</h2>
      <p>
        Para consultas sobre estos términos: <strong>maxi@vitahub.mx</strong>
      </p>
    </main>
  );
}

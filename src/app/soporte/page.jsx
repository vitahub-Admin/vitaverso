export const metadata = {
  title: 'Soporte — Vitahub Pro',
};

export default function SoportePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Soporte</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Estamos aquí para ayudarte</p>

      <p>
        Si tenés alguna duda, problema técnico o consulta sobre tu cuenta en <strong>Vitahub Pro</strong>,
        podés contactarnos por cualquiera de los siguientes medios.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>Contacto por email</h2>
      <p>
        Escribinos a <strong>maxi@vitahub.mx</strong> y te respondemos a la brevedad.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>Preguntas frecuentes</h2>
      <ul>
        <li><strong>¿Cómo recupero mi contraseña?</strong> — Contactanos por email indicando tu dirección registrada y te ayudamos a restablecer el acceso.</li>
        <li><strong>¿Cómo veo mis comisiones?</strong> — Ingresá a la app y dirigite a la sección Wallet.</li>
        <li><strong>¿Cuándo se acreditan mis puntos?</strong> — Los canjes en crédito de tienda se acreditan al instante. Los canjes en efectivo pueden demorar entre 3 y 5 días hábiles.</li>
        <li><strong>¿Cómo actualizo mis datos?</strong> — Desde la sección Perfil dentro de la app podés editar tu información.</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>Horario de atención</h2>
      <p>
        Lunes a viernes de 9:00 a 18:00 (hora de México).
        Respondemos emails fuera de horario pero pueden demorar hasta el siguiente día hábil.
      </p>
    </main>
  );
}

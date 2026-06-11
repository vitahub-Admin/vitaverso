export const metadata = {
  title: 'Política de Privacidad — Vitahub Pro',
};

export default function PrivacidadPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Política de Privacidad</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Última actualización: junio de 2026</p>

      <p>
        Esta política de privacidad describe cómo <strong>Vitahub Pro</strong> ("la App"), operada por Vitahub México,
        recopila, usa y protege la información de los especialistas afiliados que utilizan la aplicación.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>1. Datos que recopilamos</h2>
      <ul>
        <li>Dirección de correo electrónico (para autenticación)</li>
        <li>Nombre y datos de perfil del especialista</li>
        <li>Token de dispositivo para notificaciones push</li>
        <li>Información de transacciones y saldo de wallet (comisiones generadas)</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>2. Cómo usamos los datos</h2>
      <ul>
        <li>Autenticar el acceso a la App</li>
        <li>Mostrar el saldo de comisiones y el historial de transacciones</li>
        <li>Enviar notificaciones push relacionadas con la cuenta</li>
        <li>Gestionar inscripciones a capacitaciones</li>
      </ul>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>3. Compartición de datos</h2>
      <p>
        No vendemos ni compartimos datos personales con terceros con fines comerciales.
        Los datos pueden ser procesados por proveedores de infraestructura (Supabase, Vercel, Expo)
        bajo acuerdos de confidencialidad.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>4. Seguridad</h2>
      <p>
        Toda la comunicación entre la App y nuestros servidores se realiza mediante HTTPS (cifrado en tránsito).
        Las credenciales se almacenan de forma segura en el dispositivo usando almacenamiento cifrado.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>5. Retención de datos</h2>
      <p>
        Los datos se conservan mientras la cuenta del especialista esté activa.
        Podés solicitar la eliminación de tu cuenta y datos escribiendo a <strong>contacto@vitahub.mx</strong>.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>6. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política ocasionalmente. Te notificaremos a través de la App ante cambios importantes.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 32, marginBottom: 8 }}>7. Contacto</h2>
      <p>
        Para consultas sobre privacidad: <strong>contacto@vitahub.mx</strong>
      </p>
    </main>
  );
}

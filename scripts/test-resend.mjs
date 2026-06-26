import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const email = process.argv[2] || 'maerc.maxi@gmail.com';
const code  = String(Math.floor(100000 + Math.random() * 900000));
const nombre = 'Maxi';

const { data, error } = await resend.emails.send({
  from: 'Vitahub Pro <noreply@pro.vitahub.mx>',
  to: email,
  subject: 'Tu código de verificación',
  html: `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
      <h2 style="color:#1b3f7a;margin:0 0 8px">Hola, ${nombre}</h2>
      <p style="color:#555;margin:0 0 24px">Tu código de verificación para Vitahub Pro es:</p>
      <div style="background:#1b3f7a;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;border-radius:10px">
        ${code}
      </div>
      <p style="color:#999;font-size:12px;margin-top:24px">Este código expira en 15 minutos. Si no solicitaste esto, ignorá este mensaje.</p>
    </div>
  `,
});

if (error) {
  console.error('❌ Error:', error);
} else {
  console.log(`✅ Email enviado a ${email} con código ${code}`);
  console.log('ID:', data.id);
}

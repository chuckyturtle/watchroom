import nodemailer from 'nodemailer';

const APP_NAME = 'WatchRoom';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function baseTemplate(content: string): string {
  return `
    <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0f0f1a;color:#e2e8f0;padding:40px;border-radius:16px;border:1px solid #1e1e30;">
      <div style="text-align:center;margin-bottom:32px;">
        <h1 style="color:#6366f1;font-size:28px;margin:0;">🎬 WatchRoom</h1>
        <p style="color:#64748b;font-size:14px;margin:4px 0 0;">Ve contenido con tus amigos</p>
      </div>
      ${content}
      <hr style="border:none;border-top:1px solid #1e1e30;margin:32px 0;">
      <p style="color:#475569;font-size:12px;text-align:center;">WatchRoom — Si no fuiste tú, ignora este correo.</p>
    </div>
  `;
}

export async function sendWelcomeEmail(email: string, username: string, verificationToken: string) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `¡Bienvenido a WatchRoom, ${username}! Verifica tu correo`,
    html: baseTemplate(`
      <h2 style="color:#f1f5f9;">¡Hola ${username}! 👋</h2>
      <p style="color:#94a3b8;line-height:1.7;">Gracias por unirte a WatchRoom. Ya puedes ver YouTube, Twitch y Kick con tus amigos en salas inmersivas.</p>
      <p style="color:#94a3b8;">Por favor verifica tu correo para activar tu cuenta:</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${APP_URL}/api/auth/verify?token=${verificationToken}"
           style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px;">
          Verificar correo
        </a>
      </div>
      <p style="color:#64748b;font-size:14px;">O copia este enlace: ${APP_URL}/api/auth/verify?token=${verificationToken}</p>
    `),
  });
}

export async function sendPasswordResetEmail(email: string, username: string, resetToken: string) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Restablece tu contraseña de WatchRoom`,
    html: baseTemplate(`
      <h2 style="color:#f1f5f9;">Restablecer contraseña</h2>
      <p style="color:#94a3b8;line-height:1.7;">Hola ${username}, recibimos una solicitud para restablecer tu contraseña.</p>
      <p style="color:#94a3b8;">Este enlace expira en <strong style="color:#f1f5f9;">1 hora</strong>:</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${APP_URL}/reset-password?token=${resetToken}"
           style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px;">
          Restablecer contraseña
        </a>
      </div>
      <p style="color:#64748b;font-size:14px;">O copia este enlace: ${APP_URL}/reset-password?token=${resetToken}</p>
    `),
  });
}

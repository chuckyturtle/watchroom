import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'El correo es requerido' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const resetToken = randomUUID();
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });
      sendPasswordResetEmail(email, user.username, resetToken).catch(console.error);
    }

    return NextResponse.json({ message: 'Si ese correo existe, te enviamos un enlace de recuperación.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

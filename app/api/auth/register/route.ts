import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signToken, getRandomColor } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { email, username, password } = await req.json();

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }
    if (username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: 'El usuario debe tener entre 3 y 20 caracteres' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'El usuario solo puede tener letras, números y guiones bajos' }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.email === email ? 'Este correo ya está registrado' : 'Este nombre de usuario ya existe' },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const verificationToken = randomUUID();
    const avatarColor = getRandomColor();

    const user = await prisma.user.create({
      data: { email, username, password: hashedPassword, verificationToken, avatarColor },
    });

    sendWelcomeEmail(email, username, verificationToken).catch(console.error);

    const token = signToken({ userId: user.id, email: user.email, username: user.username, avatarColor: user.avatarColor });

    return NextResponse.json({
      message: '¡Cuenta creada! Revisa tu correo para verificarla.',
      token,
      user: { id: user.id, email: user.email, username: user.username, avatarColor: user.avatarColor, bio: user.bio, points: 0 },
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('Register error:', msg);
    // Surface DB connection errors (not credentials) for easier debugging
    const isDbError = msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('P1001') || msg.includes('P1002');
    return NextResponse.json(
      { error: isDbError ? 'No se pudo conectar a la base de datos, intenta de nuevo' : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

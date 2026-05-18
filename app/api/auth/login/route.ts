import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Correo y contraseña son requeridos' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ error: 'Correo o contraseña incorrectos' }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      avatarColor: user.avatarColor,
    });

    return NextResponse.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, avatarColor: user.avatarColor, bio: user.bio, points: user.points },
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('Login error:', msg);
    const isDbError = msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('P1001') || msg.includes('P1002');
    return NextResponse.json(
      { error: isDbError ? 'No se pudo conectar a la base de datos, intenta de nuevo' : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

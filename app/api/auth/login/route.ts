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
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

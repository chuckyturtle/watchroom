import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!token) return NextResponse.redirect(`${appUrl}/login?error=token_invalido`);

  const user = await prisma.user.findFirst({ where: { verificationToken: token } });

  if (!user) return NextResponse.redirect(`${appUrl}/login?error=token_invalido`);

  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, verificationToken: null },
  });

  return NextResponse.redirect(`${appUrl}/login?verified=true`);
}

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from './models';

const COOKIE = 'fi_session';

function secret() {
  const value = process.env.JWT_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta JWT_SECRET.');
  }
  return 'desarrollo-local-cambiar-en-produccion';
}

export function signSession(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, secret(), { expiresIn: '7d' });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) {
    res.status(401).json({ message: 'Tenés que iniciar sesión.' });
    return;
  }
  try {
    const payload = jwt.verify(token, secret()) as { sub?: string; email?: string };
    if (!payload.sub) {
      res.status(401).json({ message: 'Tenés que iniciar sesión.' });
      return;
    }
    const user = await UserModel.findById(payload.sub);
    if (!user) {
      res.status(401).json({ message: 'Tenés que iniciar sesión.' });
      return;
    }
    req.admin = { id: String(user._id), email: user.email, eventId: String(user.eventId) };
    next();
  } catch {
    res.status(401).json({ message: 'Tenés que iniciar sesión.' });
  }
}

declare global {
  namespace Express {
    interface Request {
      admin?: { id: string; email: string; eventId: string };
    }
  }
}

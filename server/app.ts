import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { registerRoutes } from './routes';
import { seedIfEmpty } from './seed';
import { mediaRoot } from './uploads';

export async function createApp(mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/casamiento') {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);
  await seedIfEmpty();

  const app = express();
  const origin = process.env.CLIENT_ORIGIN;
  app.use(cors({ origin: origin || true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/media', express.static(mediaRoot()));
  registerRoutes(app);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ message: 'No pudimos completar la acción.' });
  });

  if (process.env.NODE_ENV === 'production') {
    const dist = path.resolve(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/media')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

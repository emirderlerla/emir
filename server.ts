import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { ensureSoloOwnerAccount } from './server/auth.ts';
import { db, ensureUserSettings, initDatabase, newId, nowIso } from './server/db.ts';
import aiRouter from './server/routes/ai.ts';
import authRouter from './server/routes/auth.ts';
import calendarRouter from './server/routes/calendar.ts';
import dashboardRouter from './server/routes/dashboard.ts';
import ideasRouter from './server/routes/ideas.ts';
import notesRouter from './server/routes/notes.ts';
import projectsRouter from './server/routes/projects.ts';
import settingsRouter from './server/routes/settings.ts';
import tasksRouter from './server/routes/tasks.ts';

dotenv.config();

initDatabase();
ensureSoloOwnerAccount(db, newId, nowIso, ensureUserSettings);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api', notesRouter);
app.use('/api', calendarRouter);
app.use('/api', dashboardRouter);
app.use('/api/ai', aiRouter);
app.use('/api/settings', settingsRouter);

// Error handler for multer / JSON / unhandled API errors
app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.message.includes('File too large') ? 413 : 400;
  const message = err.message.includes('File too large')
    ? 'Dosya boyutu 10 MB sınırını aşıyor.'
    : err.message || 'Sunucu isteği işlerken bir hata oluştu.';
  res.status(status).json({ error: message });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Uygulama derlemesi bulunamadı. Lütfen önce npm run build çalıştırın.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Noah Command Center sunucusu http://0.0.0.0:${PORT} adresinde çalışıyor.`);
  });
}

startServer();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes.js';
import farmerRoutes from './routes/farmerRoutes.js';
import governmentRoutes from './routes/governmentRoutes.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

// CORS: only the configured frontend origin(s) may send credentialed requests.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, server-to-server health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // 403 rather than the default 500: a disallowed origin is a client problem, not a server fault.
      return callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'backend' });
});

// Public + role-protected route groups.
// FARMER-only and GOVERNMENT_OFFICIAL-only enforcement happens inside each router
// via authenticate + authorize middleware — not just on the frontend.
app.use('/api/auth', authRoutes);
app.use('/api/farmer', farmerRoutes);
app.use('/api/government', governmentRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

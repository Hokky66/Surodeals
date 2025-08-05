import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import path from 'path';

dotenv.config();

const app = express();

// 🧠 Middleware – juiste volgorde is belangrijk!
app.use(cookieParser());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// 🔐 CORS voor frontend
const corsOptions = {
  origin: ['https://surodeals-frontend.vercel.app', 'http://localhost:5174'],
  credentials: true,
};
app.use(cors(corsOptions));

// 🧠 Session Store
const PostgresStore = connectPg(session);
app.use(session({
  store: new PostgresStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    tableName: 'sessions'
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dagen
  },
  name: 'surimarkt.sid'
}));

// ✅ Alleen toepassen waar nodig
const csrfProtection = csrf();

// ➕ CSRF token ophalen (GET)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// 🧪 Voorbeeld POST met CSRF
app.post('/api/auth/login', csrfProtection, (req, res) => {
  res.json({ message: 'Login route werkt!', data: req.body });
});

// 🖼️ Static files (uploads etc.)
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));
app.use('/images', express.static(path.join(process.cwd(), 'public/images')));
app.use('/demo-images', express.static(path.join(process.cwd(), 'public/demo-images')));

// 🧠 Debug logging (optioneel)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// 🧠 Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal Server Error' });
});

// 🚀 Server starten
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});






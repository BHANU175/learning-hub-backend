// ============================================================
//  Learning Hub CRM Engine — Vercel-safe Express 5 entrypoint
// ============================================================
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

/* ------------------------------------------------------------------
   1. CORS — must be the FIRST middleware, before any body parsing,
      routing, or anything that can throw.
------------------------------------------------------------------ */
const ALLOWED_ORIGINS = [
  'https://www.nexustuitions.com',
  'https://nexustuitions.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server / curl / Postman (no Origin header)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow any *.vercel.app preview build of the frontend
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
    return callback(null, false); // reject without throwing a 500
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Express 5 note: app.options('*') CRASHES (path-to-regexp v8).
// Use a RegExp instead. This guarantees every preflight gets answered.
app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------------------
   2. Supabase admin client — lazily created so that a missing env var
      can never crash the serverless function at cold start
      (a boot crash is what strips the CORS headers off the response).
------------------------------------------------------------------ */
const { createClient } = require('@supabase/supabase-js');

let _supabaseAdmin = null;
function getSupabaseAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing on the server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
    );
  }
  _supabaseAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabaseAdmin;
}

/* ------------------------------------------------------------------
   3. Routes — mounted defensively. If routes/publicRoutes.js throws at
      require-time (bad import, missing Azure connection string, an
      Express-5-illegal path like '*'), we log it and keep the app
      alive so the browser gets a readable JSON error WITH CORS headers
      instead of an opaque Vercel 500.
------------------------------------------------------------------ */
let routeLoadError = null;
try {
  const publicRoutes = require('./routes/publicRoutes');
  app.use('/api/public', publicRoutes);
} catch (err) {
  routeLoadError = err;
  console.error('❌ Failed to load ./routes/publicRoutes:', err);
  app.use('/api/public', (req, res) => {
    res.status(500).json({
      error: 'Public routes failed to load on the server.',
      detail: err.message,
    });
  });
}

/* ------------------------------------------------------------------
   4. Admin route
------------------------------------------------------------------ */
app.post('/api/admin/create-employee', async (req, res) => {
  const { email, password, full_name } = req.body || {};

  if (!email || !password || !full_name) {
    return res
      .status(400)
      .json({ error: 'Missing required fields: email, password, or full_name.' });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;

    const { error: dbError } = await supabaseAdmin.from('employees').insert([
      {
        id: authData.user.id,
        email,
        full_name,
        role: 'employee',
        is_active: true,
      },
    ]);
    if (dbError) throw dbError;

    res.status(200).json({ message: 'Employee account created successfully!' });
  } catch (error) {
    console.error('Server error creating employee:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

/* ------------------------------------------------------------------
   5. Health + diagnostics
------------------------------------------------------------------ */
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: '🚀 Learning Hub CRM Engine running securely!' });
});

// Hit this in the browser to confirm the deploy is healthy.
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: routeLoadError ? 'degraded' : 'ok',
    routesLoaded: !routeLoadError,
    routeLoadError: routeLoadError ? routeLoadError.message : null,
    env: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
      JWT_SECRET: Boolean(process.env.JWT_SECRET),
      AZURE_STORAGE_CONNECTION_STRING: Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING),
    },
    time: new Date().toISOString(),
  });
});

// 404 — no path string, so it is Express 5 safe. Still carries CORS headers.
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Error handler — last line of defence so thrown errors keep CORS headers.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

/* ------------------------------------------------------------------
   6. Only listen locally. On Vercel the export is what matters.
------------------------------------------------------------------ */
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`📡 Server broadcasting on port ${PORT}`));
}

module.exports = app;
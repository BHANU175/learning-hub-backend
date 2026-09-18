const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Initialize Supabase Admin
// IMPORTANT: Keep the Service Role Key only on the backend.
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

// =========================
// CORS CONFIGURATION
// =========================

const allowedOrigins = [
  'https://www.nexustuitions.com',
  'https://nexustuitions.com',
  'https://learning-hub-mainsite.vercel.app'
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests without an Origin header
      // (Postman, server-to-server requests, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log('Blocked CORS origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ],

    credentials: true
  })
);

// Handle browser preflight requests
app.options('*', cors());

app.use(express.json());

// =========================
// PUBLIC ROUTES
// =========================

const publicRoutes = require('./routes/publicRoutes');

app.use('/api/public', publicRoutes);

// =========================
// ADMIN ROUTES
// =========================

app.post('/api/admin/create-employee', async (req, res) => {
  const { email, password, full_name } = req.body;

  // Validation
  if (!email || !password || !full_name) {
    return res.status(400).json({
      error: 'Missing required fields: email, password, or full_name.'
    });
  }

  try {
    // 1. Create Auth User
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (authError) {
      throw authError;
    }

    // 2. Insert employee into database
    const { error: dbError } = await supabaseAdmin
      .from('employees')
      .insert([
        {
          id: authData.user.id,
          email,
          full_name,
          role: 'employee',
          is_active: true
        }
      ]);

    if (dbError) {
      throw dbError;
    }

    res.status(200).json({
      message: 'Employee account created successfully!'
    });

  } catch (error) {
    console.error(
      'Server error creating employee:',
      error
    );

    res.status(500).json({
      error:
        error.message ||
        'Internal Server Error'
    });
  }
});

// =========================
// HEALTH CHECK
// =========================

app.get('/', (req, res) => {
  res.send('🚀 Learning Hub CRM Engine running securely!');
});

// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `📡 Server broadcasting on port ${PORT}`
  );
});

// =========================
// VERCEL EXPORT
// =========================

module.exports = app;
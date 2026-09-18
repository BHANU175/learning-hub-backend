const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// ===============================
// SUPABASE ADMIN
// ===============================

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

// ===============================
// CORS
// ===============================

const allowedOrigins = [
  'https://www.nexustuitions.com',
  'https://nexustuitions.com',
  'https://learning-hub-mainsite.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without Origin
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('CORS blocked origin:', origin);

    return callback(null, false);
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
    'Authorization',
    'Accept'
  ],

  credentials: true,

  optionsSuccessStatus: 204
};

// Apply CORS BEFORE routes
app.use(cors(corsOptions));

// Explicitly handle browser preflight requests
app.options('/api/public/student-request', cors(corsOptions));

app.use(express.json());

// ===============================
// PUBLIC ROUTES
// ===============================

const publicRoutes = require('./routes/publicRoutes');

app.use('/api/public', publicRoutes);

// ===============================
// ADMIN ROUTES
// ===============================

app.post('/api/admin/create-employee', async (req, res) => {
  const { email, password, full_name } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({
      error: 'Missing required fields: email, password, or full_name.'
    });
  }

  try {
    // Create Auth User
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (authError) {
      throw authError;
    }

    // Insert employee
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

    return res.status(200).json({
      message: 'Employee account created successfully!'
    });

  } catch (error) {
    console.error(
      'Server error creating employee:',
      error
    );

    return res.status(500).json({
      error: error.message || 'Internal Server Error'
    });
  }
});

// ===============================
// HEALTH CHECK
// ===============================

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '🚀 Learning Hub CRM Engine running securely!'
  });
});

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `📡 Server broadcasting on port ${PORT}`
    );
  });
}

// ===============================
// VERCEL EXPORT
// ===============================

module.exports = app;
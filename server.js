const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Initialize Supabase Admin (Use Service Role Key for Admin Privileges)
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import Routes
const publicRoutes = require('./routes/publicRoutes');
app.use('/api/public', publicRoutes);

// --- ADMIN ROUTES ---

app.post('/api/admin/create-employee', async (req, res) => {
  const { email, password, full_name } = req.body;

  // Validation Check
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "Missing required fields: email, password, or full_name." });
  }

  try {
    // 1. Create Auth User
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) throw authError;

    // 2. Insert into the employees table (using the new user's ID)
    const { error: dbError } = await supabaseAdmin.from('employees').insert([
      { 
        id: authData.user.id, 
        email, 
        full_name, 
        role: 'employee', 
        is_active: true 
      }
    ]);

    if (dbError) throw dbError;

    res.status(200).json({ message: 'Employee account created successfully!' });
  } catch (error) {
    console.error('Server error creating employee:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Basic Health Check
app.get('/', (req, res) => {
  res.send('🚀 Learning Hub CRM Engine running securely!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`📡 Server broadcasting on port ${PORT}`);
});
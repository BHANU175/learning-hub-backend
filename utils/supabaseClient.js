const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize the Supabase connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = supabase;
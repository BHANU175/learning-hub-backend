const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../utils/supabaseClient');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 1. STUDENT SUBMITS A REQUEST ---
// Add this inside your publicRoutes.js file

router.post('/student-request', async (req, res) => {
  const {
    student_name,
    class_level,
    parent_name,
    email,
    contact_number,
    subjects,
    preferred_mode,
    city,
    specific_area,
    location_coords
  } = req.body;

  // Basic validation on the backend
  if (!student_name || !parent_name || !email || !contact_number || !subjects) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // Insert the data into the Supabase table
    const { data, error } = await supabaseAdmin
      .from('student_requests')
      .insert([
        {
          student_name,
          class_level,
          parent_name,
          email,
          contact_number,
          subjects, // Passes the array of strings directly
          preferred_mode,
          city,
          specific_area,
          location_coords
        }
      ]);

    if (error) throw error;

    res.status(200).json({ message: 'Student request submitted successfully!' });
  } catch (error) {
    console.error('Error inserting student request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- 2. TEACHER APPLIES ---
router.post('/teacher-apply', upload.fields([
  { name: 'profilePhoto', maxCount: 1 }, 
  { name: 'idProof', maxCount: 1 }
]), async (req, res) => {
  try {
    const { fullName, contactNumber, teachingModes, specificArea } = req.body;
    
    // Helper function to upload files directly to Supabase Storage
    const uploadFile = async (file, folder) => {
      const fileName = `${Date.now()}-${file.originalname}`;
      const { data, error } = await supabase.storage
        .from('learning-hub-uploads')
        .upload(`${folder}/${fileName}`, file.buffer, { contentType: file.mimetype });
      
      if (error) throw error;
      
      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from('learning-hub-uploads')
        .getPublicUrl(`${folder}/${fileName}`);
        
      return publicUrlData.publicUrl;
    };

    // Upload files
    const profilePhotoUrl = await uploadFile(req.files['profilePhoto'][0], 'photos');
    const idProofUrl = await uploadFile(req.files['idProof'][0], 'documents');

    // Save Teacher to Database
    const { error: dbError } = await supabase
      .from('teachers')
      .insert([{
        full_name: fullName,
        contact_number: contactNumber,
        teaching_modes: JSON.parse(teachingModes),
        specific_area: specificArea,
        profile_photo_url: profilePhotoUrl,
        id_proof_url: idProofUrl
      }]);

    if (dbError) throw dbError;
    res.status(201).json({ message: 'Application submitted for review!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
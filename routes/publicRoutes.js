const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../utils/supabaseClient');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 1. STUDENT SUBMITS A REQUEST ---
router.post('/student-request', async (req, res) => {
  try {
    const { error } = await supabase
      .from('student_leads')
      .insert([req.body]);

    if (error) throw error;
    res.status(201).json({ message: 'Request received successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
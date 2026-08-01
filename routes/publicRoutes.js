const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../utils/supabaseClient');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 1. STUDENT SUBMITS A REQUEST ---
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

  // Convert the array into a string for your database if needed
  const subject_needed = Array.isArray(subjects) ? subjects.join(', ') : subjects;

  try {
    const { data, error } = await supabase
      .from('student_leads')
      .insert([
        {
          student_name,
          class_level,
          parent_name,
          email,
          contact_number,
          subject_needed, 
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
    const { 
      fullName, 
      contactNumber, 
      teachingModes, 
      specificArea,
      email,
      subjects,
      locationCoords 
    } = req.body;
    
    // Strict backend validation for mandatory text fields
    if (!fullName || !contactNumber || !teachingModes || !specificArea || !email || !subjects) {
      return res.status(400).json({ error: "Missing required fields (including email and subjects)." });
    }

    // Check CRM settings to see if document uploads are required
    const { data: settingsData } = await supabase
      .from('app_settings')
      .select('enable_doc_upload')
      .single();

    const isDocUploadEnabled = settingsData?.enable_doc_upload ?? true;

    // Extract files safely without throwing TypeError
    const profilePhotoFile = req.files?.['profilePhoto']?.[0];
    const idProofFile = req.files?.['idProof']?.[0];

    // Enforce file checks ONLY IF document uploads are enabled in CRM settings
    if (isDocUploadEnabled) {
      if (!profilePhotoFile || !idProofFile) {
        return res.status(400).json({ error: "Profile photo and ID proof are required." });
      }
    }

    // Helper function to upload files safely to Supabase Storage
    const uploadFile = async (file, folder) => {
      if (!file) return null;

      const fileName = `${Date.now()}-${file.originalname}`;
      const { error } = await supabase.storage
        .from('learning-hub-uploads')
        .upload(`${folder}/${fileName}`, file.buffer, { contentType: file.mimetype });
      
      if (error) throw error;
      
      const { data: publicUrlData } = supabase.storage
        .from('learning-hub-uploads')
        .getPublicUrl(`${folder}/${fileName}`);
        
      return publicUrlData.publicUrl;
    };

    // Upload files conditionally
    const profilePhotoUrl = profilePhotoFile ? await uploadFile(profilePhotoFile, 'photos') : null;
    const idProofUrl = idProofFile ? await uploadFile(idProofFile, 'documents') : null;

    // Safely parse teachingModes
    let parsedModes = [];
    try {
      parsedModes = typeof teachingModes === 'string' ? JSON.parse(teachingModes) : teachingModes;
    } catch {
      parsedModes = [teachingModes];
    }

    // Insert into Supabase database
    const { error: dbError } = await supabase
      .from('teachers')
      .insert([{
        full_name: fullName,
        contact_number: contactNumber,
        teaching_modes: parsedModes,
        specific_area: specificArea,
        profile_photo_url: profilePhotoUrl,
        id_proof_url: idProofUrl,
        email: email,
        subjects: subjects,
        location_coords: locationCoords || '0,0'
      }]);

    if (dbError) throw dbError;

    res.status(201).json({ message: 'Application submitted for review!' });
  } catch (error) {
    console.error('Teacher application submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
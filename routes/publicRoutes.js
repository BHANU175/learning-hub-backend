const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../utils/supabaseClient');

// Multer configuration with 5MB memory storage limit
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max per file
});

/**
 * Helper Middleware: Check if maintenance mode is enabled in CRM settings
 */
async function checkMaintenanceMode(req, res, next) {
  try {
    const { data: settingsData, error } = await supabase
      .from('app_settings')
      .select('maintenance_mode')
      .eq('id', 1)
      .maybeSingle();

    if (!error && settingsData?.maintenance_mode) {
      return res.status(503).json({
        error: 'The platform is currently under maintenance. Submissions are temporarily paused.',
      });
    }
    next();
  } catch (err) {
    console.error('Maintenance check error:', err);
    next(); // Proceed if settings check fails to avoid completely locking out API
  }
}

// Apply maintenance mode check to all public routes
router.use(checkMaintenanceMode);

// ==============================================================================
// 1. STUDENT SUBMITS A REQUEST
// ==============================================================================
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
    location_coords,
  } = req.body;

  // Strict backend validation
  const hasSubjects = Array.isArray(subjects) ? subjects.length > 0 : Boolean(subjects?.trim?.());
  
  if (
    !student_name?.trim() ||
    !parent_name?.trim() ||
    !email?.trim() ||
    !contact_number?.trim() ||
    !class_level?.trim() ||
    !hasSubjects
  ) {
    return res.status(400).json({ error: 'Missing required student or contact fields.' });
  }

  // Normalize subjects array into comma-separated string for DB storage
  const subject_needed = Array.isArray(subjects)
    ? subjects.filter(Boolean).join(', ')
    : String(subjects).trim();

  try {
    const { error } = await supabase.from('student_leads').insert([
      {
        student_name: student_name.trim(),
        class_level: class_level.trim(),
        parent_name: parent_name.trim(),
        email: email.trim().toLowerCase(),
        contact_number: contact_number.trim(),
        subject_needed,
        preferred_mode: preferred_mode || 'online',
        city: city || 'Jaipur',
        specific_area: specific_area?.trim() || '',
        location_coords: location_coords || '',
      },
    ]);

    if (error) throw error;

    return res.status(200).json({ message: 'Student request submitted successfully!' });
  } catch (error) {
    console.error('Error inserting student request:', error);
    return res.status(500).json({ error: 'Failed to process request. Please try again later.' });
  }
});

// ==============================================================================
// 2. TEACHER APPLIES
// ==============================================================================
router.post(
  '/teacher-apply',
  upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'idProof', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        fullName,
        contactNumber,
        teachingModes,
        specificArea,
        email,
        subjects,
        locationCoords,
      } = req.body;

      // Strict validation for required mandatory text fields
      if (
        !fullName?.trim() ||
        !contactNumber?.trim() ||
        !email?.trim() ||
        !specificArea?.trim() ||
        !teachingModes ||
        !subjects
      ) {
        return res.status(400).json({ error: 'Missing required profile fields.' });
      }

      // Check document upload requirement setting safely
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('enable_doc_upload')
        .eq('id', 1)
        .maybeSingle();

      const isDocUploadEnabled = settingsData?.enable_doc_upload ?? true;

      // Extract uploaded files safely
      const profilePhotoFile = req.files?.['profilePhoto']?.[0];
      const idProofFile = req.files?.['idProof']?.[0];

      // Enforce file check when document uploads are enabled
      if (isDocUploadEnabled && (!profilePhotoFile || !idProofFile)) {
        return res.status(400).json({
          error: 'Profile photo and ID proof documents are required.',
        });
      }

      // Safe helper for Supabase Storage file upload
      const uploadFile = async (file, folder) => {
        if (!file) return null;

        const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `${folder}/${Date.now()}-${cleanFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('learning-hub-uploads')
          .upload(fileKey, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadErr) throw uploadErr;

        const { data: publicUrlData } = supabase.storage
          .from('learning-hub-uploads')
          .getPublicUrl(fileKey);

        return publicUrlData?.publicUrl || null;
      };

      // Perform file uploads concurrently
      const [profilePhotoUrl, idProofUrl] = await Promise.all([
        profilePhotoFile ? uploadFile(profilePhotoFile, 'photos') : Promise.resolve(null),
        idProofFile ? uploadFile(idProofFile, 'documents') : Promise.resolve(null),
      ]);

      // Parse teachingModes payload safely (handles Array, JSON string, or single string)
      let parsedModes = [];
      if (Array.isArray(teachingModes)) {
        parsedModes = teachingModes;
      } else if (typeof teachingModes === 'string') {
        try {
          const parsed = JSON.parse(teachingModes);
          parsedModes = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          parsedModes = teachingModes.split(',').map((s) => s.trim());
        }
      }

      // Normalize subjects payload
      const normalizedSubjects = Array.isArray(subjects)
        ? subjects.join(', ')
        : String(subjects).trim();

      // Insert record into database
      const { error: dbError } = await supabase.from('teachers').insert([
        {
          full_name: fullName.trim(),
          contact_number: contactNumber.trim(),
          email: email.trim().toLowerCase(),
          teaching_modes: parsedModes,
          specific_area: specificArea.trim(),
          subjects: normalizedSubjects,
          profile_photo_url: profilePhotoUrl,
          id_proof_url: idProofUrl,
          location_coords: locationCoords || '0,0',
        },
      ]);

      if (dbError) throw dbError;

      return res.status(201).json({ message: 'Teacher application submitted for review!' });
    } catch (error) {
      console.error('Teacher application submission error:', error);
      return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

module.exports = router;
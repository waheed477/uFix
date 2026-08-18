const multer = require('multer');

/**
 * Multer upload middleware - Phase 2
 * Handles profile pictures (images only, 5MB) and verification docs (images+PDF, 10MB)
 * Uses memory storage + Cloudinary upload via buffer (config/cloudinary.js)
 */

// Memory storage - file available as req.file.buffer
const storage = multer.memoryStorage();

// --- File Filters ---

const imageFilter = (req, file, cb) => {
  // Accept images only: jpeg, jpg, png, webp, gif, etc.
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for profile picture. Only images allowed (jpeg, png, webp, etc.), got ${file.mimetype}`), false);
  }
};

const documentFilter = (req, file, cb) => {
  // Accept images or PDF for verification documents
  const allowed = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ];
  if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for verification document. Allowed: images or PDF, got ${file.mimetype}`), false);
  }
};

// --- Multer Instances ---

const uploadProfilePicture = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
}).single('picture'); // field name 'picture' - can also be 'profilePicture'

const uploadVerificationDocument = multer({
  storage,
  fileFilter: documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  }
}).single('document'); // field name 'document'

// Wrapper to handle multer errors with clear messages
const handleMulter = (multerMiddleware) => {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        // Multer errors
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            const limit = err.field === 'picture' ? '5MB' : '10MB';
            return res.status(400).json({
              status: 'error',
              message: `File too large. Maximum size is ${limit}.`,
              field: err.field
            });
          }
          return res.status(400).json({
            status: 'error',
            message: `Upload error: ${err.message}`,
            code: err.code
          });
        }
        // Custom file filter errors
        return res.status(400).json({
          status: 'error',
          message: err.message
        });
      }
      // No file uploaded case will be handled in controller if required
      next();
    });
  };
};

module.exports = {
  uploadProfilePicture: handleMulter(uploadProfilePicture),
  uploadVerificationDocument: handleMulter(uploadVerificationDocument),
  // Expose raw for testing or custom handling if needed
  rawProfileUpload: uploadProfilePicture,
  rawDocumentUpload: uploadVerificationDocument
};

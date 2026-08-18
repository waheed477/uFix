const cloudinary = require('cloudinary').v2;

/**
 * Cloudinary Configuration - Phase 2
 * Handles profile picture and verification document uploads
 * 
 * Uses env variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * 
 * If credentials missing, we provide a mock mode that returns dummy URLs
 * and logs warnings - allows testing without real Cloudinary account
 * (real uploads require actual credentials)
 */

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const isConfigured = !!(cloudName && apiKey && apiSecret);

if (isConfigured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  console.log('✅ Cloudinary configured');
} else {
  console.warn('⚠️  Cloudinary credentials not set - upload will use mock mode (returns dummy URLs). Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env for real uploads. See project_context.md');
}

/**
 * Upload buffer to Cloudinary
 * @param {Buffer} fileBuffer - file buffer from multer
 * @param {Object} options - cloudinary upload options
 * @returns {Promise<Object>} - cloudinary result with secure_url
 */
const uploadFromBuffer = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    // Mock mode if not configured
    if (!isConfigured) {
      console.log(`📦 Mock Cloudinary upload - folder: ${options.folder}, type: ${options.resource_type || 'image'}`);
      // Return dummy URL for testing
      const mockUrl = `https://res.cloudinary.com/mock/image/upload/v1/${options.folder || 'ufix'}/mock_${Date.now()}_${options.public_id || 'file'}.${options.format || 'jpg'}`;
      // Simulate async
      setTimeout(() => {
        resolve({
          secure_url: mockUrl,
          public_id: `${options.folder || 'ufix'}/mock_${Date.now()}`,
          resource_type: options.resource_type || 'image',
          format: options.format || 'jpg',
          bytes: fileBuffer.length,
          mock: true
        });
      }, 200);
      return;
    }

    // Real Cloudinary upload via upload_stream
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        console.error('Cloudinary upload error:', error);
        return reject(error);
      }
      resolve(result);
    });

    uploadStream.end(fileBuffer);
  });
};

/**
 * Delete file from Cloudinary (optional, for replacing profile pictures)
 * @param {String} publicId - Cloudinary public_id
 */
const deleteFromCloudinary = async (publicId) => {
  if (!isConfigured) {
    console.log(`📦 Mock Cloudinary delete - publicId: ${publicId}`);
    return { result: 'ok', mock: true };
  }
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
    throw err;
  }
};

module.exports = {
  cloudinary,
  uploadFromBuffer,
  deleteFromCloudinary,
  isConfigured
};

/**
 * Upload middleware — Uses Cloudinary for cloud storage
 * Files are uploaded to Cloudinary and the URL is stored in the database.
 * This ensures files persist across Render deploys.
 */
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage (files stay in RAM, then get uploaded to Cloudinary)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, images, and Word documents are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
});

/**
 * Upload a file buffer to Cloudinary.
 * Returns { url, public_id }
 */
const uploadToCloudinary = (fileBuffer, originalName) => {
  const isVercel = !!process.env.VERCEL;
  const fs = require('fs');
  const path = require('path');
  const uploadPath = isVercel ? '/tmp/uploads' : path.join(__dirname, '../../uploads');

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.log('Cloudinary not configured. Using local filesystem fallback.');
    const filename = `${uuidv4()}-${originalName}`;
    fs.mkdirSync(uploadPath, { recursive: true });
    fs.writeFileSync(path.join(uploadPath, filename), fileBuffer);
    return Promise.resolve({
      url: `/uploads/${filename}`,
      public_id: filename
    });
  }

  return new Promise((resolve, reject) => {
    const uniqueName = `campusprint/${uuidv4()}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: uniqueName,
        resource_type: 'auto', // auto-detect (image, pdf, etc.)
        folder: 'campusprint',
      },
      (error, result) => {
        if (error) {
          console.warn('Cloudinary upload error, falling back to local filesystem:', error);
          const filename = `${uuidv4()}-${originalName}`;
          fs.mkdirSync(uploadPath, { recursive: true });
          fs.writeFileSync(path.join(uploadPath, filename), fileBuffer);
          resolve({
            url: `/uploads/${filename}`,
            public_id: filename
          });
        } else {
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
};

module.exports = upload;
module.exports.uploadToCloudinary = uploadToCloudinary;

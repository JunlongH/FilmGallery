const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { uploadsDir, tmpUploadDir, filmDir } = require('./paths');

const storageDefault = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname) || ''}`;
    cb(null, unique);
  }
});
const uploadDefault = multer({ storage: storageDefault });

const storageTmp = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpUploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname) || ''}`;
    cb(null, unique);
  }
});
// Allow larger single files for batch roll creation
const uploadTmp = multer({ storage: storageTmp, limits: { fileSize: 200 * 1024 * 1024 } });

const storageFilm = multer.diskStorage({
  destination: (req, file, cb) => cb(null, filmDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}${path.extname(file.originalname) || ''}`;
    cb(null, unique);
  }
});
const uploadFilm = multer({ storage: storageFilm, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = { uploadDefault, uploadTmp, uploadFilm };

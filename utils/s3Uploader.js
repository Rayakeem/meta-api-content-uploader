const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

const s3 = new S3Client({
  region: 'your_region',
  credentials: {
    accessKeyId: process.env.IAMACCESSKEYID,
    secretAccessKey: process.env.IAMSECRETACCESSKEY,
  },
});

// 공통 설정
const commonConfig = {
  s3: s3,
  bucket: 'your_bucket_name',
  contentType: multerS3.AUTO_CONTENT_TYPE,
};

// 파일명 생성 함수
const generateFileName = (req, file, cb, platform) => {
  const userId = req.userId;
  const timestamp = Date.now();
  const ext = path.extname(file.originalname);
  cb(null, `${platform}/${userId}/${timestamp}${ext}`);
};

// Facebook 업로드 설정
const uploadFacebook = multer({
  storage: multerS3({
    ...commonConfig,
    key: (req, file, cb) => {
      generateFileName(req, file, cb, 'facebook');
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Instagram 업로드 설정
const uploadInstagram = multer({
  storage: multerS3({
    ...commonConfig,
    key: (req, file, cb) => {
      generateFileName(req, file, cb, 'instagram');
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Threads 업로드 설정
const uploadThreads = multer({
  storage: multerS3({
    ...commonConfig,
    key: (req, file, cb) => {
      generateFileName(req, file, cb, 'threads');
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

module.exports = {
  uploadFacebook,
  uploadInstagram,
  uploadThreads,
};
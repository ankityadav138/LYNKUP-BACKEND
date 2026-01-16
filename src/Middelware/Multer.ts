// import multer, { StorageEngine } from 'multer';
// import fs from 'fs';
// import path from 'path';

// // Function to create a folder if it doesn't exist
// const createFolder = (folderPath: string): void => {
//   if (!fs.existsSync(folderPath)) {
//     fs.mkdirSync(folderPath, { recursive: true });
//   }
// };

// const gifFolder = path.join('./public/gif');
// const imagesFolder = path.join('./public/image');
// const videosFolder = path.join('./public/videos');

// // Create folders
// createFolder(gifFolder);
// createFolder(imagesFolder);
// createFolder(videosFolder);

// const storage: StorageEngine = multer.diskStorage({
//   destination: (req, file, cb) => {
//     if (file.fieldname === 'profileImage') {
//       cb(null, imagesFolder);
//     } else if (file.fieldname === 'video') {
//       cb(null, videosFolder);
//     } else if (file.fieldname === 'gif') {
//       cb(null, gifFolder);
//     } else {
//       cb(null, path.join('./public'));
//     }
//   },
//   filename: (req, file, cb) => {
//     const uploadPath = file.fieldname === 'profileImage' ? imagesFolder : 
//                       file.fieldname === 'video' ? videosFolder : 
//                       file.fieldname === 'gif' ? gifFolder : 
//                       path.join('./public');

//     const newFilename = new Date().toISOString().replace(/[-T:\.Z]/g, '') + '-' + file.originalname;
//     const filePath = path.join(uploadPath, newFilename);
//     if (fs.existsSync(filePath)) {
//       fs.unlinkSync(filePath);
//     }

//     cb(null, newFilename);
//   },
// });

// const upload = multer({ storage });
// export default upload;
// import multer from 'multer';
// import multerS3 from 'multer-s3';
// import { S3Client } from '@aws-sdk/client-s3'; 
// import { Request } from 'express';
// import dotenv from 'dotenv';

// dotenv.config();
// const s3 = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
//   },
// });
// const getFolder = (file: Express.Multer.File): string => {
//   if (file.mimetype.startsWith('image/')) {
//     return 'images/';
//   } else if (file.mimetype.startsWith('video/')) {
//     return 'videos/';
//   } else if (file.mimetype === 'image/gif') {
//     return 'gifs/';
//   } else {
//     return 'others/'; 
//   }
// };
// const s3Storage = multerS3({
//   s3: s3, 
//   bucket: process.env.AWS_S3_BUCKET_NAME!,
//   metadata: (req: Request, file: Express.Multer.File, cb: (error: any, metadata?: any) => void) => {
//     cb(null, { fieldName: file.fieldname });
//   },
//   key: (req: Request, file: Express.Multer.File, cb: (error: any, key?: string) => void) => {
//     const folder = getFolder(file);
//     const newFilename = `${folder}${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
//     cb(null, newFilename);
//   },
//   acl: 'public-read',
//   contentType: multerS3.AUTO_CONTENT_TYPE,
// });
// const upload = multer({
//   storage: s3Storage,
//   limits: { fileSize: 500 * 1024 * 1024 }, 
// });

// export default upload;
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";

dotenv.config();

// ✅ Configure S3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// ✅ Determine Upload Folder
const getFolder = (file: Express.Multer.File): string => {
  if (file.mimetype.startsWith("image/")) return "images/";
  if (file.mimetype.startsWith("video/")) return "videos/";
  if (file.mimetype === "image/gif") return "gifs/";
  return "others/";
};

// ✅ S3 Storage Configuration
const s3Storage = multerS3({
  s3,
  bucket: process.env.AWS_S3_BUCKET_NAME!,
  metadata: (req: Request, file: Express.Multer.File, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req: Request, file: Express.Multer.File, cb) => {
    const folder = getFolder(file);
    const newFilename = `${folder}${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, newFilename);
  },
  // acl: "public-read",
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

// ✅ Multer Configuration with File Size Limit
const upload = multer({
  storage: s3Storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
      return cb(new Error("Only images and videos are allowed!"));
    }
    cb(null, true);
  },
});
export const uploadHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: "File size is too large. Max 10GB allowed." });
      }
      return res.status(500).json({ success: false, message: err.message || "File upload failed." });
    }
    next();
  });
};

export default upload;

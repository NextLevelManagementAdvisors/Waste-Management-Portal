import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const PROVIDER_ALLOWED_MIMES = new Set([
  ...ALLOWED_MIMES,
  'application/pdf',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

function createUpload(subdir: string, allowedMimes: Set<string> = ALLOWED_MIMES) {
  const dir = path.resolve(__dirname, '..', 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    fileFilter: (_req, file, cb) => {
      if (allowedMimes.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed. Use JPEG, PNG, WebP, or PDF.`));
      }
    },
  });
}

export const onDemandUpload = createUpload('on-demand');
export const missedCollectionUpload = createUpload('missed-collection');
export const podUpload = createUpload('pod');
export const providerUpload = createUpload('providers', PROVIDER_ALLOWED_MIMES);

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-dev-key-do-not-use-in-production-1234567890123456';
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive data using AES-256-CBC
 * Returns: 'iv:encryptedData' (Base64 encoded)
 */
export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Combine IV and encrypted data, then Base64 encode
    const combined = iv.toString('hex') + ':' + encrypted;
    return Buffer.from(combined).toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data encrypted with encrypt()
 * Input: 'Base64 encoded (iv:encryptedData)'
 */
export function decrypt(encryptedData: string): string {
  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

    // Decode from Base64
    const combined = Buffer.from(encryptedData, 'base64').toString('utf8');
    const [ivHex, encrypted] = combined.split(':');

    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Validate ABA routing number using checksum algorithm
 * ABA routing numbers are 9 digits with mod-10 checksum
 */
export function validateRoutingNumber(routing: string): boolean {
  // Check length and format
  if (!routing || !/^\d{9}$/.test(routing)) {
    return false;
  }

  // ABA checksum validation (mod-10)
  // Formula: (d1*3 + d2*7 + d3*1 + d4*3 + d5*7 + d6*1 + d7*3 + d8*7 + d9*1) % 10 = 0
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += parseInt(routing[i]) * weights[i];
  }

  return sum % 10 === 0;
}

/**
 * Mask account number to show only last 4 digits
 */
export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length <= 4) {
    return '****';
  }
  const lastFour = accountNumber.slice(-4);
  return `****${lastFour}`;
}

/**
 * Validate account number format (1-17 digits)
 */
export function validateAccountNumber(account: string): boolean {
  return /^\d{1,17}$/.test(account);
}

/**
 * Validate account type
 */
export function validateAccountType(type: string): type is 'checking' | 'savings' {
  return type === 'checking' || type === 'savings';
}

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  validateRoutingNumber,
  maskAccountNumber,
  validateAccountNumber,
  validateAccountType,
} from '../encryption';

// ---------------------------------------------------------------------------
// encrypt / decrypt
// ---------------------------------------------------------------------------
describe('encrypt / decrypt', () => {
  it('round-trips plaintext correctly', () => {
    const original = 'sensitive data 123';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it('round-trips an empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('round-trips unicode and emoji', () => {
    const text = 'José Müller 🏦 account';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const text = 'same input';
    expect(encrypt(text)).not.toBe(encrypt(text));
  });

  it('returns a valid Base64 string', () => {
    const result = encrypt('hello');
    expect(() => Buffer.from(result, 'base64')).not.toThrow();
  });

  it('throws when given garbage input', () => {
    expect(() => decrypt('not-base64-at-all!!!!')).toThrow();
  });

  it('throws when ciphertext has no colon separator', () => {
    // A valid Base64 string but missing the IV:encrypted format
    const bad = Buffer.from('nocolon').toString('base64');
    expect(() => decrypt(bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateRoutingNumber
// ---------------------------------------------------------------------------
describe('validateRoutingNumber', () => {
  it('accepts a known valid ABA number (Chase)', () => {
    expect(validateRoutingNumber('021000021')).toBe(true);
  });

  it('accepts another valid ABA number (Bank of America)', () => {
    expect(validateRoutingNumber('026009593')).toBe(true);
  });

  it('rejects fewer than 9 digits', () => {
    expect(validateRoutingNumber('12345678')).toBe(false);
  });

  it('rejects more than 9 digits', () => {
    expect(validateRoutingNumber('1234567890')).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(validateRoutingNumber('02100002a')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateRoutingNumber('')).toBe(false);
  });

  it('rejects a 9-digit number that fails the checksum', () => {
    expect(validateRoutingNumber('123456789')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maskAccountNumber
// ---------------------------------------------------------------------------
describe('maskAccountNumber', () => {
  it('masks all but last 4 digits for a long number', () => {
    expect(maskAccountNumber('1234567890')).toBe('****7890');
  });

  it('masks a 5-digit account number correctly', () => {
    // '12345'.slice(-4) === '2345'
    expect(maskAccountNumber('12345')).toBe('****2345');
  });

  it('returns **** for exactly 4 characters (≤ 4 rule)', () => {
    expect(maskAccountNumber('1234')).toBe('****');
  });

  it('returns **** for a 3-character input', () => {
    expect(maskAccountNumber('123')).toBe('****');
  });

  it('returns **** for an empty string', () => {
    expect(maskAccountNumber('')).toBe('****');
  });
});

// ---------------------------------------------------------------------------
// validateAccountNumber
// ---------------------------------------------------------------------------
describe('validateAccountNumber', () => {
  it('accepts a typical 8-digit account number', () => {
    expect(validateAccountNumber('12345678')).toBe(true);
  });

  it('accepts a single digit', () => {
    expect(validateAccountNumber('1')).toBe(true);
  });

  it('accepts exactly 17 digits (max length)', () => {
    expect(validateAccountNumber('12345678901234567')).toBe(true);
  });

  it('rejects 18 digits (over max)', () => {
    expect(validateAccountNumber('123456789012345678')).toBe(false);
  });

  it('rejects alphabetic characters', () => {
    expect(validateAccountNumber('12abc')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateAccountNumber('')).toBe(false);
  });

  it('rejects a string with spaces', () => {
    expect(validateAccountNumber('1234 5678')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAccountType
// ---------------------------------------------------------------------------
describe('validateAccountType', () => {
  it('accepts "checking"', () => {
    expect(validateAccountType('checking')).toBe(true);
  });

  it('accepts "savings"', () => {
    expect(validateAccountType('savings')).toBe(true);
  });

  it('rejects "investment"', () => {
    expect(validateAccountType('investment')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateAccountType('')).toBe(false);
  });

  it('rejects mixed-case "Checking"', () => {
    expect(validateAccountType('Checking')).toBe(false);
  });
});

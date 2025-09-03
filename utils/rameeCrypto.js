// utils/rameeCrypto.js
const crypto = require("crypto");

// ⚠️ Put these in .env in production:
const KEY_STR =
  process.env.RAMEEPAY_SECRET_KEY || "YAbTqNJhYEPX344QRHCfD2xsAXRaMNoM"; // 32 bytes
const IV_STR = process.env.RAMEEPAY_SECRET_IV || "0123456789abcABC"; // 12 or 16 bytes; you have 16

const KEY = Buffer.from(KEY_STR, "utf8");
const IV = Buffer.from(IV_STR, "utf8");

// Validate sizes up-front so we fail fast
if (KEY.length !== 32) {
  throw new Error(`RAMEEPAY_SECRET_KEY must be 32 bytes. Got ${KEY.length}.`);
}
if (IV.length !== 12 && IV.length !== 16) {
  throw new Error(
    `RAMEEPAY_SECRET_IV must be 12 or 16 bytes. Got ${IV.length}.`
  );
}

/**
 * Encrypt a JS object using AES-256-GCM (base64 output).
 * Packing used here (common/expected): [IV][CIPHERTEXT][TAG]
 */
function encryptData(obj) {
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, IV);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(obj), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16 bytes

  // Many gateways expect iv + ciphertext + tag as base64
  const packed = Buffer.concat([IV, ciphertext, tag]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64 string produced by encryptData (or by the gateway).
 * Tries a couple of common packings to be resilient.
 */
function decryptData(base64) {
  const buf = Buffer.from(base64, "base64");

  // Helper
  const tryDecrypt = (iv, ct, tag) => {
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  };

  // 1) Try [IV][CIPHERTEXT][TAG]
  if (buf.length > IV.length + 16) {
    try {
      const iv = buf.slice(0, IV.length);
      const tag = buf.slice(buf.length - 16);
      const ct = buf.slice(IV.length, buf.length - 16);
      return tryDecrypt(iv, ct, tag);
    } catch {}
  }

  // 2) Try [CIPHERTEXT][TAG] (IV is agreed/constant from env)
  if (buf.length > 16) {
    try {
      const tag = buf.slice(buf.length - 16);
      const ct = buf.slice(0, buf.length - 16);
      return tryDecrypt(IV, ct, tag);
    } catch {}
  }

  // 3) Try [IV][TAG][CIPHERTEXT] (less common)
  if (buf.length > IV.length + 16) {
    try {
      const iv = buf.slice(0, IV.length);
      const tag = buf.slice(IV.length, IV.length + 16);
      const ct = buf.slice(IV.length + 16);
      return tryDecrypt(iv, ct, tag);
    } catch {}
  }

  throw new Error("Failed to decrypt with known packings.");
}

module.exports = { encryptData, decryptData };

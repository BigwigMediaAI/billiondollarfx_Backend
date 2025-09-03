// utils/rameeCrypto.js
const crypto = require("crypto");
require("dotenv").config();

const SECRET_KEY = process.env.RAMEEPAY_SECRET_KEY;
const SECRET_IV = process.env.RAMEEPAY_SECRET_IV; // must be at least 12 bytes

// AES-256-GCM encryption
function encryptData(data) {
  const iv = crypto.randomBytes(12); // IV should be 12 bytes for GCM
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(SECRET_KEY),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

// AES-256-GCM decryption
function decryptData(encryptedData) {
  const bData = Buffer.from(encryptedData, "base64");

  const iv = bData.slice(0, 12);
  const tag = bData.slice(12, 28);
  const text = bData.slice(28);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(SECRET_KEY),
    iv
  );
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(text), decipher.final()]);
  return JSON.parse(decrypted.toString());
}

module.exports = { encryptData, decryptData };

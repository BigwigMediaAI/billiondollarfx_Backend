// utils/rameeCrypto.js
const crypto = require("crypto");
require("dotenv").config();

const SECRET_KEY = process.env.RAMEEPAY_SECRET_KEY; // must be 32 bytes
const SECRET_IV = process.env.RAMEEPAY_SECRET_IV; // provided by Ramee (must be 12 or 16 bytes depending on config)

// AES-256-GCM encryption
function encryptData(data) {
  const iv = Buffer.from(SECRET_IV, "utf8"); // use fixed IV from dashboard
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

  const iv = bData.slice(0, 12); // fixed IV length
  const tag = bData.slice(12, 28); // 16-byte tag
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

// utils/rameeCrypto.js
const crypto = require("crypto");
require("dotenv").config();

const SECRET_KEY = process.env.RAMEEPAY_SECRET_KEY;
const SECRET_IV = process.env.RAMEEPAY_SECRET_IV; // must be at least 12 bytes

// AES-256-GCM encryption
function encryptData(data) {
  const jsonData = JSON.stringify(data);

  const key = crypto.createHash("sha256").update(SECRET_KEY).digest(); // 32-byte key
  const iv = Buffer.from(SECRET_IV, "utf8").slice(0, 12); // GCM needs 12 bytes

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(jsonData, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // combine cipher text + authTag and return base64
  const combined = Buffer.concat([encrypted, authTag]);
  return combined.toString("base64");
}

// AES-256-GCM decryption
function decryptData(base64Input) {
  const key = crypto.createHash("sha256").update(SECRET_KEY).digest();
  const iv = Buffer.from(SECRET_IV, "utf8").slice(0, 12);

  const combined = Buffer.from(base64Input, "base64");

  // split encrypted data and authTag
  const encrypted = combined.slice(0, combined.length - 16); // all but last 16 bytes
  const authTag = combined.slice(combined.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, null, "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

module.exports = { encryptData, decryptData };

// utils/rameeCrypto.js
const crypto = require("crypto");

const SECRET_KEY = process.env.RAMEEPAY_SECRET_KEY;
const SECRET_IV = process.env.RAMEEPAY_SECRET_IV; // must be 12 or 16 bytes

// AES-256-GCM encryption
function encryptData(data) {
  const jsonData = JSON.stringify(data);

  const key = crypto.createHash("sha256").update(SECRET_KEY).digest(); // 32-byte key
  const iv = Buffer.from(SECRET_IV, "utf8").slice(0, 12); // GCM prefers 12 bytes

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(jsonData, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag().toString("base64");

  // Combine encrypted data + authTag
  return Buffer.from(JSON.stringify({ encrypted, authTag })).toString("base64");
}

// AES-256-GCM decryption
function decryptData(base64Input) {
  const key = crypto.createHash("sha256").update(SECRET_KEY).digest();
  const iv = Buffer.from(SECRET_IV, "utf8").slice(0, 12);

  const decoded = Buffer.from(base64Input, "base64").toString("utf8");
  const { encrypted, authTag } = JSON.parse(decoded);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

module.exports = { encryptData, decryptData };

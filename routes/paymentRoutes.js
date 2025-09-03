// route/paymentRoutes.js
const axios = require("axios");
const express = require("express");
const router = express.Router();
const {
  handlePaymentCallback,
  handleRameeCallback,
} = require("../controllers/paymentController");
const { encryptData, decryptData } = require("../utils/rameeCrypto");
require("dotenv").config();

router.post("/callback", handlePaymentCallback);
router.post("/rameePay/callback", handleRameeCallback);

let DIGIPAY_TOKEN = null;
let TOKEN_EXPIRY = null;

// Login helper
async function digiPayLogin() {
  const res = await axios.post("https://digipay247.pgbackend.xyz/login", {
    username: process.env.DIGIPAY_USERNAME,
    password: process.env.DIGIPAY_PASSWORD,
  });

  DIGIPAY_TOKEN = res.data.data.token;
  TOKEN_EXPIRY = Date.now() + res.data.data.expires_in * 1000;
  return DIGIPAY_TOKEN;
}

// Deposit route
router.post("/deposit", async (req, res) => {
  try {
    const { amount, merchant_user_id } = req.body;

    if (!amount || !merchant_user_id) {
      return res.status(400).json({
        status: "FAILED",
        message: "amount and merchant_user_id required",
      });
    }

    // Ensure valid token
    if (!DIGIPAY_TOKEN || Date.now() > TOKEN_EXPIRY) {
      await digiPayLogin();
    }

    // Generate unique txn ID (<= 20 chars recommended for some systems)
    const merchant_txn_id = "TRXN" + Date.now();

    const response = await axios.post(
      "https://digipay247.pgbackend.xyz/payin/generate",
      {
        gateway_id: 23, // or configurable
        amount: parseInt(amount, 10), // ensure integer
        merchant_txn_id,
        merchant_user_id,
      },
      {
        headers: {
          Authorization: `Bearer ${DIGIPAY_TOKEN}`,
        },
      }
    );

    return res.json({
      status: response.data.status,
      message: response.data.message,
      payment_url: response.data.data.url,
      transaction_id: response.data.data.transaction_id,
      merchant_txn_id, // helpful to return for client reference
    });
  } catch (err) {
    console.error("Deposit error:", err.response?.data || err.message);
    return res.status(500).json({
      status: "FAILED",
      error: err.response?.data?.message || err.message,
    });
  }
});

function encryptAESGCM(secretKey, data) {
  if (Buffer.byteLength(secretKey) !== 32) {
    throw new Error("Secret key must be 32 bytes for AES-256-GCM");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(secretKey),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const encryptedBuffer = Buffer.concat([iv, encrypted, tag]);

  return encryptedBuffer.toString("base64");
}

function decryptAESGCM(secretKey, encryptedData) {
  if (Buffer.byteLength(secretKey) !== 32) {
    throw new Error("Secret key must be 32 bytes for AES-256-GCM");
  }

  const data = Buffer.from(encryptedData, "base64");

  const iv = data.slice(0, 12);
  const tag = data.slice(data.length - 16);
  const encryptedText = data.slice(12, data.length - 16);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(secretKey),
    iv
  );
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

const AGENT_CODE = process.env.RAMEEPAY_AGENT_CODE;

router.post("/ramee/deposit", async (req, res) => {
  try {
    const orderData = req.body; // whatever you send in Postman

    // Encrypt orderData
    const encryptedPayload = encryptAESGCM(
      process.env.RAMEEPAY_SECRET_KEY,
      JSON.stringify(orderData)
    );

    // Prepare body for Rameepay API
    const requestBody = {
      reqData: encryptedPayload,
      agentCode: AGENT_CODE,
    };

    // Call Rameepay API
    const response = await axios.post(
      "https://apis.rameepay.io/order/generate",
      requestBody,
      { headers: { "Content-Type": "application/json" } }
    );

    // Decrypt response if contains "data"
    let decryptedResponse = null;
    if (response.data.data) {
      decryptedResponse = decryptAESGCM(
        process.env.RAMEEPAY_SECRET_KEY,
        response.data.data
      );
    }

    res.json({
      rawRequest: orderData,
      encryptedRequest: encryptedPayload,
      rawResponse: response.data,
      decryptedResponse: decryptedResponse
        ? JSON.parse(decryptedResponse)
        : null,
    });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({
      error: err.message,
      details: err.response ? err.response.data : null,
    });
  }
});

module.exports = router;

// route/paymentRoutes.js
const axios = require("axios");
const express = require("express");
const router = express.Router();
const {
  handlePaymentCallback,
  handleRameeCallback,
} = require("../controllers/paymentController");
const { encryptData, decryptData } = require("../utils/rameeCrypto");

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

const RAMEE_AGENT_CODE = process.env.RAMEEPAY_AGENT_CODE;
const ORDER_GENERATE_URL = "https://apis.rameepay.io/order/generate";

router.post("/ramee/deposit", async (req, res) => {
  try {
    const { amount, accountNo } = req.body;

    const orderData = {
      orderid: "ORD" + Date.now(),
      amount,
      currency: "INR",
      accountNo,
      redirect_url: "https://www.billiondollarfx.com/live-accounts",
      callback_url:
        "https://winprofx-backend.onrender.com/api/payment/rameePay/callback",
    };

    console.log("📝 Order Data:", orderData);

    // Encrypt request
    const encryptedReq = encryptData(orderData);
    console.log("🔐 Encrypted Request:", encryptedReq);

    // Send to RameePay
    const response = await axios.post(
      ORDER_GENERATE_URL,
      { reqData: encryptedReq, agentCode: RAMEE_AGENT_CODE },
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("📩 Ramee Response:", response.data);

    // Validate response before decrypting
    if (
      !response.data ||
      !response.data.data ||
      response.data.status !== "true"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid response from RameePay",
        raw: response.data,
      });
    }

    // Decrypt response
    const decrypted = decryptData(response.data.data);
    console.log("🔓 Decrypted Response:", decrypted);

    return res.json({
      success: true,
      payUrl: decrypted.url,
      orderid: decrypted.orderid,
      merchantid: decrypted.merchantid,
    });
  } catch (error) {
    console.error("❌ Deposit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create deposit order",
      error: error.message,
    });
  }
});

module.exports = router;

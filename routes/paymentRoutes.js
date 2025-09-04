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
const Order = require("../models/Order");

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

const AGENT_CODE = process.env.RAMEEPAY_AGENT_CODE;
const RAMEEPAY_API = "https://apis.rameepay.io/order/generate";

router.post("/ramee/deposit", async (req, res) => {
  try {
    const { accountNo, amount } = req.body;

    if (!accountNo || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    // 1️⃣ Generate unique orderid
    const orderid = "ORD" + Date.now();

    // 2️⃣ Save in DB (map orderid → accountNo & amount)
    const newOrder = new Order({ orderid, accountNo, amount });
    await newOrder.save();

    // 3️⃣ Prepare payload for RameePay (only orderid & amount required)
    const orderData = { orderid, amount };

    // Encrypt payload
    const encryptedData = encryptData(orderData);

    const body = {
      reqData: encryptedData,
      agentCode: AGENT_CODE,
    };

    // 4️⃣ Send to RameePay
    const { data } = await axios.post(RAMEEPAY_API, body, {
      headers: { "Content-Type": "application/json" },
    });

    // Decrypt response if exists
    let decryptedResponse = {};
    if (data.data) {
      decryptedResponse = decryptData(data.data);
      console.log("✅ Decrypted Response:", decryptedResponse);
    }

    // 5️⃣ Return response to frontend
    res.json({
      success: true,
      message: "Order created & sent to RameePay",
      order: newOrder,
      raw: data,
      decrypted: decryptedResponse,
    });
  } catch (err) {
    console.error("❌ Deposit Error:", err.response?.data || err.message);
    res.status(500).json({ success: false, error: "Deposit failed" });
  }
});

module.exports = router;

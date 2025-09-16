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
const Withdrawal = require("../models/withdrawal");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

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

async function fetchRate() {
  try {
    const res = await axios.get(
      "https://api.frankfurter.app/latest?amount=1&from=INR&to=USD"
    );
    return res.data.rates.USD; // 1 INR = ? USD
  } catch (err) {
    console.error("Error fetching INR→USD rate:", err.message);
    return 0.012; // fallback rate if API fails
  }
}

const RAMEEPAY_WITHDRAWAL_API = "https://apis.rameepay.io/withdrawal/account";

// Save withdrawal request as Pending
router.post("/request", async (req, res) => {
  try {
    const { account, ifsc, name, mobile, amount, note, accountNo } = req.body;

    if (!account || !ifsc || !name || !mobile || !amount || !accountNo) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const orderid = `WDR${Date.now()}`;

    // 🔹 First, deduct from MoneyPlant to lock balance
    const usdRate = await fetchRate();
    const amountUSD = (parseFloat(amount) * usdRate).toFixed(2);

    await axios.post(
      "https://api.moneyplantfx.com/WSMoneyplant.aspx?type=SNDPAddBalance",
      {
        accountno: accountNo,
        amount: -Math.abs(amountUSD),
        orderid,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    // 🔹 Save withdrawal record in Pending state
    const withdrawalRecord = new Withdrawal({
      orderid,
      account,
      ifsc,
      name,
      mobile,
      amount,
      note,
      accountNo,
      status: "Pending",
    });
    await withdrawalRecord.save();

    res.json({
      success: true,
      message: "Withdrawal request submitted",
      withdrawalRecord,
    });
  } catch (err) {
    console.error("❌ Error saving withdrawal request:", err.message);
    res.status(500).json({ success: false, error: "Failed to save request" });
  }
});

router.post("/approve/:id", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    if (withdrawal.status !== "Pending") {
      return res
        .status(400)
        .json({ success: false, message: "Already processed" });
    }

    const { account, ifsc, name, mobile, amount, note, orderid } = withdrawal;

    // 🔹 Payload for RameePay
    const payload = {
      account,
      ifsc,
      name,
      mobile,
      amount: parseFloat(amount).toFixed(2), // "1000.00"
      note,
      orderid,
    };

    const encryptedData = encryptData(JSON.stringify(payload));
    const body = { reqData: encryptedData, agentCode: AGENT_CODE };

    const { data } = await axios.post(RAMEEPAY_WITHDRAWAL_API, body, {
      headers: { "Content-Type": "application/json" },
    });

    let decryptedResponse = {};

    if (data.status === "true") {
      decryptedResponse = decryptData(data.data);
    } else {
      // API returned failure without decrypting
      decryptedResponse = {
        success: false,
        message: "RameePay rejected request",
      };
    }

    console.log("🔓 RameePay Response:", decryptedResponse);

    if (decryptedResponse.success === true) {
      // ✅ Mark as completed
      withdrawal.status = "Completed";
      withdrawal.response = decryptedResponse;
      await withdrawal.save();

      // Send success email
      const user = await User.findOne({ phone: withdrawal.mobile });
      if (user) {
        const usdRate = await fetchRate();
        const amountUSD = (parseFloat(amount) * usdRate).toFixed(2);

        await sendEmail({
          to: user.email,
          subject: "Withdrawal Successful",
          html: `<p>Hi ${user.fullName}, your withdrawal of ₹${amount} (≈ $${amountUSD}) is successful.</p>`,
        });
      }

      return res.json({
        success: true,
        message: "Withdrawal completed",
        decryptedResponse,
      });
    } else {
      // ❌ Failed → refund MoneyPlant
      const usdRate = await fetchRate();
      const amountUSD = (parseFloat(amount) * usdRate).toFixed(2);
      const refundOrderId = `RF${Date.now()}`;

      await axios.post(
        "https://api.moneyplantfx.com/WSMoneyplant.aspx?type=SNDPAddBalance",
        {
          accountno: withdrawal.accountNo,
          amount: +Math.abs(amountUSD),
          orderid: refundOrderId,
        },
        { headers: { "Content-Type": "application/json" } }
      );

      withdrawal.status = "Failed";
      withdrawal.response = decryptedResponse;
      await withdrawal.save();

      return res.json({
        success: false,
        message: "Withdrawal failed, amount refunded",
        decryptedResponse,
      });
    }
  } catch (err) {
    console.error("RameePay error:", err.response?.data || err.message);
    res
      .status(500)
      .json({ success: false, error: "Withdrawal processing failed" });
  }
});

// Reject withdrawal request (Admin action)
router.post("/reject/:id", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res
        .status(404)
        .json({ success: false, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "Pending") {
      return res
        .status(400)
        .json({ success: false, message: "Withdrawal already processed" });
    }

    // 🔹 Refund via MoneyPlant
    const usdRate = await fetchRate();
    const amountUSD = (parseFloat(withdrawal.amount) * usdRate).toFixed(2);

    const refundOrderId = `RF${Date.now()}`;

    console.log(withdrawal.accountNo, amountUSD, refundOrderId);

    await axios.post(
      "https://api.moneyplantfx.com/WSMoneyplant.aspx?type=SNDPAddBalance",
      {
        accountno: withdrawal.accountNo,
        amount: +Math.abs(amountUSD),
        orderid: refundOrderId,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    withdrawal.status = "Rejected";
    withdrawal.response = { message: "Rejected by admin" };
    await withdrawal.save();

    // Notify user
    const user = await User.findOne({ phone: withdrawal.mobile });
    // console.log(user);
    if (user) {
      await sendEmail({
        to: user.email,
        subject: "Withdrawal Request Rejected",
        html: `
          <p>Dear ${user.fullName || "Customer"},</p>
          <p>Your withdrawal request (Order ID: <b>${
            withdrawal.orderid
          }</b>) has been <b>rejected</b> by the admin.</p>
          <p>Amount Requested: ₹${withdrawal.amount}</p>
          <p>The amount has been refunded to your account.</p>
          <br/>
          <p>Best Regards,<br/>Support Team</p>
        `,
      });
    }

    res.json({ success: true, message: "Withdrawal rejected & refunded" });
  } catch (err) {
    console.error("❌ Reject withdrawal error:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Failed to reject withdrawal" });
  }
});

router.get("/withdrawals", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: "Pending" }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: withdrawals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/deposit/:accountNo", async (req, res) => {
  try {
    const { accountNo } = req.params;

    // Find all deposits for this account, sorted by latest first
    const deposits = await Order.find({ accountNo }).sort({ createdAt: -1 });

    if (!deposits || deposits.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No deposits found for this account",
      });
    }

    res.status(200).json({
      success: true,
      count: deposits.length,
      deposits,
    });
  } catch (err) {
    console.error("❌ Error fetching deposits:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/withdrawal/:accountNo", async (req, res) => {
  try {
    const { accountNo } = req.params;

    // Find all withdrawals for this account, latest first
    const withdrawals = await Withdrawal.find({ accountNo }).sort({
      createdAt: -1,
    });

    if (!withdrawals || withdrawals.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No withdrawals found for this account",
      });
    }

    res.status(200).json({
      success: true,
      count: withdrawals.length,
      withdrawals,
    });
  } catch (err) {
    console.error("❌ Error fetching withdrawals:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/deposit", async (req, res) => {
  try {
    // Find all deposits for this account, sorted by latest first
    const deposits = await Order.find().sort({ createdAt: -1 });

    if (!deposits || deposits.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No deposits found ",
      });
    }

    res.status(200).json({
      success: true,
      count: deposits.length,
      deposits,
    });
  } catch (err) {
    console.error("❌ Error fetching deposits:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/withdrawal", async (req, res) => {
  try {
    // Find all withdrawals for this account, latest first
    const withdrawals = await Withdrawal.find().sort({
      createdAt: -1,
    });

    if (!withdrawals || withdrawals.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No withdrawals found ",
      });
    }

    res.status(200).json({
      success: true,
      count: withdrawals.length,
      withdrawals,
    });
  } catch (err) {
    console.error("❌ Error fetching withdrawals:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
module.exports = router;

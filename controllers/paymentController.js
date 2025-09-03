const axios = require("axios");
const Transaction = require("../models/Transaction");
const { decryptData } = require("../utils/rameeCrypto");

exports.handlePaymentCallback = async (req, res) => {
  try {
    const txn = req.body.transaction; // ✅ correct structure

    if (!txn || !txn.id) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid callback data" });
    }

    // 1. Check if transaction already processed
    const existing = await Transaction.findOne({ transactionId: txn.id });
    if (existing) {
      return res
        .status(200)
        .json({ success: true, message: "Duplicate callback ignored" });
    }

    // 2. Save transaction
    const transaction = new Transaction({
      transactionId: txn.id,
      status: txn.status,
      merchantTxnId: txn.merchant_txn_id,
      merchantUserId: txn.merchant_user_id,
      amount: Number(txn.amount),
      type: txn.type,
      addedOn: new Date(txn.added_on),
      refId: txn.ref_id,
      gateway: txn.gateway ? Number(txn.gateway) : null,
      merchant: txn.merchant ? Number(txn.merchant) : null,
      wallet: txn.wallet ? Number(txn.wallet) : null,
      currency: txn.currency || "INR",
      transactionPayinRequests: Array.isArray(txn.transaction_payin_requests)
        ? txn.transaction_payin_requests
        : [],
    });

    await transaction.save();

    // 3. If payment is completed, call MoneyPlant API
    if (txn.status === "completed") {
      const accountno = txn.merchant_user_id; // maps to trading accountno
      const amount = Number(txn.amount);
      const orderid = "ORD" + Date.now().toString().slice(-10); // <=16 char

      try {
        const mpResponse = await axios.post(
          "https://api.moneyplantfx.com/WSMoneyplant.aspx?type=SNDPAddBalance",
          { accountno, amount, orderid },
          { headers: { "Content-Type": "application/json" } }
        );

        return res.status(200).json({
          success: true,
          message: "Transaction saved and balance updated",
          moneyplant: mpResponse.data,
        });
      } catch (err) {
        console.error("MoneyPlant AddBalance error:", err.message);
        return res.status(500).json({
          success: false,
          message: "Transaction saved but balance update failed",
          error: err.message,
        });
      }
    }

    // 4. If not completed
    return res.status(200).json({
      success: true,
      message: "Transaction saved but payment not completed",
    });
  } catch (error) {
    console.error("Error in callback:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.handleRameeCallback = async (req, res) => {
  try {
    const { data, agentCode } = req.body;
    if (!data || !agentCode) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payload" });
    }

    // 1. Decrypt Rameepay response
    const txn = decryptData(data);

    console.log("Decrypted Webhook:", txn);

    if (txn.status === "SUCCESS") {
      // 2. Call MoneyPlant API to credit balance
      const accountno = txn.merchantid;
      const amount = txn.realAmount;
      const orderid = txn.orderid;

      try {
        const mpResponse = await axios.post(
          "https://api.moneyplantfx.com/WSMoneyplant.aspx?type=SNDPAddBalance",
          { accountno, amount, orderid },
          { headers: { "Content-Type": "application/json" } }
        );

        console.log("MoneyPlant Response:", mpResponse.data);
      } catch (err) {
        console.error("MoneyPlant Error:", err.message);
      }
    }

    // 3. Acknowledge webhook
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Callback Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

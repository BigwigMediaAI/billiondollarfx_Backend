const express = require("express");
const Order = require("../models/Order");

const router = express.Router();

// Save mapping orderid → accountNo
router.post("/save", async (req, res) => {
  try {
    const { orderid, accountNo, amount } = req.body;

    if (!orderid || !accountNo || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const newOrder = new Order({ orderid, accountNo, amount });
    await newOrder.save();

    res.json({ success: true, message: "Order saved", order: newOrder });
  } catch (err) {
    console.error("Save Order Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

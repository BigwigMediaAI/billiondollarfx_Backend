// controllers/ibController.js
const IB = require("../models/Broker.model");
const User = require("../models/User");

/**
 * 📌 Register IB Request (User Side)
 */
const registerIB = async (req, res) => {
  try {
    const {
      email,
      existingClientBase,
      offerEducation,
      expectedClientsNext3Months,
      expectedCommissionDirect,
      expectedCommissionSubIB,
      yourShare,
      clientShare,
    } = req.body;

    // check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // check if already requested
    const existingIB = await IB.findOne({ email });
    if (existingIB) {
      return res.status(400).json({ message: "IB request already submitted" });
    }

    const newIB = new IB({
      email,
      existingClientBase,
      offerEducation,
      expectedClientsNext3Months,
      expectedCommissionDirect,
      expectedCommissionSubIB,
      yourShare,
      clientShare,
    });

    await newIB.save();

    res
      .status(201)
      .json({ message: "IB request submitted successfully", newIB });
  } catch (err) {
    console.error("❌ Error submitting IB request:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📌 Get All IB Requests (Admin Side)
 */
const getAllIBRequests = async (req, res) => {
  try {
    const ibRequests = await IB.find().sort({ createdAt: -1 });
    res.json(ibRequests);
  } catch (err) {
    console.error("❌ Error fetching IB requests:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📌 Approve IB Request (Admin Side)
 */
const approveIBByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    const ib = await IB.findOne({ email });
    if (!ib) return res.status(404).json({ message: "IB request not found" });

    // generate referral code
    const referralCode =
      "IB" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // update IB
    ib.status = "approved";
    ib.referralCode = referralCode;
    await ib.save();

    // update user
    await User.findOneAndUpdate({ email }, { isApprovedIB: true });

    res.json({ message: "IB approved successfully", referralCode });
  } catch (err) {
    console.error("❌ Error approving IB:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📌 Reject IB Request (Admin Side)
 */
const rejectIBByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    const ib = await IB.findOne({ email });
    if (!ib) return res.status(404).json({ message: "IB request not found" });

    ib.status = "rejected";
    await ib.save();

    res.json({ message: "IB rejected successfully" });
  } catch (err) {
    console.error("❌ Error rejecting IB:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerIB,
  getAllIBRequests,
  approveIBByEmail,
  rejectIBByEmail,
};

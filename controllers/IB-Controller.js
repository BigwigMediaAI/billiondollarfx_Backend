const Broker = require("../models/Broker.model");
const crypto = require("crypto");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

// Generate a unique referral key
function generateReferralKey() {
  return crypto.randomBytes(6).toString("hex"); // e.g. "a1b2c3d4e5f6"
}

// Add new broker (form submission)
exports.registerBroker = async (req, res) => {
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

    const broker = new Broker({
      email,
      existingClientBase,
      offerEducation,
      expectedClientsNext3Months,
      expectedCommissionDirect,
      expectedCommissionSubIB,
      yourShare,
      clientShare,
    });

    await broker.save();

    res.status(201).json({
      success: true,
      message: "Broker registered successfully, pending admin approval.",
      data: broker,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Admin approves broker
// Admin approves broker
exports.approveBroker = async (req, res) => {
  try {
    const { email } = req.params;

    const broker = await Broker.findOne({ email });
    if (!broker)
      return res
        .status(404)
        .json({ success: false, message: "Broker not found" });

    if (broker.status === "approved") {
      return res
        .status(400)
        .json({ success: false, message: "Broker is already approved" });
    }

    broker.status = "approved";
    broker.referralKey = generateReferralKey();

    // Auto-adjust client share logic if needed
    if (!broker.clientShare || broker.clientShare === "auto-adjusted") {
      broker.clientShare = `${100 - (broker.yourShare || 0)}%`; // example logic
    }

    await broker.save();

    // Update corresponding user
    const user = await User.findOneAndUpdate(
      { email },
      { isApprovedIB: true },
      { new: true }
    );

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User email not found" });
    }

    // 🔹 Send approval email
    await sendEmail({
      to: user.email,
      subject: "Your Introducing Broker Application Approved",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2c3e50;">Congratulations ${
            user.fullName || "Broker"
          }!</h2>
          <p>Your application as an Introducing Broker has been <strong style="color:green;">approved</strong>.</p>
          
          <p><strong>Details:</strong></p>
          <ul>
            <li><strong>Email:</strong> ${user.email}</li>
            <li><strong>Referral Key:</strong> ${broker.referralKey}</li>
            <li><strong>Status:</strong> Approved</li>
            <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
          </ul>

          <p>You can now start referring clients using your referral key.</p>
          
          <p>If you have any questions, feel free to contact our support team.</p>
          <br/>
          <p>Best Regards,<br/>The Support Team</p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "Broker approved successfully",
      referralKey: broker.referralKey,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Admin rejects broker
exports.rejectBroker = async (req, res) => {
  try {
    const { email } = req.params;

    const broker = await Broker.findOne({ email });
    if (!broker)
      return res
        .status(404)
        .json({ success: false, message: "Broker not found" });

    broker.status = "rejected";
    broker.referralKey = null;
    // Update corresponding user

    await broker.save();

    const user = await User.findOneAndUpdate(
      { email },
      { isApprovedIB: false },
      { new: false }
    );

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User email not found" });
    }

    // 🔹 Send rejection email
    await sendEmail({
      to: user.email,
      subject: "Your Introducing Broker Application Rejected",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #c0392b;">Application Update</h2>
          <p>Dear ${user.fullName || "Broker"},</p>
          <p>We regret to inform you that your application as an Introducing Broker has been <strong style="color:red;">rejected</strong> at this time.</p>
          
          <p><strong>Details:</strong></p>
          <ul>
            <li><strong>Email:</strong> ${user.email}</li>
            <li><strong>Status:</strong> Rejected</li>
            <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
          </ul>

          <p>If you believe this was a mistake or would like to reapply, please contact our support team for further guidance.</p>
          
          <br/>
          <p>Best Regards,<br/>The Support Team</p>
        </div>
      `,
    });

    res.json({ success: true, message: "Broker rejected" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get all brokers (admin only)
exports.getAllBrokers = async (req, res) => {
  try {
    const brokers = await Broker.find();
    res.json({ success: true, data: brokers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

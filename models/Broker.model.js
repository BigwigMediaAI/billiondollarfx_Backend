const mongoose = require("mongoose");

const brokerSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },

    // Onboarding Questions
    existingClientBase: {
      type: String,
      enum: ["Yes", "No"],
      required: true,
    },
    offerEducation: {
      type: String,
      enum: ["Yes", "No"],
      required: true,
    },
    expectedClientsNext3Months: {
      type: String,
      enum: ["0-10", "10-50", "50-100", "100+"], // customize options as per frontend
      required: true,
    },
    expectedCommissionDirect: {
      type: String,
      required: true, // e.g. "5 USD per lot" or dropdown value
    },
    expectedCommissionSubIB: {
      type: String,
      required: true,
    },
    yourShare: {
      type: Number,
      default: 0,
    },
    clientShare: {
      type: String, // auto-adjusted from backend logic if needed
      default: "auto-adjusted",
    },

    // Approval Flow
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    referralKey: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IB", brokerSchema);

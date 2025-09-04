const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    orderid: { type: String, required: true, unique: true },
    account: String,
    ifsc: String,
    name: String,
    mobile: String,
    amount: Number,
    note: String,
    accountNo: { type: String, required: true },
    status: { type: Boolean, default: false }, // false = pending, true = success
    response: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Withdrawal", withdrawalSchema);

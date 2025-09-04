import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderid: { type: String, required: true, unique: true },
    accountNo: { type: String, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Order", orderSchema);

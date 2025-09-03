const express = require("express");
const {
  requestBrokerOTP,
  verifyBrokerOTP,
  getAllBrokers,
} = require("../controllers/brokerController");

const router = express.Router();

router.post("/request-otp", requestBrokerOTP); // Step 1
router.post("/verify", verifyBrokerOTP); // Step 2
router.get("/", getAllBrokers); // View verified brokers

module.exports = router;

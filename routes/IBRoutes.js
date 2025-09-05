// routes/brokerRoutes.js
const express = require("express");
const router = express.Router();
const brokerController = require("../controllers/IB-Controller");

// Broker registers
router.post("/register", brokerController.registerBroker);

// Admin actions
router.put("/approve/:email", brokerController.approveBroker);
router.put("/reject/:email", brokerController.rejectBroker);

// Admin fetch all brokers
router.get("/", brokerController.getAllBrokers);

module.exports = router;

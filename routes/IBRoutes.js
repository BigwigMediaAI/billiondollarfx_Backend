// routes/ibRoutes.js
const express = require("express");
const router = express.Router();
const {
  registerIB,
  getAllIBRequests,
  approveIBByEmail,
  rejectIBByEmail,
} = require("../controllers/ibController");

// User side
router.post("/register", registerIB);

// Admin side
router.get("/", getAllIBRequests);
router.put("/:email/approve", approveIBByEmail);
router.put("/:email/reject", rejectIBByEmail);

module.exports = router;

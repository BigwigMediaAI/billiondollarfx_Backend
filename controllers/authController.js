const User = require("../models/User");
const Account = require("../models/account.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
// const sendWhatsAppOTP = require("../utils/sendWhatsAppOTP");

exports.register = async (req, res) => {
  const {
    fullName,
    email,
    phone,
    nationality,
    state,
    city,
    password,
    referralCode,
  } = req.body;

  try {
    // 🔍 Check email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // 🔍 Check phone
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res
        .status(400)
        .json({ message: "Phone number already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    const user = new User({
      fullName,
      email,
      phone,
      nationality,
      state,
      city,
      password: hashedPassword,
      referralCode,
      otp,
      otpExpires,
    });

    await user.save();

    await sendEmail({
      to: email,
      subject: "Verify Your Email Address - OTP Code",
      html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #2c3e50;">Email Verification Required</h2>
      <p>Dear ${fullName || "User"},</p>
      <p>Thank you for registering with us. To complete your sign-up, please use the One-Time Password (OTP) below to verify your email address:</p>
      
      <p style="font-size: 20px; font-weight: bold; color: #2c3e50; text-align: center; margin: 20px 0;">
        ${otp}
      </p>
      
      <p>This OTP is valid for <strong>5 minutes</strong>. Please do not share this code with anyone for security reasons.</p>
      
      <p>If you did not initiate this request, you can safely ignore this email.</p>
      
      <br/>
      <p>Best Regards,<br/>The Support Team</p>
    </div>
  `,
    });

    // await sendWhatsAppOTP(phone, otp);

    res.status(200).json({ message: "OTP sent to email" });
  } catch (err) {
    res.status(500).json({ message: "Error sending OTP", error: err.message });
  }
};

exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });

    if (!user.otp || !user.otpExpires || new Date() > user.otpExpires)
      return res
        .status(400)
        .json({ message: "OTP expired. Please register again." });

    if (user.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    // OTP matched – now activate
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    await sendEmail({
      to: user.email,
      subject: "Your Account is Verified",
      html: `
        <p>Hi ${user.fullName},</p>
        <p>Congratulations! Your account has been successfully verified.</p>
        <p>You can now log in and start using your account.</p>
        <p>Thank you</p>
      `,
    });

    res.status(201).json({
      message: "User verified & registered",
      token,
      user: user.fullName,
      user: user.email,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "OTP verification failed", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    // 🚫 Block login if OTP is still pending
    if (user.otp) {
      return res.status(403).json({
        message: "Please verify your OTP before logging in.",
      });
    }

    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your account via OTP." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    user.resetOtp = otp;
    user.resetOtpExpires = otpExpires;
    await user.save();

    await sendEmail({
      to: email,
      subject: "Password Reset Request - OTP Code",
      html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #2c3e50;">Password Reset Verification</h2>
      <p>Dear ${user.fullName || "User"},</p>
      <p>We received a request to reset the password for your account. To proceed, please use the One-Time Password (OTP) provided below:</p>
      
      <p style="font-size: 20px; font-weight: bold; color: #2c3e50; text-align: center; margin: 20px 0;">
        ${otp}
      </p>
      
      <p>This OTP is valid for <strong>5 minutes</strong>. Do not share this code with anyone for security purposes.</p>
      
      <p>If you did not request a password reset, please ignore this email. Your account remains secure.</p>
      
      <br/>
      <p>Best Regards,<br/>The Support Team</p>
    </div>
  `,
    });

    // Send WhatsApp
    // await sendWhatsAppOTP(user.phone, otp);

    res.status(200).json({ message: "OTP sent to email" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to send reset OTP", error: err.message });
  }
};

exports.verifyAndResetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !user.resetOtp || !user.resetOtpExpires) {
      return res.status(400).json({ message: "Invalid request or OTP" });
    }

    // Check if OTP expired
    if (new Date() > user.resetOtpExpires) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // Check if OTP matches
    if (user.resetOtp !== otp) {
      return res.status(400).json({ message: "Incorrect OTP" });
    }

    // Hash and update the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields
    user.resetOtp = null;
    user.resetOtpExpires = null;

    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({
      message: "Error resetting password",
      error: err.message,
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password -otp -otpExpires -resetOtp -resetOtpExpires")
      .sort({ createdAt: -1 }); // ✅ newest first

    res.json(users);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: err.message });
  }
};

exports.getUserByEmail = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await User.findOne({ email })
      .select("-password -otp -otpExpires -resetOtp -resetOtpExpires")
      .populate("accounts"); // uses virtual populate

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch user", error: err.message });
  }
};

exports.uploadProfileImage = async (req, res) => {
  try {
    const { email } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "No file received in request." });
    }

    const profileImage = req.file.path;

    const user = await User.findOneAndUpdate(
      { email },
      { profileImage },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Backend error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const { email } = req.params;
    const updateFields = req.body;

    const user = await User.findOneAndUpdate(
      { email },
      { $set: updateFields },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateDocuments = async (req, res) => {
  try {
    const { email } = req.params;

    // console.log("FILES:", req.files); // Debug

    const identityFront = req.files?.identityFront?.[0]?.path;
    const identityBack = req.files?.identityBack?.[0]?.path;
    const addressProof = req.files?.addressProof?.[0]?.path;
    const selfieProof = req.files?.selfieProof?.[0]?.path;

    const updateFields = {};
    if (identityFront) updateFields.identityFront = identityFront;
    if (identityBack) updateFields.identityBack = identityBack;
    if (addressProof) updateFields.addressProof = addressProof;
    if (selfieProof) updateFields.selfieProof = selfieProof;

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { $set: updateFields },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    res.status(200).json({
      success: true,
      message: "Documents updated successfully",
      user,
    });
  } catch (err) {
    console.error("Update failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// 3. Update Bank Details by email
exports.updateBankDetails = async (req, res) => {
  try {
    const { email } = req.params;
    const {
      accountHolderName,
      accountNumber,
      ifscCode,
      iban,
      bankName,
      bankAddress,
    } = req.body;

    // Save details in pendingBankDetails
    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          pendingBankDetails: {
            accountHolderName,
            accountNumber,
            ifscCode,
            iban,
            bankName,
            bankAddress,
          },
          bankApprovalStatus: "pending",
        },
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      success: true,
      message: "Bank details submitted for approval",
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { email } = req.params;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Old password is incorrect." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    console.error("Password change failed:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

exports.verifyKyc = async (req, res) => {
  try {
    const { email } = req.params;
    const { status } = req.body; // true = approve, false = reject

    const user = await User.findOneAndUpdate(
      { email },
      { isKycVerified: status },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await sendEmail({
      to: user.email,
      subject: `Your KYC has been ${status ? "approved ✅" : "rejected ❌"}`,
      html: `
        <p>Hi ${user.fullName},</p>
        <p>Your KYC verification has been <b>${
          status ? "approved" : "rejected"
        }</b>.</p>
        <p>${
          status
            ? "You can now access all features of your account."
            : "Please contact support for further assistance."
        }</p>
        <p>Thank you</p>
      `,
    });

    res.json({
      message: `User KYC ${status ? "approved ✅" : "rejected ❌"}`,
      user,
    });
  } catch (error) {
    console.error("Error verifying KYC:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getUnverifiedUsers = async (req, res) => {
  try {
    const users = await User.find({ isKycVerified: false });
    res.json(users);
  } catch (error) {
    console.error("Error fetching unverified users:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Delete a user by email
exports.deleteUser = async (req, res) => {
  try {
    const { email } = req.params;

    const user = await User.findOneAndDelete({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await sendEmail({
      to: user.email,
      subject: `KYC Verification Rejected - Action Required`,
      html: `
        <p>Dear ${user.fullName},</p>

        <p>We regret to inform you that your KYC verification process could not be completed because the required documents were not uploaded within the stipulated 3-day timeframe as part of our compliance procedure.</p>

        <p>As a result, your account has been automatically rejected and deleted from our system for security and regulatory compliance purposes.</p>

        <p>If you wish to use our services in the future, you are welcome to register a new account and follow the KYC verification process from the beginning.</p>

        <p>For further assistance, please contact our support team.</p>

        <p>Thank you for your understanding.</p>

        <p>Best regards,<br/>The Compliance Team</p>
      `,
    });

    res.json({
      message: `User with email ${email} deleted due to incomplete KYC within 3-day deadline 🚮`,
      user,
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
exports.approveBankDetails = async (req, res) => {
  try {
    const { email } = req.params;
    const { approve } = req.body; // true = approve, false = reject

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (approve) {
      // Move pendingBankDetails to actual bank fields
      const { pendingBankDetails } = user;
      user.accountHolderName = pendingBankDetails.accountHolderName;
      user.accountNumber = pendingBankDetails.accountNumber;
      user.ifscCode = pendingBankDetails.ifscCode;
      user.iban = pendingBankDetails.iban;
      user.bankName = pendingBankDetails.bankName;
      user.bankAddress = pendingBankDetails.bankAddress;
      user.bankApprovalStatus = "approved";
      user.pendingBankDetails = {}; // clear pending
    } else {
      user.bankApprovalStatus = "rejected";
      user.pendingBankDetails = {}; // clear pending
    }

    await user.save();

    // Optionally send email to user about approval/rejection
    // await sendEmail({ to: user.email, subject: "...", html: "..." });

    res.status(200).json({
      success: true,
      message: `Bank details ${approve ? "approved" : "rejected"}`,
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

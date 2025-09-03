const User = require("../models/User");
const Account = require("../models/account.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const sendWhatsAppOTP = require("../utils/sendWhatsAppOTP");

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
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

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
      subject: "Your OTP Code",
      html: `<p>Your OTP is <strong>${otp}</strong></p>`,
    });

    await sendWhatsAppOTP(phone, otp);

    res.status(200).json({ message: "OTP sent to email and WhatsApp" });
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

    // Send Email
    await sendEmail({
      to: email,
      subject: "Password Reset OTP",
      html: `<p>Your OTP to reset your password is <strong>${otp}</strong></p>`,
    });

    // Send WhatsApp
    await sendWhatsAppOTP(user.phone, otp);

    res.status(200).json({ message: "OTP sent to email and WhatsApp" });
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
    const users = await User.find().select(
      "-password -otp -otpExpires -resetOtp -resetOtpExpires"
    );
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

    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: {
          accountHolderName,
          accountNumber,
          ifscCode,
          iban,
          bankName,
          bankAddress,
        },
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ success: true, user });
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

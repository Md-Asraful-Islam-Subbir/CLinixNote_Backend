import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import crypto from "crypto";

dotenv.config(); // Load environment variables

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET; // Load from .env

router.post("/signup", async (req, res) => {
  const { name, email, password, userType } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const emailVerifyToken = crypto.randomBytes(32).toString("hex");
    const emailVerifyExpires = Date.now() + 10 * 60 * 1000; // 10 mins

    user = new User({
      name,
      email,
      password: hashedPassword,
      role: userType,
      emailVerifyToken,
      emailVerifyExpires,
    });

    await user.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your email for signIn ClinixNote",
      html: `
        <h2>Hello ${name} ,ClinixNote</h2>
        <p>Click the link below to verify your email:</p>
        <a href="http://localhost:5173/verify-email/${emailVerifyToken}">Verify Email</a>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Verification email sent. Please check your inbox." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
});

router.get("/verify-email/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    user.isVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully. You can now log in." });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password, userType } = req.body;

  try {
    const user = await User.findOne({ email, role: userType });
    if (!user) return res.status(400).json({ message: "Wrong password or gmail id" });

    if (user.role === "Doctor" && user.status === "Pending") {
      return res.status(401).json({ message: "Your application is still pending approval by Admin." });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: "Please verify your email before logging in." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, role: user.role });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});


router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "User not found" });

        const resetToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "15m" });
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 900000; // 15 minutes

        await user.save();

        // Send email with reset token
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Password Reset",
            text: `To reset your password, click on the following link: http://localhost:5173/reset-password/${resetToken}`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return res.status(500).json({ message: "Error sending email" });
            }
            res.status(200).json({ message: "Password reset link sent to your email" });
        });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});
router.post("/reset-password/:token", async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({
            _id: decoded.id,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) return res.status(400).json({ message: "Invalid or expired token" });

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();
        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});
router.post("/admin/add", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.id);

    if (currentUser.role !== "Admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashed,
      role: "Admin",
      isVerified: true,
    });

    await user.save();
    res.status(201).json({ message: "Admin created successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});
router.post("/admin/add-doctor", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.id);

    if (currentUser.role !== "Admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { name, email, password, specialization } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const emailVerifyToken = crypto.randomBytes(32).toString("hex");
    const emailVerifyExpires = Date.now() + 10 * 60 * 1000;

    const doctor = new User({
      name,
      email,
      password: hashed,
      role: "Doctor",
      specialization,
      emailVerifyToken,
      emailVerifyExpires,
    });

    await doctor.save();

    // Send verification mail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "ClinixNote Doctor Account Verification",
      html: `
        <h2>Welcome Dr. ${name}</h2>
        <p>Verify your email to activate your ClinixNote doctor account:</p>
        <a href="http://localhost:5173/verify-email/${emailVerifyToken}">Verify Email</a>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: "Doctor added and verification email sent." });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Fetch Logged-In Doctor's Information
router.get("/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const doctor = await User.findById(decoded.id).select("-password");

    if (!doctor || doctor.role !== "Doctor") {
      return res.status(403).json({ message: "Access denied" });
    }
console.log(doctor);
    res.json(doctor); // Return doctor info (name, email, etc.)
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "Invalid token" });
  }
});
router.get("/total", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments(); // Counts all users in the collection
    res.json({ total: totalUsers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});
router.get("/total-doctors", async (req, res) => {
  try {
    const totalDoctors = await User.countDocuments({ role: "Doctor" }); // only doctors
    res.json({ total: totalDoctors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});
export default router;

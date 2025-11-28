import express from "express";
import Patient from "../models/Patient.js";
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import multer from "multer";
import dotenv from 'dotenv';
import authMiddleware from '../middleware/authMiddleware.js';
import QuickAppointment from '../models/QuickAppointment.js'; 
dotenv.config();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Folder to save files (create if doesn't exist)
  },
  filename: (req, file, cb) => {
    // Give each file a unique name
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

// Initialize multer with storage
const upload = multer({ storage });
const router = express.Router();

router.post('/add/:appointmentId', authMiddleware, async (req, res) => {
  try {
    const appointmentId = req.params.appointmentId;

    // Find the appointment
    const appointment = await QuickAppointment.findById(appointmentId);
    if (!appointment)
      return res.status(404).json({ message: "Appointment not found" });

    // ❗ Check if patient already exists
    const existingPatient = await Patient.findOne({
      name: appointment.name,
      contact: appointment.contact
    });

    if (existingPatient) {
      return res.status(400).json({ message: "⚠ Patient already exists!" });
    }

    // Otherwise, create new patient
    const newPatient = new Patient({
      name: appointment.name,
      contact: appointment.contact,
      doctor: appointment.doctor,
      appointmentDate: appointment.preferredDate,
      appointmentTime: appointment.preferredTime,
      image: ''
    });

    await newPatient.save();

    appointment.doctorConfirmed = true;
    await appointment.save();

    res.json({ message: "Patient added successfully", doctorConfirmed: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/my-patients", authMiddleware, async (req, res) => {
  try {
    const doctorName = req.user.name; // from authMiddleware

    const patients = await Patient.find({ doctor: doctorName }).sort({
      appointmentDate: 1,
      appointmentTime: 1,
    });

    res.json(patients);
  } catch (error) {
    console.error("Error fetching doctor's patients:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Admin/global: Get all patients (unsorted or sorted globally)
 */
router.get("/patients", async (req, res) => {
  try {
    const patients = await Patient.find().sort({
      appointmentDate: 1,
      appointmentTime: 1,
    });
    res.json(patients);
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({ message: "Failed to fetch patients." });
  }
});

/**
 * Upload or verify patient image
 */
router.post("/:id/uploadImage", upload.single("image"), async (req, res) => {
  try {
    const patientId = req.params.id;

    // Send image to FastAPI
    const formData = new FormData();
    formData.append("patient_id", patientId);
    formData.append("image", fs.createReadStream(req.file.path));
console.log("Uploading image for patient ID:", patientId)
    const response = await axios.post("http://192.168.0.103:8000/search_patient/", formData, {
      headers: formData.getHeaders()
    });

    const data = response.data;
console.log("Response from FastAPI:", data);
    if (data.match) {
      // If match found, return patient ID from CLIP
      return res.json({ match: true, patient_id: data.patient_id, score: data.score });
    } else {
      // Otherwise, save image for this patient

      await Patient.findByIdAndUpdate(patientId, { image: req.file.filename });
      return res.json({ match: false, message: "Image uploaded successfully" });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
/**
 * Delete patient by doctor 
 */
router.delete("/", authMiddleware, async (req, res) => {
  const { name, contact, doctor, appointmentDate, appointmentTime } = req.body;

  try {
    const patient = await Patient.findOneAndDelete({
      name,
      contact,
      doctor,
      appointmentDate,
      appointmentTime,
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found with given details" });
    }

    res.json({ message: "Patient removed successfully!" });
  } catch (error) {
    console.error("Error deleting patient:", error);
    res.status(500).json({ message: "Failed to delete patient." });
  }
});

// ✅ Get a patient's exam findings by patientId
router.get("/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;

    const report = await PatientReport.findOne({ patientId });
    if (!report)
      return res.status(404).json({ message: "Report not found", examFindings: [] });

    res.json({
      patientId: report.patientId,
      examFindings: report.examFindings || [],
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

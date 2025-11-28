import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Patient from "../models/Patient.js";
import PatientReport from "../models/PatientReport.js";

const router = express.Router();

// ✅ Create directories if not exist
const docPath = "uploads/documents";
const audioPath = "uploads/audio";
if (!fs.existsSync(docPath)) fs.mkdirSync(docPath, { recursive: true });
if (!fs.existsSync(audioPath)) fs.mkdirSync(audioPath, { recursive: true });

// ✅ Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype.startsWith("audio/")) cb(null, audioPath);
    else cb(null, docPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// ✅ Save or update patient report with files
router.post("/", upload.fields([{ name: "documents" }, { name: "audio" }]), async (req, res) => {
  try {
    console.log("📩 Incoming EHR report data:", req.body);

    let {
      patientId,
      patientName,
      doctorName,
      contact,
      lastVisit,
      procedure,
      image,
      notes,
      history,
      examFindings,
      transcription,
      prescriptions,
      analysisResult
    } = req.body;

    // ✅ Parse JSON strings safely
    try {
      if (typeof prescriptions === "string" && prescriptions.trim() !== "")
        prescriptions = JSON.parse(prescriptions);
    } catch (e) {
      console.warn("⚠️ Failed to parse prescriptions JSON:", e.message);
      prescriptions = [];
    }

    try {
      if (typeof analysisResult === "string" && analysisResult.trim() !== "")
        analysisResult = JSON.parse(analysisResult);
    } catch (e) {
      console.warn("⚠️ Failed to parse analysisResult JSON:", e.message);
      analysisResult = null;
    }

    // ✅ Find patient
    const patient = await Patient.findOne({ id: patientId });
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    // ✅ Handle uploaded files
    const uploadedDocs = req.files?.documents
      ? req.files.documents.map(f => ({
          name: f.originalname,
          type: f.mimetype,
          size: f.size,
          url: `/uploads/documents/${f.filename}`,
          date: new Date()
        }))
      : [];

    const uploadedAudio = req.files?.audio
      ? req.files.audio.map(f => ({
          name: f.originalname,
          type: f.mimetype,
          url: `/uploads/audio/${f.filename}`,
          date: new Date()
        }))
      : [];

    // ✅ Prepare fields to push
    const pushFields = {};
    if (history) pushFields.history = [{ content: history, date: new Date() }];
if (examFindings) pushFields.examFindings = [{ content: examFindings, date: new Date() }];
if (notes) pushFields.notes = [{ content: notes, date: new Date() }];
    if (transcription) pushFields.transcription = [transcription];
    if (uploadedAudio.length) pushFields.audioUrl = uploadedAudio;
    if (uploadedDocs.length) pushFields.documents = uploadedDocs;

    if (Array.isArray(prescriptions) && prescriptions.length)
      pushFields.prescriptions = prescriptions;

    if (analysisResult?.input && analysisResult?.result) {
      pushFields.analysisResults = [
        {
          input: analysisResult.input,
          result: analysisResult.result,
          date: new Date(),
        },
      ];
    }

    // ✅ Create or update report
    const updatedReport = await PatientReport.findOneAndUpdate(
      { patientId },
      {
        $set: {
          patientName: patientName || patient.name,
          contact: contact || patient.contact,
          doctorName: doctorName || patient.doctor,
          lastVisit: lastVisit || patient.appointmentDate,
          procedure: procedure || "General Consultation",
          image: image || patient.image,
        },
        $push: pushFields,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "✅ Report successfully saved with files and analysis",
      report: updatedReport,
    });

  } catch (error) {
    console.error("❌ Error saving report:", error);
    res.status(500).json({ error: "Failed to save report", details: error.message });
  }
});

// ✅ Fetch reports by patientId
router.get("/by-patient-id/:id", async (req, res) => {
  try {
    const reports = await PatientReport.find({ patientId: req.params.id }).sort({ timestamp: -1 });
    res.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

export default router;

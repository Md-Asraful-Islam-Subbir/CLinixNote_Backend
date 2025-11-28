import mongoose from "mongoose";

const audioSchema = new mongoose.Schema({
  name: String,
  url: String,
  type: String,
  date: { type: Date, default: Date.now }
});

const documentSchema = new mongoose.Schema({
  name: String,
  type: String,
  size: String,
  date: String,
  url: String,
  filePath: String,
  fileData: Buffer,
  mimetype: String
});

const prescriptionSchema = new mongoose.Schema({
  content: String,
  date: { type: Date, default: Date.now },
  time: String,
  doctor: String,
  datetime: { type: Date, default: Date.now }
});

const analysisResultSchema = new mongoose.Schema({
  input: String,
  result: String,
  date: { type: Date, default: Date.now }
});
const textEntrySchema = new mongoose.Schema({
  content: String,
  date: { type: Date, default: Date.now }
});
const patientReportSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  patientName: String,
  doctorName: String,
  contact: String,
  lastVisit: String,
  procedure: String,
  image: String,

  notes: [textEntrySchema],
  history: [textEntrySchema],
  examFindings: [textEntrySchema],
  transcription: [String],

  audioUrl: [audioSchema],
  documents: [documentSchema],
  prescriptions: [prescriptionSchema],
  analysisResults: [analysisResultSchema],

  timestamp: { type: Date, default: Date.now }
});

const PatientReport = mongoose.model("PatientReport", patientReportSchema);
export default PatientReport;

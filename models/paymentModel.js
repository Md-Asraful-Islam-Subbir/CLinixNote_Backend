import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  tran_id: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "BDT" },
  status: { type: String, default: "Pending" },
  gateway_response: { type: mongoose.Schema.Types.Mixed },
  user: { type: String },          // doctor
  patient_name: { type: String },  // patient
  patient_contact: { type: String }, // contact
  createdAt: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;

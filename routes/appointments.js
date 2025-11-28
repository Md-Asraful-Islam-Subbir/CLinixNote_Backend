import express from "express";
import QuickAppointment from "../models/QuickAppointment.js";
import TimeSlot from "../models/TimeSlot.js";
import User from "../models/User.js";
import DoctorSchedule from '../models/DoctorSchedule.js';
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import Payment from "../models/paymentModel.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();

// Create quick appointment
router.post("/quick-appointments", async (req, res) => {
  try {
    const { name, contact, doctor, preferredDate, preferredTime, saveInfo } = req.body;

    const newQuickAppointment = new QuickAppointment({
      name,
      contact,
      doctor,
      preferredDate,
      preferredTime,
      saveInfo,
    });

    await newQuickAppointment.save();
    res.status(201).json({ message: "Quick appointment created successfully" });
  } catch (error) {
    console.error("Error creating quick appointment:", error);
    res.status(500).json({ error: "Failed to create quick appointment" });
  }
});
router.get("/doctorsforappointment", async (req, res) => {
  try {
    const doctors = await User.find({ role: "Doctor", status: "Approved" }).select("_id name specialization email");
    res.json(doctors);
  } catch (error) {
    console.error("Error fetching doctors:", error);
    res.status(500).json({ error: "Failed to fetch doctors" });
  }
});
router.get("/doctor/:doctorId/schedule", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const schedule = await DoctorSchedule.find({ doctor: doctorId });

    if (!schedule || schedule.length === 0) {
      return res.status(404).json({ message: "No schedule found for this doctor" });
    }

    res.json(schedule);
  } catch (error) {
    console.error("Error fetching doctor schedule:", error);
    res.status(500).json({ message: "Server error while fetching schedule" });
  }
});
// Fetch available time slots
router.get("/timeslots", async (req, res) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ error: "Missing doctorId or date" });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const slots = await TimeSlot.find({
      doctorId,
      date: { $gte: startOfDay, $lte: endOfDay },
      isBooked: false,
    });

    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error fetching slots" });
  }
});

// ✅ Fetch all quick appointments
// Backend: appointments route
router.get("/appointments", async (req, res) => {
  try {
    const appointments = await QuickAppointment.find().sort({ createdAt: -1 });

    // Map appointments with payment status
    const appointmentsWithPayment = await Promise.all(
      appointments.map(async (appt) => {
        const payment = await Payment.findOne({
          patient_name: appt.name,
          patient_contact: appt.contact,
        });

        return {
          ...appt.toObject(),
          payment_status: payment ? "Paid" : "Unpaid",
        };
      })
    );

    res.json(appointmentsWithPayment); // Only send response once
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
});

// In your appointment confirmation route
router.put("/appointments/:id/confirm", async (req, res) => {
  try {
    const { contact, doctorName } = req.body;

    const user = await User.findOne({ email: contact });
    if (!user) return res.status(404).json({ error: "User (patient) not found" });

    const doctor = await User.findOne({ name: doctorName, role: "Doctor" });
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });

    const appointment = await QuickAppointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });

    const slot = await TimeSlot.findOne({
      doctorId: doctor._id,
      date: new Date(appointment.preferredDate),
      startTime: appointment.preferredTime,
      isBooked: false,
    });

    if (!slot) return res.status(404).json({ error: "No available time slot found" });

    slot.isBooked = true;
    slot.bookedBy = user._id;
    await slot.save();

    appointment.status = "Confirmed";
    await appointment.save();

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
      subject: "Appointment Confirmed",
      html: `
        <h3>Appointment Confirmed</h3>
        <p>Hello ${user.name},</p>
        <p>Your appointment with <strong>Dr. ${doctor.name}</strong> has been confirmed.</p>
        <p><strong>Date:</strong> ${new Date(appointment.preferredDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}</p>
  <p><strong>Time:</strong> ${new Date(`1970-01-01T${appointment.preferredTime}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })}</p>
        <p><strong>Status:</strong> Confirmed</p>
        <p>Thank you for using our service.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${user.email}`);

    res.status(200).json({
      message: "Appointment confirmed successfully",
      appointment,
    });
  } catch (err) {
    console.error("Error confirming appointment:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/user-appointments', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log(userEmail);
    const appointments = await QuickAppointment.find({ contact: userEmail });

    if (!appointments.length) {
      return res.status(404).json({ error: "No appointments found for this user" });
    }

    res.json(appointments);
  } catch (err) {
    console.error("Fetch appointments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
router.get("/my-appointments", authMiddleware, async (req, res) => {
  try {
    // Assuming req.user.name holds the doctor's full name
    const doctorName = req.user.name;

    const appointments = await QuickAppointment.find({ doctor: doctorName });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});
router.delete("/appointments/:id/decline", async (req, res) => {
  try {
    const { id } = req.params;

    // Find appointment first
    const appointment = await QuickAppointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Delete from database
    await QuickAppointment.findByIdAndDelete(id);

    // Send cancellation email
    const transporter = nodemailer.createTransport({
      service: "gmail", // or use your SMTP provider
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: appointment.contact,
      subject: "Appointment Cancelled",
      text: `Dear ${appointment.name},\n\nWe regret to inform you that your appointment with ${appointment.doctor} scheduled for ${appointment.preferredDate} at ${appointment.preferredTime} has been cancelled.Please Select another preferred time for appointment\n\nRegards,\nClinic Admin`,
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Appointment cancelled and email sent" });
  } catch (error) {
    console.error("Decline error:", error);
    res.status(500).json({ error: "Failed to cancel appointment" });
  }
});
router.get("/total", async (req, res) => {
  try {
    const totalAppointments = await QuickAppointment.countDocuments();
    res.json({ total: totalAppointments });
  } catch (err) {
    console.error("Error fetching total appointments:", err);
    res.status(500).json({ message: "Server Error" });
  }
});
export default router;

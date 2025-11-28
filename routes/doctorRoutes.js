import express from "express";
import User from "../models/User.js";
import crypto from "crypto";
const router = express.Router();
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import moment from 'moment';
import mongoose from 'mongoose';
import QuickAppointment from '../models/QuickAppointment.js';
import DoctorSchedule from '../models/DoctorSchedule.js';
import TimeSlot from '../models/TimeSlot.js';
import authMiddleware from "../middleware/authMiddleware.js";
// API to get all doctors (users with role "Client")
router.get("/doctors", async (req, res) => {
    try {
        const doctors = await User.find({ role: "Admin" }).select("name");
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ message: "Error fetching doctors", error });
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

router.post('/doctor/application', async (req, res) => {
  const { name, email, specialization } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already used." });
    }

    const newDoctor = new User({
      name,
      email,
      specialization,
      role: "Doctor",
      status: "Pending",
      emailVerifyToken: crypto.randomBytes(32).toString("hex"),
      emailVerifyExpires: Date.now() + 3600000
    });

    await newDoctor.save();

    res.status(201).json({ message: "Doctor application submitted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error while submitting application." });
  }
});

router.get('/applications', async (req, res) => {
  try {
    const pendingDoctors = await User.find({ role: "Doctor", status: "Pending" });
    res.status(200).json(pendingDoctors);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch doctor applications." });
  }
});
router.post('/approve/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  try {
    const doctor = await User.findById(id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    if (doctor.status !== "Pending") return res.status(400).json({ message: "Doctor already processed." });

    const hashedPassword = await bcrypt.hash(password, 10);

    doctor.password = hashedPassword;
    doctor.status = "Approved";
    await doctor.save();

    // ✅ Send verification email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: doctor.email,
      subject: "ClinixNote Doctor Account Verification",
      html: `
        <h2>Welcome Dr. ${doctor.name}</h2>
        <p>Your application has been approved. Please verify your email to activate your account:</p>
        <a href="http://localhost:5173/verify-email/${doctor.emailVerifyToken}">Verify Email</a>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Doctor approved successfully. Verification email sent!" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to approve doctor." });
  }
});

router.post('/decline/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const doctor = await User.findById(id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    if (doctor.status !== "Pending") return res.status(400).json({ message: "Doctor already processed." });

    doctor.status = "Rejected";

    await User.findByIdAndDelete(id);

    res.status(200).json({ message: "Doctor application declined." });
  } catch (error) {
    console.error(error); 
    res.status(500).json({ message: "Failed to decline doctor." });
  }
});

router.post('/schedule',authMiddleware, async (req, res) => {
  try {
    const { days, slotDuration, validFrom, validTo } = req.body;
const doctorId=req.user;
    if (!doctorId) {
      return res.status(400).json({ error: "Missing doctorId" });
    }

    const newSchedule = new DoctorSchedule({
      doctorId,
      days,
      slotDuration,
      validFrom,
      validTo
    });

    await newSchedule.save();
    await generateSlots(newSchedule,doctorId);

    res.status(201).json({ message: 'Schedule saved & slots generated!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/generate-slots', authMiddleware, async (req, res) => {
  try {
    const { scheduleId } = req.body;

    const schedule = await DoctorSchedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const { doctorId, days, slotDuration, validFrom, validTo } = schedule;

    // Remove existing slots for this schedule
    await TimeSlot.deleteMany({
      doctorId,
      date: { $gte: validFrom, $lte: validTo }
    });

    const slotsToInsert = [];

    for (let d = new Date(validFrom); d <= validTo; d.setDate(d.getDate() + 1)) {
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

      if (!days.includes(dayName)) continue;

      const dayDate = new Date(d);
      dayDate.setHours(0, 0, 0, 0); // Set to midnight for consistency

      // Parse start and end times as hour/minute from schedule
      const [startHour, startMin] = schedule.startTime.split(':').map(Number);
      const [endHour, endMin] = schedule.endTime.split(':').map(Number);

      const startDateTime = new Date(dayDate);
      startDateTime.setHours(startHour, startMin, 0, 0);

      const endDateTime = new Date(dayDate);
      endDateTime.setHours(endHour, endMin, 0, 0);

      let currentSlot = new Date(startDateTime);

      while (currentSlot < endDateTime) {
        const slotEnd = new Date(currentSlot.getTime() + slotDuration * 60000);

        if (slotEnd > endDateTime) break;

        slotsToInsert.push({
          doctorId,
          date: new Date(currentSlot), // Save full datetime
          startTime: currentSlot.toTimeString().slice(0, 5),
          endTime: slotEnd.toTimeString().slice(0, 5),
          isBooked: false
        });

        currentSlot = slotEnd;
      }
    }

    await TimeSlot.insertMany(slotsToInsert);

    res.status(201).json({ message: 'Time slots generated successfully', slots: slotsToInsert.length });
  } catch (error) {
    console.error('Error generating time slots:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Generator function
export async function generateSlots(schedule) {
  const { doctorId, days, slotDuration, validFrom, validTo } = schedule;

  // Calculate the list of dates between validFrom and validTo (inclusive)
  const start = moment(validFrom);
const end = moment(validTo);

  const dates = [];
  let current = start.clone();
  while (current.isSameOrBefore(end)) {
    dates.push(current.clone());
    current.add(1, 'day');
  }

  // Does days array have a `day` property? (If so, match weekdays)
  const daysHaveDayProperty = days.some(d => d.day !== undefined);

  const allSlots = dates.flatMap(date => {
    if (daysHaveDayProperty) {
      const weekday = date.format('dddd'); // E.g. "Monday"
      const matchingDay = days.find(d => d.day === weekday);
      if (!matchingDay) return []; // Skip this day

      return buildSlotsForDate(date, matchingDay.startTime, matchingDay.endTime, slotDuration, doctorId);
    } else {
      // Use same time for all days
      const { startTime, endTime } = days[0];
      return buildSlotsForDate(date, startTime, endTime, slotDuration, doctorId);
    }
  });

  // Insert all slots at once
  if (allSlots.length > 0) {
    await TimeSlot.insertMany(allSlots);
  }

  console.log(`✅ Generated ${allSlots.length} slots for doctor ${doctorId}`);
}

function buildSlotsForDate(dateMoment, startTime, endTime, slotDuration, doctorId) {
  const slots = [];
  let start = moment(`${dateMoment.format('YYYY-MM-DD')} ${startTime}`, 'YYYY-MM-DD HH:mm');
  const end = moment(`${dateMoment.format('YYYY-MM-DD')} ${endTime}`, 'YYYY-MM-DD HH:mm');

  while (start.isBefore(end)) {
    const slotEnd = start.clone().add(slotDuration, 'minutes');
    slots.push({
      doctorId,
      date: dateMoment.toDate(),
      startTime: start.format('HH:mm'),
      endTime: slotEnd.format('HH:mm'),
      isBooked: false
    });
    start = slotEnd;
  }
  return slots;
}
router.get('/appointments', authMiddleware, async (req, res) => {
  try {
    const doctorId = req.user; // or doctor's name if QuickAppointment stores doctor as string name

    const appointments = await QuickAppointment.find({ doctor: doctorId })
      // adjust populate if needed, or remove it since QuickAppointment doesn't reference patientId
      .sort({ preferredDate: 1 });

    const formatted = appointments.map(appt => ({
      id: appt._id,
      patientName: appt.name,
      contact: appt.contact,
      date: appt.preferredDate,
      time: appt.preferredTime,
      saveInfo: appt.saveInfo
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Error fetching doctor appointments:", error);
    res.status(500).json({ error: "Failed to fetch appointments" });
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
router.get('/:doctorId/schedule', async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctor ID' });
    }

    const schedules = await DoctorSchedule.find({
      doctorId: new mongoose.Types.ObjectId(doctorId)
    });

    res.json(schedules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
router.put('/api/timeslots/book/:id', async (req, res) => {
  try {
    const timeslot = await TimeSlot.findById(req.params.id);
    if (!timeslot) {
      return res.status(404).json({ error: "Timeslot not found" });
    }

    timeslot.isBooked = true;
    timeslot.bookedBy = req.body.bookedBy;
    await timeslot.save();

    res.json({ message: "Timeslot booked successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// Get logged-in doctor profile
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const doctor = await User.findById(req.user.id).select("-password");
    if (!doctor || doctor.role !== "Doctor") {
      return res.status(404).json({ message: "Doctor not found" });
    }
    res.json(doctor);
  } catch (error) {
    console.error("Error fetching doctor profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});
// Update existing doctor schedule & notify affected patients
router.put('/schedule/:scheduleId', authMiddleware, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { days, slotDuration, validFrom, validTo } = req.body;
    const doctorId = req.user.id; // logged-in doctor

    const schedule = await DoctorSchedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    // Update schedule info
    schedule.days = days;
    schedule.slotDuration = slotDuration;
    schedule.validFrom = validFrom;
    schedule.validTo = validTo;
    await schedule.save();

    // Delete old slots for this doctor in the updated date range
    await TimeSlot.deleteMany({
      doctorId,
      date: { $gte: new Date(validFrom), $lte: new Date(validTo) }
    });

    // Generate new slots
    await generateSlots(schedule);

    // Find affected appointments
    const affectedAppointments = await QuickAppointment.find({
      doctor: scheduleId,
      preferredDate: { $gte: new Date(validFrom), $lte: new Date(validTo) }
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    for (const appt of affectedAppointments) {
      // Check if appointment time is still available
      const slot = await TimeSlot.findOne({
        doctorId,
        date: appt.preferredDate,
        startTime: appt.preferredTime,
        isBooked: false
      });

      if (!slot) {
        // Assign nearest available slot
        const newSlot = await TimeSlot.findOne({
          doctorId,
          date: appt.preferredDate,
          isBooked: false
        }).sort({ startTime: 1 });

        if (newSlot) {
          const oldTime = appt.preferredTime;
          appt.preferredTime = newSlot.startTime;
          await appt.save();

          // Notify patient
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: appt.contact,
            subject: 'Appointment Time Updated',
            html: `
              <p>Hello ${appt.name},</p>
              <p>Your appointment with Dr. has been rescheduled due to a change in the schedule.</p>
              <p><strong>Old Time:</strong> ${oldTime}</p>
              <p><strong>New Time:</strong> ${newSlot.startTime}</p>
              <p>Thank you for understanding.</p>
            `
          });
        }
      }
    }

    res.status(200).json({ message: 'Schedule updated, slots regenerated, affected patients notified.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

import mongoose from 'mongoose';

const TimeSlotSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  startTime: String,
  endTime: String,
  isBooked: { type: Boolean, default: false },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

//  Prevent OverwriteModelError
const TimeSlot = mongoose.models.TimeSlot || mongoose.model('TimeSlot', TimeSlotSchema);
export default TimeSlot;


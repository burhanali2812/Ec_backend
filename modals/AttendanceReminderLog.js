
const mongoose = require("mongoose");

const reminderLogSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  date: { type: String, required: true }, // "2026-08-28"
}, { timestamps: true });

reminderLogSchema.index({ teacher: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceReminderLog", reminderLogSchema);
const mongoose = require("mongoose");

const attendanceReminderLogSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD" in Karachi time
  lastNotifiedAt: { type: Date, required: true },
  notifyCount: { type: Number, default: 1 },
});

// One row per teacher per day; we update it in place to throttle repeats.
attendanceReminderLogSchema.index({ teacher: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("AttendanceReminderLog", attendanceReminderLogSchema);
const mongoose = require("mongoose");

const classEndReminderLogSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  classInfo: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  date: { type: String, required: true }, // "YYYY-MM-DD" in Karachi time
  createdAt: { type: Date, default: Date.now },
});

// One reminder per (teacher, course, class, day) — no matter how many
// times the scheduler ticks inside the 10-minute window.
classEndReminderLogSchema.index(
  { teacher: 1, course: 1, classInfo: 1, date: 1 },
  { unique: true }
);

module.exports = mongoose.model("ClassEndReminderLog", classEndReminderLogSchema);
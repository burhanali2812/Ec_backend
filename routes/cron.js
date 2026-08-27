// routes/cron.js
const express = require("express");
const router = express.Router();
const Course = require("../modals/Course");
const Attendance = require("../modals/Attandance");
const AttendanceReminderLog = require("../modals/AttendanceReminderLog");
const { createNotification } = require("../notificationService");

function getTodayRangeKarachi() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now); // "2026-08-28"
  // Karachi is fixed UTC+5, no DST — safe to build the offset directly.
  const startOfDay = new Date(`${dateStr}T00:00:00+05:00`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999+05:00`);
  return { startOfDay, endOfDay, dateStr };
}

router.get("/attendance-daily-check", async (req, res) => {
  

  try {
    const { startOfDay, endOfDay, dateStr } = getTodayRangeKarachi();

    const courses = await Course.find({ "assignments.0": { $exists: true } })
      .populate("assignments.teacher", "name fcmTokens")
      .populate("assignments.targetClasses", "name"); // adjust "name" to whatever your Class model uses for display

    const missingByTeacher = new Map(); // teacherId -> { teacher, items: [] }

    for (const course of courses) {
      for (const assignment of course.assignments) {
        const teacher = assignment.teacher;
        if (!teacher) continue;

        for (const classInfo of assignment.targetClasses) {
          const marked = await Attendance.exists({
            course: course._id,
            classInfo: classInfo._id,
            markedBy: teacher._id,
            date: { $gte: startOfDay, $lte: endOfDay },
          });
          if (marked) continue;

          const key = String(teacher._id);
          if (!missingByTeacher.has(key)) {
            missingByTeacher.set(key, { teacher, items: [] });
          }
          missingByTeacher.get(key).items.push(`${course.title} (${classInfo.name})`);
        }
      }
    }

    const notified = [];

    for (const { teacher, items } of missingByTeacher.values()) {
      // Idempotency guard — one reminder per teacher per day, no matter
      // how many classes they missed or how many times this route fires.
      try {
        await AttendanceReminderLog.create({ teacher: teacher._id, date: dateStr });
      } catch (err) {
        if (err.code === 11000) continue; // already reminded today
        throw err;
      }

      await createNotification({
        title: "Attendance Not Marked",
        message: `You haven't marked attendance today for: ${items.join(", ")}. Please update it as soon as possible.`,
        type: "Attendance",
        target: "teachers",
        recipients: [{ id: teacher._id, role: "teacher" }],
        publishedBy: "system",
      });

      notified.push({ teacher: teacher.name, items });
    }

    return res.json({ success: true, teachersNotified: notified.length, notified });
  } catch (error) {
    console.error("Daily attendance check error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;
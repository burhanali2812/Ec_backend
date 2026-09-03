const TimeTable = require("../modals/TimeTable");
const Attendance = require("../modals/Attandance");
const Registration = require("../modals/Registration");
const AttendanceReminderLog = require("../modals/AttendanceReminderLog");
const ClassEndReminderLog = require("../modals/Classendreminderlog");
const { createNotification } = require("../notificationService");

/* ---------------------------------------------------------------------- */
/* Karachi time helpers (fixed UTC+5, no DST)                             */
/* ---------------------------------------------------------------------- */

function getTodayRangeKarachi() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now);
  const startOfDay = new Date(`${dateStr}T00:00:00+05:00`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999+05:00`);
  return { startOfDay, endOfDay, dateStr };
}

function getKarachiClock() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    weekday: "long",
  }).format(now);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const [hh, mm] = timeStr.split(":").map(Number);
  return { dateStr, weekday, minutesNow: hh * 60 + mm };
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/* ---------------------------------------------------------------------- */
/* Job 1: ~10 minutes before a class ends, for that class only            */
/* Run this every 1-5 minutes                                             */
/* ---------------------------------------------------------------------- */

async function runClassEndingSoonCheck() {
  const { startOfDay, endOfDay, dateStr } = getTodayRangeKarachi();
  const { weekday, minutesNow } = getKarachiClock();

  const REMINDER_WINDOW_MINUTES = 10;

  const timetables = await TimeTable.find({ dayOfWeek: weekday })
    .populate("teacher", "name fcmTokens")
    .populate("course", "title")
    .populate("classInfo", "name");

  const endingSoon = timetables.filter((tt) => {
    const minutesLeft = toMinutes(tt.endTime) - minutesNow;
    return minutesLeft > 0 && minutesLeft <= REMINDER_WINDOW_MINUTES;
  });

  const notified = [];

  for (const tt of endingSoon) {
    const { teacher, course, classInfo } = tt;
    if (!teacher || !course || !classInfo) continue;

    const hasStudents = await Registration.exists({
      classInfo: classInfo._id,
      "aboutCourse.course": course._id,
    });
    if (!hasStudents) continue;

    const marked = await Attendance.exists({
      course: course._id,
      classInfo: classInfo._id,
      markedBy: teacher._id,
      date: { $gte: startOfDay, $lte: endOfDay },
    });
    if (marked) continue;

    try {
      await ClassEndReminderLog.create({
        teacher: teacher._id,
        course: course._id,
        classInfo: classInfo._id,
        date: dateStr,
      });
    } catch (err) {
      if (err.code === 11000) continue; // already reminded for this class today
      throw err;
    }

    await createNotification({
      title: "Mark Attendance — Class Ending Soon",
      message: `Your class ${course.title} (${classInfo.name}) ends soon and attendance hasn't been marked yet.`,
      type: "Attendance",
      target: "teachers",
      recipients: [{ id: teacher._id, role: "teacher" }],
      publishedBy: "system",
    });

    notified.push({
      teacher: teacher.name,
      course: course.title,
      classInfo: classInfo.name,
      endTime: tt.endTime,
    });
  }

  return { notified: notified.length, details: notified };
}

/* ---------------------------------------------------------------------- */
/* Job 2: from 9 PM onward, sweep the day and nag every ~30 min           */
/* Run this every 30 minutes, all day (it no-ops before 9 PM)             */
/* ---------------------------------------------------------------------- */

async function runEveningCheck() {
  const { startOfDay, endOfDay, dateStr } = getTodayRangeKarachi();
  const { weekday, minutesNow } = getKarachiClock();

  const EVENING_START_MINUTES = 21 * 60; // 9:00 PM Karachi
  if (minutesNow < EVENING_START_MINUTES) {
    return { skipped: true, reason: "Before 9 PM Karachi time." };
  }

  const THROTTLE_MINUTES = 25;

  const timetables = await TimeTable.find({ dayOfWeek: weekday })
    .populate("teacher", "name fcmTokens")
    .populate("course", "title")
    .populate("classInfo", "name");

  const missingByTeacher = new Map();

  for (const tt of timetables) {
    const { teacher, course, classInfo } = tt;
    if (!teacher || !course || !classInfo) continue;

    const hasStudents = await Registration.exists({
      classInfo: classInfo._id,
      "aboutCourse.course": course._id,
    });
    if (!hasStudents) continue;

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

  const notified = [];
  const now = new Date();

  for (const { teacher, items } of missingByTeacher.values()) {
    const existingLog = await AttendanceReminderLog.findOne({ teacher: teacher._id, date: dateStr });

    if (existingLog) {
      const minutesSinceLast = (now - existingLog.lastNotifiedAt) / 60000;
      if (minutesSinceLast < THROTTLE_MINUTES) continue;
      existingLog.lastNotifiedAt = now;
      existingLog.notifyCount += 1;
      await existingLog.save();
    } else {
      await AttendanceReminderLog.create({
        teacher: teacher._id,
        date: dateStr,
        lastNotifiedAt: now,
        notifyCount: 1,
      });
    }

    await createNotification({
      title: "Attendance Still Not Marked",
      message: `You still haven't marked attendance today for: ${items.join(", ")}. Please update it as soon as possible.`,
      type: "Attendance",
      target: "teachers",
      recipients: [{ id: teacher._id, role: "teacher" }],
      publishedBy: "system",
    });

    notified.push({ teacher: teacher.name, items });
  }

  return { teachersNotified: notified.length, notified };
}

module.exports = { runClassEndingSoonCheck, runEveningCheck };
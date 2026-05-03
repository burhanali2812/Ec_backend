const express = require("express");
const Course = require("../modals/Course");
const TimeTable = require("../modals/TimeTable");
const Registration = require("../modals/Registration");
const Student = require("../modals/Student");
const authMiddleWare = require("../authMiddleWare");

const router = express.Router();

const DAY_ORDER = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

const isAdmin = (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Unauthorized, admin access required",
    });
    return false;
  }
  return true;
};

const normalizeId = (value) => String(value || "").trim();

const buildConflictQuery = ({
  id,
  classInfo,
  teacher,
  dayOfWeek,
  startTime,
  endTime,
}) => ({
  ...(id ? { _id: { $ne: id } } : {}),
  dayOfWeek,
  startTime: { $lt: endTime },
  endTime: { $gt: startTime },
  $or: [
    { teacher }, // teacher busy
    { classInfo }, // class busy (IMPORTANT FIX)
  ],
});

const verifyCourseTeacherPair = async (courseId, teacherId, classInfo) => {
  const course = await Course.findById(courseId).populate(
    "assignments.teacher",
    "name email",
  );
  if (!course) {
    return { ok: false, message: "Course not found" };
  }

  const assigned = (course.assignments || []).some(
    (item) =>
      String(item?.teacher?._id || item?.teacher) === String(teacherId) &&
      Array.isArray(item?.targetClasses) &&
      item.targetClasses.includes(classInfo),
  );
  if (!assigned) {
    return {
      ok: false,
      message:
        "Selected teacher is not assigned to this course for selected class",
    };
  }

  return { ok: true, course };
};

router.get("/allTimeTables", authMiddleWare, async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const entries = await TimeTable.find()
      .populate("course", "title description")
      .populate("teacher", "name email contact")
      .lean();

    const sortedEntries = entries.sort((a, b) => {
      const dayDiff =
        (DAY_ORDER[a.dayOfWeek] || 99) - (DAY_ORDER[b.dayOfWeek] || 99);
      if (dayDiff !== 0) return dayDiff;
      return String(a.startTime).localeCompare(String(b.startTime));
    });

    return res.json({ success: true, timeTables: sortedEntries });
  } catch (error) {
    console.error("Timetable fetch error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/addTimeTableEntry", authMiddleWare, async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const course = normalizeId(req.body.course);
    const classInfo = String(
      req.body.classInfo || req.body.className || "",
    ).trim();
    const teacher = normalizeId(req.body.teacher);
    const dayOfWeek = String(req.body.dayOfWeek || "").trim();
    const startTime = String(req.body.startTime || "").trim();
    const endTime = String(req.body.endTime || "").trim();

    if (
      !course ||
      !classInfo ||
      !teacher ||
      !dayOfWeek ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!DAY_ORDER[dayOfWeek]) {
      return res.status(400).json({ success: false, message: "Invalid day" });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time",
      });
    }

    const pairCheck = await verifyCourseTeacherPair(course, teacher, classInfo);
    if (!pairCheck.ok) {
      return res
        .status(400)
        .json({ success: false, message: pairCheck.message });
    }

    const conflict = await TimeTable.findOne(
      buildConflictQuery({
        classInfo,
        teacher,
        dayOfWeek,
        startTime,
        endTime,
      }),
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        message:
          String(conflict.teacher) === teacher
            ? "Teacher already has a timetable entry in this time slot"
            : "Selected class already has this course in the same time slot",
      });
    }

    const newEntry = await TimeTable.create({
      course,
      classInfo,
      teacher,
      dayOfWeek,
      startTime,
      endTime,
    });

    const populated = await TimeTable.findById(newEntry._id)
      .populate("course", "title description")
      .populate("teacher", "name email contact");

    return res.status(201).json({
      success: true,
      message: "TimeTable entry created successfully",
      data: populated,
    });
  } catch (error) {
    console.error("Timetable Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/updateTimeTableEntry/:id", authMiddleWare, async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;
    const course = normalizeId(req.body.course);
    const classInfo = String(
      req.body.classInfo || req.body.className || "",
    ).trim();
    const teacher = normalizeId(req.body.teacher);
    const dayOfWeek = String(req.body.dayOfWeek || "").trim();
    const startTime = String(req.body.startTime || "").trim();
    const endTime = String(req.body.endTime || "").trim();

    if (
      !course ||
      !classInfo ||
      !teacher ||
      !dayOfWeek ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!DAY_ORDER[dayOfWeek]) {
      return res.status(400).json({ success: false, message: "Invalid day" });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time",
      });
    }

    const existing = await TimeTable.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Timetable entry not found" });
    }

    const pairCheck = await verifyCourseTeacherPair(course, teacher, classInfo);
    if (!pairCheck.ok) {
      return res
        .status(400)
        .json({ success: false, message: pairCheck.message });
    }

    const conflict = await TimeTable.findOne(
      buildConflictQuery({
        id,
        course,
        classInfo,
        teacher,
        dayOfWeek,
        startTime,
        endTime,
      }),
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        message:
          String(conflict.teacher) === teacher
            ? "Teacher already has a timetable entry in this time slot"
            : "Selected class already has this course in the same time slot",
      });
    }

    existing.course = course;
    existing.classInfo = classInfo;
    existing.teacher = teacher;
    existing.dayOfWeek = dayOfWeek;
    existing.startTime = startTime;
    existing.endTime = endTime;
    await existing.save();

    const populated = await TimeTable.findById(existing._id)
      .populate("course", "title description")
      .populate("teacher", "name email contact");

    return res.json({
      success: true,
      message: "TimeTable entry updated successfully",
      data: populated,
    });
  } catch (error) {
    console.error("Timetable update error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/deleteTimeTableEntry/:id", authMiddleWare, async (req, res) => {
  try {
    if (!isAdmin(req, res)) return;

    const { id } = req.params;
    const deleted = await TimeTable.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Timetable entry not found" });
    }

    return res.json({
      success: true,
      message: "TimeTable entry deleted successfully",
    });
  } catch (error) {
    console.error("Timetable delete error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/viewTimeTable", authMiddleWare, async (req, res) => {
  try {
    if (!req.user || !["student", "teacher"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only students and teachers can view timetable",
      });
    }

    let entries = [];

    if (req.user.role === "student") {
      const studentId = req.user.id;

      const student = await Student.findById(studentId).select("classInfo");
      if (!student || !student.classInfo) {
        return res.status(404).json({
          success: false,
          message: "Student profile/class not found",
        });
      }

      const registration = await Registration.findOne({ student: studentId });

      if (!registration || !registration.aboutCourse.length) {
        return res.json({
          success: true,
          timeTables: [],
        });
      }

      const courseIds = registration.aboutCourse.map((item) => item.course);

      entries = await TimeTable.find({
        course: { $in: courseIds },
        classInfo: student.classInfo,
        dayOfWeek: { $ne: "Sunday" },
      })
        .populate("course", "title")
        .populate("teacher", "name")
        .lean();
    } else {
      entries = await TimeTable.find({
        teacher: req.user.id,
        dayOfWeek: { $ne: "Sunday" },
      })
        .populate("course", "title")
        .populate("teacher", "name")
        .lean();
    }

    const DAY_ORDER = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };

    const sortedEntries = entries.sort((a, b) => {
      const dayDiff =
        (DAY_ORDER[a.dayOfWeek] || 99) - (DAY_ORDER[b.dayOfWeek] || 99);
      if (dayDiff !== 0) return dayDiff;

      return a.startTime.localeCompare(b.startTime);
    });

    return res.json({
      success: true,
      timeTables: sortedEntries,
    });
  } catch (error) {
    console.error("Timetable fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;

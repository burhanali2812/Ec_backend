const express = require("express");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const Attendance = require("../modals/Attandance");
const authMiddleWare = require("../authMiddleWare");

const router = express.Router();

const startOfDay = (dateValue) => {
  const d = new Date(dateValue);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (dateValue) => {
  const d = new Date(dateValue);
  d.setHours(23, 59, 59, 999);
  return d;
};

router.get("/myCourses", authMiddleWare, async (req, res) => {
  try {
    const courses = await Course.find({ teachers: req.user.id })
      .populate("teachers", "name email")
      .populate("classTarget.teacher", "name email");

    return res.json({ success: true, courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/classes/:courseId", authMiddleWare, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).populate(
      "classTarget.teacher",
      "name email",
    );

    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const teacherId = String(req.user.id);
    const isAssignedTeacher = (course.teachers || []).some(
      (teacher) => String(teacher) === teacherId,
    );

    if (!isAssignedTeacher) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const classes = [
      ...new Set(
        (course.classTarget || [])
          .filter(
            (item) => String(item.teacher?._id || item.teacher) === teacherId,
          )
          .flatMap((item) => item.classes || []),
      ),
    ];

    return res.json({ success: true, classes, course });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/session", authMiddleWare, async (req, res) => {
  try {
    const { courseId, classInfo, date } = req.query;

    if (!courseId || !classInfo || !date) {
      return res.status(400).json({
        success: false,
        message: "courseId, classInfo and date are required",
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const teacherId = String(req.user.id);
    const isAssignedTeacher = (course.teachers || []).some(
      (teacher) => String(teacher) === teacherId,
    );
    if (!isAssignedTeacher) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const registrations = await Registration.find({
      classInfo,
      aboutCourse: { $elemMatch: { course: courseId } },
    }).populate(
      "student",
      "name email contact rollNumber classInfo fatherName fatherContact",
    );

    const attendanceDocs = await Attendance.find({
      course: courseId,
      date: {
        $gte: startOfDay(date),
        $lte: endOfDay(date),
      },
    }).populate("registration");

    const attendanceMap = attendanceDocs.reduce((acc, item) => {
      const studentId = String(item.registration?.student || "");
      if (studentId) {
        acc[studentId] = {
          status: item.status,
          percentage: item.percentage || 0,
        };
      }
      return acc;
    }, {});

    const students = registrations
      .map((registration) => {
        const student = registration.student;
        if (!student) return null;
        return {
          _id: student._id,
          name: student.name,
          email: student.email,
          contact: student.contact,
          rollNumber: student.rollNumber,
          classInfo: student.classInfo,
          fatherName: student.fatherName,
          fatherContact: student.fatherContact,
          status: attendanceMap[String(student._id)]?.status || "",
          percentage: Math.round(
            attendanceMap[String(student._id)]?.percentage || 0,
          ),
        };
      })
      .filter(Boolean);

    return res.json({ success: true, students, course });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/markAttendance", authMiddleWare, async (req, res) => {
  try {
    const { courseId, classInfo, date, studentStatuses = [] } = req.body;

    if (!courseId || !classInfo || !date || !Array.isArray(studentStatuses)) {
      return res.status(400).json({
        success: false,
        message: "courseId, classInfo, date and studentStatuses are required",
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const teacherId = String(req.user.id);
    const isAssignedTeacher = (course.teachers || []).some(
      (teacher) => String(teacher) === teacherId,
    );
    if (!isAssignedTeacher) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const savedRecords = [];
    const day = startOfDay(date);

    for (const entry of studentStatuses) {
      const studentId = String(entry.studentId || "");
      const status = entry.status;

      if (!studentId || !["present", "absent"].includes(status)) continue;

      const registration = await Registration.findOne({
        student: studentId,
        classInfo,
        aboutCourse: { $elemMatch: { course: courseId } },
      });

      if (!registration) continue;

      const saved = await Attendance.findOneAndUpdate(
        { registration: registration._id, course: courseId, date: day },
        {
          registration: registration._id,
          course: courseId,
          date: day,
          status,
          markedBy: req.user.id,
          verificationStatus: "pending",
        },
        { upsert: true, new: true },
      );
      const getTotalLength = await Attendance.countDocuments({
        registration: registration._id,
        course: courseId,
      });
      const getPresentLength = await Attendance.countDocuments({
        registration: registration._id,
        course: courseId,
        status: "present",
      });
      const percentage =
        getTotalLength > 0 ? (getPresentLength / getTotalLength) * 100 : 0;
      saved.percentage = percentage;
      await saved.save();

      savedRecords.push(saved);
    }

    return res.json({
      success: true,
      message: "Attendance saved successfully",
      records: savedRecords,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;

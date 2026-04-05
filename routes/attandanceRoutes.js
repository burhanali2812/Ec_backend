const express = require("express");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const Attendance = require("../modals/Attandance");
const authMiddleWare = require("../authMiddleWare");

const router = express.Router();

const findTeacherAssignment = (course, teacherId) => {
  return (course.assignments || []).find(
    (item) => String(item?.teacher?._id || item?.teacher) === String(teacherId),
  );
};

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
    const courses = await Course.find({
      "assignments.teacher": req.user.id,
    }).populate("assignments.teacher", "name email");

    return res.json({ success: true, courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/classes/:courseId", authMiddleWare, async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).populate(
      "assignments.teacher",
      "name email",
    );

    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const teacherId = String(req.user.id);
    const teacherAssignment = findTeacherAssignment(course, teacherId);

    if (!teacherAssignment) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const classes = [
      ...new Set((teacherAssignment.targetClasses || []).filter(Boolean)),
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
    const teacherAssignment = findTeacherAssignment(course, teacherId);
    if (!teacherAssignment) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const allowedClasses = new Set(
      (teacherAssignment.targetClasses || []).map(String),
    );
    if (!allowedClasses.has(String(classInfo))) {
      return res
        .status(403)
        .json({ success: false, message: "Class not assigned to you" });
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
        };
      }
      return acc;
    }, {});

    const registrationIds = registrations.map(
      (registration) => registration._id,
    );
    const allAttendanceDocs = registrationIds.length
      ? await Attendance.find({
          course: courseId,
          registration: { $in: registrationIds },
        }).select("registration status")
      : [];

    const registrationStatsMap = allAttendanceDocs.reduce((acc, item) => {
      const registrationId = String(item.registration || "");
      if (!registrationId) return acc;

      if (!acc[registrationId]) {
        acc[registrationId] = { total: 0, present: 0 };
      }

      acc[registrationId].total += 1;
      if (item.status === "present") {
        acc[registrationId].present += 1;
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
          percentage: (() => {
            const stats = registrationStatsMap[String(registration._id)] || {
              total: 0,
              present: 0,
            };
            if (!stats.total) return 0;
            return Math.round((stats.present / stats.total) * 100);
          })(),
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
    const teacherAssignment = findTeacherAssignment(course, teacherId);
    if (!teacherAssignment) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    const allowedClasses = new Set(
      (teacherAssignment.targetClasses || []).map(String),
    );
    if (!allowedClasses.has(String(classInfo))) {
      return res
        .status(403)
        .json({ success: false, message: "Class not assigned to you" });
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

router.get("/studentStats/:courseId", authMiddleWare, async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;

    const registration = await Registration.findOne({
      student: studentId,
      aboutCourse: { $elemMatch: { course: courseId } },
    });

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: "Student not registered for this course",
      });
    }

    const attendanceDocs = await Attendance.find({
      registration: registration._id,
      course: courseId,
    }).select("date status").sort({ date: -1 });

    const total = attendanceDocs.length;
    const present = attendanceDocs.filter(
      (doc) => doc.status === "present",
    ).length;
    const absent = total - present;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    // Get recent 30 attendance records
    const recentAttendance = attendanceDocs.slice(0, 30).reverse().map(doc => ({
      date: new Date(doc.date).toLocaleDateString('en-GB'),
      status: doc.status
    }));

    const monthlyData = {};
    attendanceDocs.forEach((doc) => {
      const month = new Date(doc.date).toLocaleString("default", {
        month: "short",
      });
      if (!monthlyData[month]) {
        monthlyData[month] = { present: 0, absent: 0 };
      }
      if (doc.status === "present") {
        monthlyData[month].present += 1;
      } else {
        monthlyData[month].absent += 1;
      }
    });

    const chartData = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      present: data.present,
      absent: data.absent,
    }));

    return res.json({
      success: true,
      stats: {
        total,
        present,
        absent,
        percentage,
      },
      chartData,
      recentAttendance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;

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
          topic: item.topic || "",
        };
      }
      return acc;
    }, {});

    const sessionTopic = attendanceDocs[0]?.topic || "";

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

    return res.json({ success: true, students, course, topic: sessionTopic });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/markAttendance", authMiddleWare, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      message: "Unauthorized, You cannot mark attendance",
      success: false,
    });
  }
  try {
    const { courseId, classInfo, date, topic, studentStatuses = [] } = req.body;

    if (
      !courseId ||
      !classInfo ||
      !date ||
      !Array.isArray(studentStatuses) ||
      !String(topic || "").trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "courseId, classInfo, date, topic and studentStatuses are required",
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
          topic: String(topic).trim(),
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
    })
      .select("date status topic")
      .sort({ date: -1 });

    const total = attendanceDocs.length;
    const present = attendanceDocs.filter(
      (doc) => doc.status === "present",
    ).length;
    const absent = total - present;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    // Get recent 30 attendance records
    const recentAttendance = attendanceDocs
      .slice(0, 30)
      .reverse()
      .map((doc) => ({
        date: new Date(doc.date).toLocaleDateString("en-GB"),
        status: doc.status,
        topic: doc.topic || "",
      }));

    const monthlyData = {};
    const monthlyHistoryMap = {};
    attendanceDocs.forEach((doc) => {
      const dateObj = new Date(doc.date);
      const month = dateObj.toLocaleString("default", {
        month: "short",
      });
      const monthLabel = dateObj.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
      const monthKey = `${dateObj.getFullYear()}-${String(
        dateObj.getMonth() + 1,
      ).padStart(2, "0")}`;

      if (!monthlyHistoryMap[monthKey]) {
        monthlyHistoryMap[monthKey] = [];
      }

      monthlyHistoryMap[monthKey].push({
        rawDate: dateObj.toISOString(),
        date: dateObj.toLocaleDateString("en-GB"),
        status: doc.status,
        topic: doc.topic || "",
        dayLabel: dateObj.toLocaleDateString("en-GB", { day: "2-digit" }),
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month,
          monthLabel,
          present: 0,
          absent: 0,
          year: dateObj.getFullYear(),
          monthNumber: dateObj.getMonth() + 1,
        };
      }
      if (doc.status === "present") {
        monthlyData[monthKey].present += 1;
      } else {
        monthlyData[monthKey].absent += 1;
      }
    });

    const monthlyDetails = Object.entries(monthlyData)
      .sort(([a], [b]) => String(b).localeCompare(String(a)))
      .map(([, data]) => ({
        month: data.month,
        monthLabel: data.monthLabel,
        present: data.present,
        absent: data.absent,
        total: data.present + data.absent,
        year: data.year,
        monthNumber: data.monthNumber,
        history:
          monthlyHistoryMap[
            `${data.year}-${String(data.monthNumber).padStart(2, "0")}`
          ]
            ?.slice()
            .sort(
              (a, b) =>
                new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime(),
            )
            .map(({ rawDate, ...rest }) => rest) || [],
      }));

    const chartData = monthlyDetails.map((item) => ({
      month: item.month,
      present: item.present,
      absent: item.absent,
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
      monthlyDetails,
      recentAttendance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get class attendance with filters
router.get("/getClassAttendance/:className", authMiddleWare, async (req, res) => {
  try {
    if(req.user.role !== "admin") {
      return res.status(403).json({
        message: "Unauthorized, Only admins can fetch class attendance",
        success: false,
      });
    }
    const { className } = req.params;
    const { startDate, endDate, course } = req.query;

    if (!className) {
      return res.status(400).json({
        message: "Class name is required",
        success: false,
      });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) {
        dateFilter.date.$gte = new Date(startDate);
        dateFilter.date.$gte.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        dateFilter.date.$lte = new Date(endDate);
        dateFilter.date.$lte.setHours(23, 59, 59, 999);
      }
    }

    // Get all students in this class
    const Student = require("../modals/Student");
    const students = await Student.find({ classInfo: className });
    const studentIds = students.map((s) => s._id);

    // Get registrations for these students
    const registrations = await Registration.find({
      student: { $in: studentIds },
    });
    const registrationIds = registrations.map((r) => r._id);

    // Build attendance filter
    let attendanceFilter = {
      registration: { $in: registrationIds },
      ...dateFilter,
    };

    // Add course filter if specified
    if (course && course !== "all") {
      attendanceFilter.course = course;
    }

    // Fetch attendance records with populated data
    const attendanceRecords = await Attendance.find(attendanceFilter)
      .populate({
        path: "registration",
        select: "student",
        populate: {
          path: "student",
          select: "name rollNumber classInfo",
        },
      })
      .populate("course", "title")
      .sort({ date: -1 });

    // Format the response data
    const formattedAttendance = attendanceRecords.map((record) => ({
      _id: record._id,
      studentName: record.registration?.student?.name || "N/A",
      rollNumber: record.registration?.student?.rollNumber || "N/A",
      courseName: record.course?.title || "N/A",
      date: record.date,
      status: record.status,
      notes: record.topic || "",
    }));

    res.status(200).json({
      message: "Attendance records fetched successfully",
      success: true,
      attendance: formattedAttendance,
      count: formattedAttendance.length,
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return res.status(500).json({
      message: "Error fetching attendance records",
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;

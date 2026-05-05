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
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const teacherId = String(req.user.id);
    const teacherAssignment = findTeacherAssignment(course, teacherId);

    if (req.user.role !== "admin" && !teacherAssignment) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    // For admins, skip class validation; for teachers, restrict to their assigned classes
    if (req.user.role !== "admin") {
      const allowedClasses = new Set(
        (teacherAssignment?.targetClasses || []).map(String),
      );

      if (!allowedClasses.has(String(classInfo))) {
        return res.status(403).json({
          success: false,
          message: "Class not assigned to you",
        });
      }
    }

    // Convert incoming date string (YYYY-MM-DD) to Date object for comparison
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);
    const endOfDateObj = new Date(date);
    endOfDateObj.setHours(23, 59, 59, 999);

    console.log("DATE CHECK:", {
      received: date,
      dateObj,
      endOfDateObj,
    });

    // 1. Get registrations
    const registrations = await Registration.find({
      classInfo,
      aboutCourse: { $elemMatch: { course: courseId } },
    }).populate("student");

    const registrationMap = new Map();
    const registrationIds = [];

    registrations.forEach((r) => {
      if (r.student) {
        registrationMap.set(String(r._id), r);
        registrationIds.push(r._id);
      }
    });

    // 2. Get TODAY attendance with date range matching (Date objects)
    const attendanceDocs = await Attendance.find({
      course: courseId,
      date: { $gte: dateObj, $lte: endOfDateObj },
      registration: { $in: registrationIds },
    });

    // DEBUG: Log the query and results
    console.log("Attendance Query:", {
      courseId,
      date: normalizedDate,
      registrationIds: registrationIds.length,
      attendanceFound: attendanceDocs.length,
    });

    // 3. Map by REGISTRATION (NOT student)
    const attendanceMap = new Map();

    attendanceDocs.forEach((item) => {
      attendanceMap.set(String(item.registration), {
        status: item.status,
        topic: item.topic,
      });
    });

    // 4. Get session topic safely
    const sessionTopic = attendanceDocs[0]?.topic || "";

    // 5. Get full attendance history for percentage
    const allAttendanceDocs = await Attendance.find({
      course: courseId,
      registration: { $in: registrationIds },
    }).select("registration status");

    const statsMap = new Map();

    allAttendanceDocs.forEach((item) => {
      const id = String(item.registration);

      if (!statsMap.has(id)) {
        statsMap.set(id, { total: 0, present: 0 });
      }

      const stats = statsMap.get(id);
      stats.total++;

      if (item.status === "present") {
        stats.present++;
      }
    });

    // 6. FINAL RESPONSE
    const students = registrations
      .map((r) => {
        const student = r.student;

        if (!student) return null;

        const attendance = attendanceMap.get(String(r._id)) || {};
        const stats = statsMap.get(String(r._id)) || { total: 0, present: 0 };

        return {
          _id: student._id,
          name: student.name,
          email: student.email,
          contact: student.contact,
          rollNumber: student.rollNumber,
          classInfo: student.classInfo,
          fatherName: student.fatherName,
          fatherContact: student.fatherContact,

          // TODAY attendance
          status: attendance.status || "",

          // percentage
          percentage: stats.total
            ? Math.round((stats.present / stats.total) * 100)
            : 0,
        };
      })
      .filter(Boolean);

    return res.json({
      success: true,
      students,
      course,
      topic: sessionTopic,
      date: normalizedDate,
      hasAttendanceToday: attendanceDocs.length > 0,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
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
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const teacherId = String(req.user.id);
    const teacherAssignment = findTeacherAssignment(course, teacherId);

    if (!teacherAssignment) {
      return res.status(403).json({
        success: false,
        message: "Not allowed",
      });
    }

    const allowedClasses = new Set(
      (teacherAssignment.targetClasses || []).map(String),
    );

    if (!allowedClasses.has(String(classInfo))) {
      return res.status(403).json({
        success: false,
        message: "Class not assigned to you",
      });
    }

    // Convert date string (YYYY-MM-DD) to Date object with start of day
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    const savedRecords = [];

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
        {
          registration: registration._id,
          course: courseId,
          date: {
            $gte: dateObj,
            $lte: new Date(dateObj.getTime() + 86399999), // End of day
          },
        },
        {
          $set: {
            registration: registration._id,
            course: courseId,
            date: dateObj,
            topic: String(topic).trim(),
            status,
            markedBy: req.user.id,
            verificationStatus: "pending",
          },
        },
        { upsert: true, new: true },
      );

      savedRecords.push(saved);
    }

    return res.json({
      success: true,
      message: "Attendance saved successfully",
      records: savedRecords,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
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
router.get(
  "/getClassAttendance/:className",
  authMiddleWare,
  async (req, res) => {
    try {
      if (req.user.role !== "admin") {
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
  },
);

// Get student attendance by student ID
router.get("/getStudentAttendance", authMiddleWare, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Unauthorized, Only admins can fetch student attendance",
        success: false,
      });
    }

    const { studentId, startDate, endDate } = req.query;

    if (!studentId) {
      return res.status(400).json({
        message: "studentId is required",
        success: false,
      });
    }

    // Get all registrations for this student
    const registrations = await Registration.find({
      student: studentId,
    });
    const registrationIds = registrations.map((r) => r._id);
    console.log("Registrations found:", registrations.length);
    console.log("Registration IDs:", registrationIds);

    if (registrationIds.length === 0) {
      return res.status(200).json({
        message: "No registrations found for this student",
        success: true,
        attendance: [],
      });
    }

    // Build query filter - convert date strings to Date objects
    let queryFilter = {
      registration: { $in: registrationIds },
    };

    // Handle date range with Date objects
    if (startDate || endDate) {
      queryFilter.date = {};
      if (startDate) {
        const startDateObj = new Date(startDate);
        startDateObj.setHours(0, 0, 0, 0);
        queryFilter.date.$gte = startDateObj;
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        queryFilter.date.$lte = endDateObj;
      }
    }

    console.log("Fetching attendance for student:", {
      studentId,
      startDate,
      endDate,
      queryFilter,
    });

    // Fetch attendance records WITH date filter
    const attendanceRecords = await Attendance.find(queryFilter)
      .populate("course", "title")
      .populate({
        path: "registration",
        select: "student",
        populate: {
          path: "student",
          select: "name rollNumber classInfo email contact",
        },
      })
      .sort({ date: -1 });

    console.log(
      "Attendance records found (with filter):",
      attendanceRecords.length,
    );

    res.status(200).json({
      message: "Student attendance records fetched successfully",
      success: true,
      attendance: attendanceRecords,
      count: attendanceRecords.length,
    });
  } catch (error) {
    console.error("Error fetching student attendance:", error);
    return res.status(500).json({
      message: "Error fetching student attendance records",
      success: false,
      error: error.message,
    });
  }
});

router.delete(
  "/deleteAttendance/:attendanceId",
  authMiddleWare,
  async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Unauthorized, Only admins can delete attendance records",
          success: false,
        });
      }
      const { attendanceId } = req.params;

      const deleted = await Attendance.findByIdAndDelete(attendanceId);
      if (!deleted) {
        return res.status(404).json({
          message: "Attendance record not found",
          success: false,
        });
      }
      return res.status(200).json({
        message: "Attendance record deleted successfully",
        success: true,
      });
    } catch (error) {
      console.error("Error deleting attendance record:", error);
      return res.status(500).json({
        message: "Error deleting attendance record",
        success: false,
        error: error.message,
      });
    }
  },
);

router.post(
  "/updateAttendance/:attendanceId",
  authMiddleWare,
  async (req, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Unauthorized, Only admins can update attendance records",
          success: false,
        });
      }

      const { attendanceId } = req.params;
      const { status } = req.body;
      if (!["present", "absent"].includes(status)) {
        return res.status(400).json({
          message: "Invalid status value",
          success: false,
        });
      }

      const attendanceRecord = await Attendance.findById(attendanceId);
      if (!attendanceRecord) {
        return res.status(404).json({
          message: "Attendance record not found",
          success: false,
        });
      }
      // disallow admin to change the ststuas id date is 72 hours old from the current date
      const now = new Date();
      const recordDate = new Date(attendanceRecord.date);
      const hoursDifference = (now - recordDate) / (1000 * 60 * 60);

      if (hoursDifference > 72) {
        return res.status(400).json({
          message:
            "Attendance record cannot be updated as it is older than 72 hours",
          success: false,
        });
      }

      const updatedPercentage = await Attendance.countDocuments({
        registration: attendanceRecord.registration,
        course: attendanceRecord.course,
      });
      const updatedPresent = await Attendance.countDocuments({
        registration: attendanceRecord.registration,
        course: attendanceRecord.course,
        status: "present",
      });
      const percentage =
        updatedPercentage > 0 ? (updatedPresent / updatedPercentage) * 100 : 0;
      const updated = await Attendance.findByIdAndUpdate(
        attendanceId,
        {
          status,
          percentage,
        },
        { new: true },
      );

      if (!updated) {
        return res.status(404).json({
          message: "Attendance record not found",
          success: false,
        });
      }

      return res.status(200).json({
        message: "Attendance record updated successfully",
        success: true,
        attendance: updated,
      });
    } catch (error) {
      console.error("Error updating attendance record:", error);
      return res.status(500).json({
        message: "Error updating attendance record",
        success: false,
        error: error.message,
      });
    }
  },
);

module.exports = router;

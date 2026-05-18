const express = require("express");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const Attendance = require("../modals/Attandance");
const authMiddleWare = require("../authMiddleWare");
const LeaveApplication = require("../modals/LeaveApplication");

const router = express.Router();

const findTeacherAssignment = (course, teacherId) => {
  return (course.assignments || []).find(
    (item) => String(item?.teacher?._id || item?.teacher) === String(teacherId),
  );
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
// router.patch("/migrate-classinfo", async (req, res) => {
//   try {
    
//     // Find records missing classInfo
//     const records = await Attendance.find({
//       $or: [
//         { classInfo: { $exists: false } },
//         { classInfo: null },
//         { classInfo: "" },
//       ],
//     }).populate("registration", "classInfo");

//     let updatedCount = 0;
//     let skipped = 0;

//     for (const rec of records) {
//       if (rec.registration && rec.registration.classInfo) {
//         rec.classInfo = rec.registration.classInfo;
//         await rec.save();
//         updatedCount++;
//       } else {
//         skipped++;
//       }
//     }

//     return res.json({
//       success: true,
//       message: "Migration completed",
//       totalFound: records.length,
//       updated: updatedCount,
//       skipped,
//     });
//   } catch (error) {
//     console.error("Migration error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Migration failed",
//     });
//   }
// });

router.get("/session", authMiddleWare, async (req, res) => {
  try {
    let { courseId, classInfo, date, fetchedBy } = req.query;

    if (!courseId || !classInfo || !date) {
      return res.status(400).json({
        success: false,
        message: "courseId, classInfo and date are required",
      });
    }

    
    classInfo = String(classInfo).trim();

    const dateObj = new Date(`${date}T00:00:00.000Z`);

    const start = new Date(dateObj);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(dateObj);
    end.setUTCHours(23, 59, 59, 999);


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

    if (req.user.role !== "admin") {
      const allowedClasses = new Set(
        (teacherAssignment?.targetClasses || []).map((c) =>
          String(c).trim()
        )
      );

      if (!allowedClasses.has(classInfo)) {
        return res.status(403).json({
          success: false,
          message: "Class not assigned to you",
          isClassAllowed: false,
        });
      }
    }

  
    const registrations = await Registration.find({
      classInfo,
      aboutCourse: {
        $elemMatch: { course: courseId },
      },
    }).populate("student");

    const registrationIds = registrations
      .filter((r) => r.student)
      .map((r) => r._id);

    
    const attendanceDocs = await Attendance.find({
      course: courseId,
   
      registration: { $in: registrationIds },
      date: {
        $gte: start,
        $lte: end,
      },
    });

    const hasAttendanceToday = attendanceDocs.length > 0;

    if (
      hasAttendanceToday &&
      (
        fetchedBy === "teacherForMarkAttendance")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance session already exists for this course, class and date",
      });
    }

   
    const attendanceMap = new Map();

    attendanceDocs.forEach((item) => {
      attendanceMap.set(String(item.registration), {
        status: item.status,
        topic: item.topic,
      });
    });

    const sessionTopic = attendanceDocs[0]?.topic || "";

 
    const allAttendanceDocs = await Attendance.find({
      course: courseId,
      registration: { $in: registrationIds },
    }).select("registration status");

    const statsMap = new Map();

    allAttendanceDocs.forEach((item) => {
      const regId = String(item.registration);

      if (!statsMap.has(regId)) {
        statsMap.set(regId, { total: 0, present: 0 });
      }
let stats;
      if(item.status !== "onLeave"){
          stats = statsMap.get(regId);

      stats.total += 1;
      }

      if (item.status === "present") {
        stats.present += 1;
      }
    });

  
    const students = registrations
      .map((r) => {
        const student = r.student;
        if (!student) return null;

        const attendance = attendanceMap.get(String(r._id)) || {};
        const stats = statsMap.get(String(r._id)) || {
          total: 0,
          present: 0,
        };

        return {
          _id: student._id,
          name: student.name,
          email: student.email,
          contact: student.contact,
          rollNumber: student.rollNumber,
          classInfo: student.classInfo,
          fatherName: student.fatherName,
          fatherContact: student.fatherContact,

          // TODAY STATUS (FIXED)
          status: attendance.status || "",

          // PERCENTAGE
          percentage:
            stats.total > 0
              ? Math.round((stats.present / stats.total) * 100)
              : 0,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      students,
      course,
      topic: sessionTopic,
      date,
      totalStudents: students.length,
      hasAttendanceToday,
    });
  } catch (error) {
    console.error("SESSION API ERROR:", error);

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
        message: "courseId, classInfo, date, topic and studentStatuses are required",
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

    // ✅ FIXED UTC DATE
    const dateObj = new Date(`${date}T00:00:00.000Z`);

    const savedRecords = [];

    for (const entry of studentStatuses) {
      const studentId = String(entry.studentId || "");
      let status = entry.status;

      if (!studentId || !["present", "absent", "onLeave"].includes(status)) continue;

      const registration = await Registration.findOne({
        student: studentId,
        classInfo,
        aboutCourse: { $elemMatch: { course: courseId } },
      });
   

      if (!registration) continue;
         const checkLeave = await LeaveApplication.findOne({
        studentId,
        applicant: "Student",
        fromDate: { $lte: date },
        toDate: { $gte: date },
        status: "Approved",
      });
      if(checkLeave){
        status = "onLeave";
      }

      const saved = await Attendance.findOneAndUpdate(
        {
          registration: registration._id,
          course: courseId,
          date: dateObj,
        },
        {
          $set: {
            registration: registration._id,
            course: courseId,
            classInfo,
            date: dateObj,
            topic: String(topic).trim(),
            status,
            markedBy: req.user.id,
            verificationStatus: "pending",
          },
        },
        { upsert: true, new: true },
      );
      const allRecords = await Attendance.find({
        registration: registration._id,
        course: courseId,
      });

      const total = allRecords.filter(a => a.status !== "onLeave").length;
      const present = allRecords.filter(a => a.status === "present").length;

      const percentage = total > 0
        ? Math.round((present / total) * 100)
        : 0;

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

    const total = attendanceDocs.filter(a => a.status !== "onLeave").length;
    const present = attendanceDocs.filter(
      (doc) => doc.status === "present"
    ).length;

    const absent = total - present;
    const onLeave = attendanceDocs.filter((doc) => doc.status === "onLeave").length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;


    const recentAttendance = attendanceDocs
      .slice(0, 30)
      .reverse()
      .map((doc) => {
        const d = new Date(doc.date);

        return {
          date: d.toISOString().split("T")[0], // UTC date only
          status: doc.status,
          topic: doc.topic || "",
        };
      });

    const monthlyData = {};
    const monthlyHistoryMap = {};

    attendanceDocs.forEach((doc) => {
      const d = new Date(doc.date);

      const year = d.getUTCFullYear();
      const monthIndex = d.getUTCMonth();
      const day = d.getUTCDate();

      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

      const month = d.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      });

      const monthLabel = d.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });

      if (!monthlyHistoryMap[monthKey]) {
        monthlyHistoryMap[monthKey] = [];
      }

      monthlyHistoryMap[monthKey].push({
        rawDate: d.toISOString(),
        date: d.toISOString().split("T")[0],
        status: doc.status,
        topic: doc.topic || "",
        dayLabel: String(day).padStart(2, "0"),
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month,
          monthLabel,
          present: 0,
          absent: 0,
          onLeave: 0,
          year,
          monthNumber: monthIndex + 1,
        };
      }

      if (doc.status === "present") {
        monthlyData[monthKey].present += 1;
      } else if (doc.status === "onLeave") {
        monthlyData[monthKey].onLeave += 1;
      } else {
        monthlyData[monthKey].absent += 1;
      }
    });


    const monthlyDetails = Object.entries(monthlyData)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, data]) => ({
        ...data,
        total: data.present + data.absent + data.onLeave,
        history:
          monthlyHistoryMap[
            `${data.year}-${String(data.monthNumber).padStart(2, "0")}`
          ]
            ?.sort((a, b) => a.rawDate.localeCompare(b.rawDate))
            .map(({ rawDate, ...rest }) => rest) || [],
      }));

    const chartData = monthlyDetails.map((item) => ({
      month: item.month,
      present: item.present,
      absent: item.absent,
      onLeave: item.onLeave,
    }));

    return res.json({
      success: true,
      stats: {
        total,
        present,
        absent,
        onLeave,
        percentage,
      },
      chartData,
      monthlyDetails,
      recentAttendance,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
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

   
      let dateFilter = {};

      if (startDate || endDate) {
        dateFilter.date = {};

        if (startDate) {
          const start = new Date(`${startDate}T00:00:00.000Z`);
          dateFilter.date.$gte = start;
        }

        if (endDate) {
          const end = new Date(`${endDate}T23:59:59.999Z`);
          dateFilter.date.$lte = end;
        }
      }

   
      const Student = require("../modals/Student");

      const students = await Student.find({
        classInfo: className,
      });

      const studentIds = students.map((s) => s._id);

    
      const registrations = await Registration.find({
        student: { $in: studentIds },
      });

      const registrationIds = registrations.map((r) => r._id);

    
      let attendanceFilter = {
        registration: { $in: registrationIds },
        ...dateFilter,
      };

      if (course && course !== "all") {
        attendanceFilter.course = course;
      }

 
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


      const formattedAttendance = attendanceRecords.map((record) => {
        const d = new Date(record.date);

        return {
          _id: record._id,
          studentName: record.registration?.student?.name || "N/A",
          rollNumber:
            record.registration?.student?.rollNumber || "N/A",
          courseName: record.course?.title || "N/A",

          // UTC SAFE DATE
          date: d.toISOString().split("T")[0],

          status: record.status,
          notes: record.topic || "",
        };
      });

      return res.status(200).json({
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
  }
);

// Get student attendance by student ID

router.get("/getStudentAttendance", authMiddleWare, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "teacher" ) {
      return res.status(403).json({
        message: "Unauthorized, Only admins and teachers can fetch student attendance",
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
          message:
            "Unauthorized, Only admins can update attendance records",
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

     
      const nowUTC = Date.now();
      const recordUTC = new Date(attendanceRecord.date).getTime();

      const hoursDifference =
        (nowUTC - recordUTC) / (1000 * 60 * 60);

      if (hoursDifference > 72) {
        return res.status(400).json({
          message:
            "Attendance record cannot be updated as it is older than 72 hours",
          success: false,
        });
      }


      const totalRecords = await Attendance.countDocuments({
        registration: attendanceRecord.registration,
        course: attendanceRecord.course,
      });

      const presentRecords = await Attendance.countDocuments({
        registration: attendanceRecord.registration,
        course: attendanceRecord.course,
        status: "present",
      });

      const percentage =
        totalRecords > 0
          ? (presentRecords / totalRecords) * 100
          : 0;

      const updated = await Attendance.findByIdAndUpdate(
        attendanceId,
        {
          status,
          percentage,
        },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({
          message: "Attendance record not found",
          success: false,
        });
      }

      
      const d = new Date(updated.date);

      return res.status(200).json({
        message: "Attendance record updated successfully",
        success: true,
        attendance: {
          ...updated.toObject(),
          date: d.toISOString().split("T")[0],
        },
      });
    } catch (error) {
      console.error("Error updating attendance record:", error);

      return res.status(500).json({
        message: "Error updating attendance record",
        success: false,
        error: error.message,
      });
    }
  }
);


// router.put("/fix-attendance-dates", async (req, res) => {
//   try {
//     const records = await Attendance.find();

//     let updatedCount = 0;
//     let deletedDuplicates = 0;

//     for (const record of records) {
//       const oldDate = new Date(record.date);

//       // Add 1 day
//       oldDate.setDate(oldDate.getDate() + 1);

//       // Normalize UTC midnight
//       const correctedDate = new Date(
//         `${oldDate.toISOString().split("T")[0]}T00:00:00.000Z`
//       );

//       // Check if corrected record already exists
//       const existing = await Attendance.findOne({
//         _id: { $ne: record._id },
//         registration: record.registration,
//         course: record.course,
//         date: correctedDate,
//       });

//       if (existing) {
//         // Duplicate would happen -> delete old wrong record
//         await Attendance.findByIdAndDelete(record._id);

//         deletedDuplicates++;

//         console.log(
//           `Deleted duplicate record: ${record._id}`
//         );
//       } else {
//         // Safe to update
//         record.date = correctedDate;

//         await record.save();

//         updatedCount++;

//         console.log(
//           `Updated: ${record._id}`
//         );
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Attendance dates fixed successfully",
//       updatedCount,
//       deletedDuplicates,
//     });
//   } catch (error) {
//     console.error("FIX DATE ERROR:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message,
//     });
//   }
// });

module.exports = router;

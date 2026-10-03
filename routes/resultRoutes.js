const express = require("express");
const router = express.Router();
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const Result = require("../modals/Result");
const authMiddleWare = require("../authMiddleWare");
const { notifyResultUploaded } = require("../notificationService");
const Course = require("../modals/Course");

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const requireInstitution = (req, res, next) => {
  if (!req.user || !req.user.institution) {
    return res.status(403).json({
      message: "Institution missing from your session. Please log in again.",
      success: false,
    });
  }
  next();
};

router.post("/submitResult", authMiddleWare, requireInstitution, async (req, res) => {
  const {
    studentId,
    courseId,
    marksObtained,
    dateOfExam,
    totalMarks,
    remarks,
    topic
  } = req.body;
  if (
    !studentId ||
    !courseId ||
    marksObtained == null ||
    !dateOfExam ||
    totalMarks == null ||
    !topic
  ) {
    return res
      .status(400)
      .json({
        message: "All fields except grade and remarks are required",
        success: false,
      });
  }
  try {
    const student = await Student.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found", success: false });
    }

    // Confirm the student is actually enrolled at THIS institution -
    // otherwise a teacher at School could submit a result for a student
    // only enrolled at Academy.
    const enrolledHere = student.enrollments.some(
      (e) => e.institution.toString() === req.user.institution._id.toString(),
    );
    if (!enrolledHere) {
      return res.status(403).json({
        message: "Student is not enrolled at this institution",
        success: false,
      });
    }

    const course = await Course.findOne({
      _id: courseId,
      institution: req.user.institution._id,
    });
    if (!course) {
      return res
        .status(404)
        .json({ message: "Course not found", success: false });
    }

    const marks = Number(marksObtained);
    const total = Number(totalMarks);
    if (!Number.isFinite(marks) || !Number.isFinite(total) || total <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid marks values", success: false });
    }

    // FIXED: institution is a REQUIRED field on Result, but the original
    // route never set it - every save here should have been failing
    // schema validation.
    const newResult = new Result({
      student: studentId,
      course: courseId,
      institution: req.user.institution._id,
      marksObtained: marks,
      dateOfExam,
      totalMarks: total,
      topic,
      remarks,
    });
    await newResult.save();

    // FIXED: notifyResultUploaded now requires an institution too
    // (same Notification.institution: required: true change as the
    // other notify* helpers).
    await notifyResultUploaded([studentId], {
      courseName: course.title,
      dateOfExam: dateOfExam,
      institution: req.user.institution._id,
    });
    res.json({ message: "Result submitted successfully", success: true });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "A result for this student, course and exam date already exists",
        success: false,
      });
    }
    res.status(500).json({ message: "Server error", success: false , error: error.message});
  }
});

// Scoped to THIS institution - a student enrolled at both School and
// Academy would otherwise have results from both mixed together here.
router.get("/getResults/:studentId", authMiddleWare, requireInstitution, async (req, res) => {
  const { studentId } = req.params;
  try {
    const results = await Result.find({
      student: studentId,
      institution: req.user.institution._id,
    }).populate("course", "title");
    res.json({ results, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/studentStats/:courseId", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;

    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can view this result data",
      });
    }

    const registration = await Registration.findOne({
      student: studentId,
      institution: req.user.institution._id,
      aboutCourse: { $elemMatch: { course: courseId } },
    });

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: "Student not registered for this course",
      });
    }

    const resultDocs = await Result.find({
      student: studentId,
      course: courseId,
      institution: req.user.institution._id,
    })
      .select("dateOfExam marksObtained totalMarks remarks topic")
      .sort({ dateOfExam: -1 });

    const totalExams = resultDocs.length;
    const totalMarks = resultDocs.reduce(
      (sum, doc) => sum + Number(doc.totalMarks || 0),
      0,
    );
    const obtainedMarks = resultDocs.reduce(
      (sum, doc) => sum + Number(doc.marksObtained || 0),
      0,
    );
    const percentage =
      totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;

    const recentResults = resultDocs
      .slice(0, 30)
      .reverse()
      .map((doc) => {
        const total = Number(doc.totalMarks || 0);
        const obtained = Number(doc.marksObtained || 0);
        return {
          date: new Date(doc.dateOfExam).toLocaleDateString("en-GB"),
          marksObtained: obtained,
          totalMarks: total,
          percentage: total > 0 ? Math.round((obtained / total) * 100) : 0,
          remarks: doc.remarks || "",
          topic: doc.topic || "",
        };
      });

    const monthlyData = {};
    const monthlyHistoryMap = {};

    resultDocs.forEach((doc) => {
      const dateObj = new Date(doc.dateOfExam);
      const month = dateObj.toLocaleString("default", { month: "short" });
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

      const total = Number(doc.totalMarks || 0);
      const obtained = Number(doc.marksObtained || 0);

      monthlyHistoryMap[monthKey].push({
        rawDate: dateObj.toISOString(),
        date: dateObj.toLocaleDateString("en-GB"),
        marksObtained: obtained,
        totalMarks: total,
        percentage: total > 0 ? Math.round((obtained / total) * 100) : 0,
        remarks: doc.remarks || "",
        topic: doc.topic || "",
        dayLabel: dateObj.toLocaleDateString("en-GB", { day: "2-digit" }),
      });

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month,
          monthLabel,
          obtainedMarks: 0,
          totalMarks: 0,
          exams: 0,
          year: dateObj.getFullYear(),
          monthNumber: dateObj.getMonth() + 1,
        };
      }

      monthlyData[monthKey].obtainedMarks += obtained;
      monthlyData[monthKey].totalMarks += total;
      monthlyData[monthKey].exams += 1;
    });

    const monthlyDetails = Object.entries(monthlyData)
      .sort(([a], [b]) => String(b).localeCompare(String(a)))
      .map(([, data]) => ({
        month: data.month,
        monthLabel: data.monthLabel,
        obtainedMarks: data.obtainedMarks,
        totalMarks: data.totalMarks,
        exams: data.exams,
        percentage:
          data.totalMarks > 0
            ? Math.round((data.obtainedMarks / data.totalMarks) * 100)
            : 0,
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
      percentage: item.percentage,
      obtainedMarks: item.obtainedMarks,
      totalMarks: item.totalMarks,
    }));

    return res.json({
      success: true,
      stats: {
        totalExams,
        obtainedMarks,
        totalMarks,
        percentage,
      },
      chartData,
      monthlyDetails,
      recentResults,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/updateResult/:resultId", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      success: false,
      message: "Only teachers can update results",
    });
  }
  const { resultId } = req.params;
  const { marksObtained, totalMarks, remarks, dateOfExam, topic } = req.body;
  if (
    marksObtained == null ||
    totalMarks == null ||
    !dateOfExam ||
    !topic
  ) {
    return res
      .status(400)
      .json({
        message: "Marks obtained, total marks, and date are required",
        success: false,
      });
  }
  try {
    // FIXED: previously fetched by _id alone with NO ownership check at
    // all - any teacher, at any institution, could update any result by
    // guessing or being given its ID. Scoped by {_id, institution} now.
    const result = await Result.findOne({
      _id: resultId,
      institution: req.user.institution._id,
    });
    if (!result) {
      return res
        .status(404)
        .json({ message: "Result not found", success: false });
    }
    result.marksObtained = marksObtained;
    result.totalMarks = totalMarks;
    result.remarks = remarks;
    result.dateOfExam = dateOfExam;
    result.topic = topic;
    await result.save();
    res.json({ message: "Result updated successfully", success: true });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "A result for this student, course and exam date already exists",
        success: false,
      });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


// getResultsByClass:
// - courseId and classInfo are required.
// - `date` is now OPTIONAL. When omitted, ALL results for that course+class
//   are returned (across every exam date) so the frontend can group them by
//   date and let the teacher filter client-side.
// - When `date` is provided, results are additionally narrowed to that day
//   (kept for backward compatibility / future use), but the default edit
//   flow no longer sends it on the initial fetch.
router.get("/getResultsByClass", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      success: false,
      message: "Only teachers can view results by class",
    });
  }
  try {
    const { courseId, classInfo, date } = req.query;

    if (!courseId || !classInfo) {
      return res.status(400).json({
        success: false,
        message: "courseId and classInfo are required.",
      });
    }

    // Step 0: confirm the course actually belongs to this institution.
    const course = await Course.findOne({
      _id: courseId,
      institution: req.user.institution._id,
    });
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // Step 1: find which students are registered in this course + class,
    // AT THIS INSTITUTION - a student enrolled at both School and Academy
    // could otherwise have registrations across both match the same
    // classInfo value by coincidence.
    const registrations = await Registration.find({
      "aboutCourse.course": courseId,
      classInfo: classInfo,
      institution: req.user.institution._id,
    }).select("student");

    const studentIds = registrations.map((r) => r.student);

    if (!studentIds.length) {
      return res.status(200).json({ success: true, results: [] });
    }

    // Step 2: build the query. Date range is only applied if a date was
    // explicitly passed in — otherwise we fetch every result for this
    // course + class so they can be grouped by date on the frontend.
    const query = {
      course: courseId,
      institution: req.user.institution._id,
      student: { $in: studentIds },
    };

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      query.dateOfExam = { $gte: startOfDay, $lte: endOfDay };
    }

    // Step 3: find results for those students, this course (all dates
    // unless a date filter was passed), most recent exam first.
    const results = await Result.find(query)
      .populate("student", "name enrollments")
      .sort({ dateOfExam: -1 });

    // Step 4: flatten for the frontend. rollNumber now lives inside the
    // student's enrollments array (per institution), not as a top-level
    // field, so pull out the entry matching this institution.
    const flattened = results.map((r) => {
      const enrollment = (r.student?.enrollments || []).find(
        (e) => e.institution?.toString() === req.user.institution._id.toString(),
      );
      return {
        _id: r._id,
        studentId: r.student?._id,
        name: r.student?.name,
        rollNumber: enrollment?.rollNumber,
        marksObtained: r.marksObtained,
        totalMarks: r.totalMarks,
        topic: r.topic,
        dateOfExam: r.dateOfExam,
        remarks: r.remarks,
      };
    });

    return res.status(200).json({ success: true, results: flattened });
  } catch (error) {
    console.error("Error fetching results by class:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


// NOTE: this route looks stale/unrelated to the current schema -
// Registration has no top-level "course" field (courses live in
// aboutCourse[]), so `registration.course = courseId; await
// registration.save();` silently writes a field Mongoose doesn't define
// and drops it under strict mode. Left functionally as-is here (with
// institution scoping added) but flagged for review - it likely isn't
// doing what it looks like it's meant to do.
router.put("/updateRegistration", authMiddleWare, requireInstitution, async (req, res) => {
  const { registrationId, courseId } = req.body;
  if (!registrationId || !courseId) {
    return res
      .status(400)
      .json({
        message: "Registration ID and Course ID are required",
        success: false,
      });
  }
  try {
    const registration = await Registration.findOne({
      _id: registrationId,
      institution: req.user.institution._id,
    });
    if (!registration) {
      return res
        .status(404)
        .json({ message: "Registration not found", success: false });
    }
    registration.course = courseId;
    await registration.save();
    res.json({ message: "Registration updated successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

module.exports = router;
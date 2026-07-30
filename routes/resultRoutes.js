const express = require("express");
const router = express.Router();
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const Result = require("../modals/Result");
const authMiddleWare = require("../authMiddleWare");

router.post("/submitResult", authMiddleWare, async (req, res) => {
  const {
    studentId,
    courseId,
    marksObtained,
    dateOfExam,
    totalMarks,
    remarks,
  } = req.body;
  if (
    !studentId ||
    !courseId ||
    marksObtained == null ||
    !dateOfExam ||
    totalMarks == null
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

    const marks = Number(marksObtained);
    const total = Number(totalMarks);
    if (!Number.isFinite(marks) || !Number.isFinite(total) || total <= 0) {
      return res
        .status(400)
        .json({ message: "Invalid marks values", success: false });
    }

    const newResult = new Result({
      student: studentId,
      course: courseId,
      marksObtained: marks,
      dateOfExam,
      totalMarks: total,
      remarks,
    });
    await newResult.save();
    res.json({ message: "Result submitted successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/getResults/:studentId", authMiddleWare, async (req, res) => {
  const { studentId } = req.params;
  try {
    const results = await Result.find({ student: studentId }).populate(
      "course",
      "title",
    );
    res.json({ results, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/studentStats/:courseId", authMiddleWare, async (req, res) => {
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
    })
      .select("dateOfExam marksObtained totalMarks remarks")
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

router.put("/updateResult/:resultId", authMiddleWare, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      success: false,
      message: "Only teachers can update results",
    });
  }
  const { resultId } = req.params;
  const { marksObtained, totalMarks, remarks, date } = req.body;
  if (
    marksObtained == null ||
    totalMarks == null ||
    !date
  ) {
    return res
      .status(400)
      .json({
        message: "Marks obtained, total marks, and date are required",
        success: false,
      });
  } 
  try {
    const result = await Result.findById(resultId);
    if (!result) {
      return res
        .status(404)
        .json({ message: "Result not found", success: false });
    }
    result.marksObtained = marksObtained;
    result.totalMarks = totalMarks;
    result.remarks = remarks;
    result.date = date;
    await result.save();
    res.json({ message: "Result updated successfully", success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


router.get("/getResultsByClass", authMiddleWare, async (req, res) => {
  if (req.user.role !== "teacher") {
    return res.status(403).json({
      success: false,
      message: "Only teachers can view results by class",
    });
  }
  try {
    const { courseId, classInfo, date } = req.query;

    if (!courseId || !classInfo || !date) {
      return res.status(400).json({
        success: false,
        message: "courseId, classInfo, and date are all required.",
      });
    }

    // Step 1: find which students are registered in this course + class
    const registrations = await Registration.find({
      "aboutCourse.course": courseId,
      classInfo: classInfo,
    }).select("student");

    const studentIds = registrations.map((r) => r.student);

    if (!studentIds.length) {
      return res.status(200).json({ success: true, results: [] });
    }

    // Step 2: build a day range for dateOfExam (stored as a real Date)
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    // Step 3: find results for those students, this course, that date
    const results = await Result.find({
      course: courseId,
      student: { $in: studentIds },
      dateOfExam: { $gte: startOfDay, $lte: endOfDay },
    }).populate("student", "name rollNumber email");

    // Step 4: flatten for the frontend
    const flattened = results.map((r) => ({
      _id: r._id,
      studentId: r.student?._id,
      name: r.student?.name,
      rollNumber: r.student?.rollNumber,
      email: r.student?.email,
      marksObtained: r.marksObtained,
      totalMarks: r.totalMarks,
      dateOfExam: r.dateOfExam,
      remarks: r.remarks,
    }));

    return res.status(200).json({ success: true, results: flattened });
  } catch (error) {
    console.error("Error fetching results by class:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


router.put("/updateRegistration", authMiddleWare, async (req, res) => {
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
    const registration = await Registration.findById(registrationId);
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

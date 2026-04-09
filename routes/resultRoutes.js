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

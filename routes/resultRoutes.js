const express = require("express");
const router = express.Router();
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const Result = require("../modals/Result");
const authMiddleWare = require("../authMiddleWare");

router.post("/submitResult", authMiddleWare, async (req, res) => {
  const { studentId, courseId, marksObtained, dateOfExam, totalMarks, remarks } = req.body;
    if (!studentId || !courseId || marksObtained == null || !dateOfExam || totalMarks == null) {
    return res.status(400).json({ message: "All fields except grade and remarks are required", success: false });
  }
    try {    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found", success: false });
    }
    const newResult = new Result({
      student: studentId,
      course: courseId,
         marksObtained,
        dateOfExam,
        totalMarks,
        remarks,
    });
    await newResult.save();
    res.json({ message: "Result submitted successfully", success: true });
  }
    catch (error) { 
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/getResults/:studentId", authMiddleWare, async (req, res) => {
  const { studentId } = req.params;
  try {
    const results = await Result.find({ student: studentId }).populate("course", "courseName");
    res.json({ results, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/updateRegistration", authMiddleWare, async (req, res) => { 
    const { registrationId, courseId } = req.body;
    if (!registrationId || !courseId) {
        return res.status(400).json({ message: "Registration ID and Course ID are required", success: false });
    }
    try {
        const registration = await Registration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({ message: "Registration not found", success: false });
        }
        registration.course = courseId;
        await registration.save();
        res.json({ message: "Registration updated successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: "Server error", success: false });
    }
});

module.exports = router;
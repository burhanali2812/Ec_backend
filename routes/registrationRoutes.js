const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const Student = require("../modals/Student");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/register", authMiddleWare, async (req, res) => {
  const { courseIds = [], institutionType, classInfo, studentId } = req.body;
  if (!courseIds.length || !institutionType || !classInfo || !studentId) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // 1. Create the registration entry
    const registrations = await Promise.all(
      courseIds.map((courseId) => {
        const newRegistration = new Registration({
            course: courseId,
            student: req.user.id,
            institutionType,
            classInfo,
            student: studentId
        });
        return newRegistration.save();
      }),
    );
    res.status(201).json({ message: "Registration successful!", success: true, registrations });

  } catch (error) {
    res.status(500).json({ message: "Error occurred while registering" });
  }
});

router.get("/myCourses", authMiddleWare, async (req, res) => {
  try {
    const registrations = await Registration.find({ student: req.user.id }).populate("course");
    const courses = registrations.map((reg) => reg.course);
    res.json({ courses, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/allRegistrations", authMiddleWare, async (req, res) => {
  try {
    const registrations = await Registration.find()
      .populate("course")
      .populate("student", "name email rollNumber classInfo");
    res.json({ registrations, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
    }
});

module.exports = router;
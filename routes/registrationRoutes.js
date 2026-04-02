const express = require("express");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/register", authMiddleWare, async (req, res) => {
  const {
    courseIds = [],
    courses = [],
    institutionType,
    classInfo,
    studentId,
  } = req.body;

  const selectedCourseIds = [
    ...new Set(
      [
        ...(Array.isArray(courseIds) ? courseIds : []),
        ...(Array.isArray(courses) ? courses : []),
      ].map(String),
    ),
  ];

  if (
    !selectedCourseIds.length ||
    !institutionType ||
    !classInfo ||
    !studentId
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const registration = await Registration.findOneAndUpdate(
      { student: studentId },
      {
        course: selectedCourseIds,
        student: studentId,
        institutionType,
        classInfo,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({
      message: "Registration saved successfully!",
      success: true,
      registration,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error occurred while registering", success: false });
  }
});

router.get(
  "/getStudentCourses/:studentId",
  authMiddleWare,
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const registration = await Registration.findOne({
        student: studentId,
      }).populate("course", "title description");

      if (!registration) {
        return res.json({ success: true, courses: [] });
      }

      return res.json({ success: true, courses: registration.course || [] });
    } catch (error) {
      return res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/myCourses", authMiddleWare, async (req, res) => {
  try {
    const registrations = await Registration.find({
      student: req.user.id,
    }).populate("course");
    const courses = registrations.flatMap((reg) => reg.course || []);
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

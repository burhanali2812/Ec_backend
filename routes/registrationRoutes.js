const express = require("express");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/register", authMiddleWare, async (req, res) => {
    if(req.user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized, You cannot register students" , success: false });
    }
  const {
    courseIds = [],
    courses = [],
    aboutCourse = [],
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
    const courseDocs = await Course.find(
      { _id: { $in: selectedCourseIds } },
      "_id coursePrice",
    );

    const priceMap = courseDocs.reduce((acc, c) => {
      acc[String(c._id)] = Number(c.coursePrice || 0);
      return acc;
    }, {});

    const discountedPriceMap = Array.isArray(aboutCourse)
      ? aboutCourse.reduce((acc, item) => {
          const courseId = String(item?.course || item?.courseId || "");
          if (!courseId) return acc;
          acc[courseId] = Number(
            item?.courseDiscountedPrice ?? item?.discountedPrice,
          );
          return acc;
        }, {})
      : {};

    const aboutCoursePayload = selectedCourseIds.map((courseId) => {
      const actual = Number(priceMap[courseId] || 0);
      const providedDiscount = discountedPriceMap[courseId];
      const discounted = Number.isFinite(providedDiscount)
        ? providedDiscount
        : actual;

      return {
        course: courseId,
        courseActualPrice: actual,
        courseDiscountedPrice: discounted,
      };
    });

    const registration = await Registration.findOneAndUpdate(
      { student: studentId },
      {
        aboutCourse: aboutCoursePayload,
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
      }).populate("aboutCourse.course", "title description coursePrice");

      if (!registration) {
        return res.json({ success: true, courses: [], aboutCourse: [] });
      }

      const courses = (registration.aboutCourse || [])
        .map((item) => item.course)
        .filter(Boolean);

      return res.json({
        success: true,
        courses,
        aboutCourse: registration.aboutCourse || [],
      });
    } catch (error) {
      return res.status(500).json({ message: "Server error", success: false });
    }
  },
);

router.get("/myCourses", authMiddleWare, async (req, res) => {
  try {
    const registrations = await Registration.find({
      student: req.user.id,
    }).populate({
      path: "aboutCourse.course", // First level: Get course details
      populate: {
        path: "assignments.teacher", // Second level: Get teacher details inside course
        select: "name email", // Only grab the name and email of the teacher
      },
    });

    // Extract the courses and ensure teacher info is included
    const courses = registrations.flatMap((reg) =>
      (reg.aboutCourse || []).map((item) => item.course).filter(Boolean)
    );

    res.json({ courses, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/allRegistrations", authMiddleWare, async (req, res) => {
  try {
    const registrations = await Registration.find()
      .populate("aboutCourse.course")
      .populate("student", "name email rollNumber classInfo");
    res.json({ registrations, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

module.exports = router;

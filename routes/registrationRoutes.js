const express = require("express");
const Course = require("../modals/Course");
const Registration = require("../modals/Registration");
const Student = require("../modals/Student");
const authMiddleWare = require("../authMiddleWare");
const Class = require("../modals/Class");
const router = express.Router();

const requireInstitution = (req, res, next) => {
  if (!req.user || !req.user.institution) {
    return res.status(403).json({
      message: "Institution missing from your session. Please log in again.",
      success: false,
    });
  }
  next();
};

router.post("/register", authMiddleWare, requireInstitution, async (req, res) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Unauthorized, You cannot register students", success: false });
  }

  const {
    courseIds = [],
    courses = [],
    aboutCourse = [],
    classInfo,
    studentId,
  } = req.body;
  // NOTE: institutionType is no longer read from the body - the
  // institution comes from the admin's session (req.user.institution).
  // Previously it was destructured but never actually saved (Registration
  // has no institutionType field), so the "institution" field required by
  // the schema was silently never set on new registrations.

  const selectedCourseIds = [
    ...new Set(
      [
        ...(Array.isArray(courseIds) ? courseIds : []),
        ...(Array.isArray(courses) ? courses : []),
      ].map(String),
    ),
  ];

  if (!selectedCourseIds.length || !classInfo || !studentId) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Confirm the student is actually enrolled at THIS institution.
    // A student can be enrolled at more than one institution now, so this
    // check is required - without it an admin at School could register
    // courses for a student who only exists at Academy.
    const studentEnrolled = await Student.exists({
      _id: studentId,
      "enrollments.institution": req.user.institution,
    });
    if (!studentEnrolled) {
      return res.status(404).json({
        message: "Student is not enrolled at this institution",
        success: false,
      });
    }

    // Only allow courses that belong to this institution, so an admin at
    // School can't register a student into an Academy-only course.
    const courseDocs = await Course.find(
      { _id: { $in: selectedCourseIds }, institution: req.user.institution },
      "_id coursePrice",
    );

    if (courseDocs.length !== selectedCourseIds.length) {
      return res.status(400).json({
        message: "One or more selected courses do not belong to this institution",
        success: false,
      });
    }

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

    // Scoped by { student, institution } instead of just { student } -
    // this is the actual fix. Before, a second registration at a
    // different institution would silently overwrite the first one,
    // since the filter matched on student alone.
    const registration = await Registration.findOneAndUpdate(
      { student: studentId, institution: req.user.institution },
      {
        aboutCourse: aboutCoursePayload,
        student: studentId,
        institution: req.user.institution,
        classInfo,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );

    res.status(200).json({
      message: "Registration saved successfully!",
      success: true,
      registration,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error occurred while registering", success: false, error: error.message });
  }
});

// Admin-facing: get one student's courses AT THIS INSTITUTION.
router.get(
  "/getStudentCourses/:studentId",
  authMiddleWare,
  requireInstitution,
  async (req, res) => {
    try {
      const { studentId } = req.params;
      const registration = await Registration.findOne({
        student: studentId,
        institution: req.user.institution,
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

// Student-facing: only the courses for the institution they're currently
// logged into. A student enrolled at both School and Academy will see
// different courses depending on which one they logged in as.
router.get("/myCourses", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const registrations = await Registration.find({
      student: req.user.id,
      institution: req.user.institution,
    }).populate({
      path: "aboutCourse.course",
      populate: {
        path: "assignments.teacher",
        select: "name email",
      },
    });

    const courses = registrations.flatMap((reg) =>
      (reg.aboutCourse || []).map((item) => item.course).filter(Boolean),
    );

    res.json({ courses, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/allRegistrations", authMiddleWare, requireInstitution, async (req, res) => {
  try {
    const registrations = await Registration.find({
      institution: req.user.institution,
    })
      .populate("aboutCourse.course")
      .populate("student", "name email");
    // Roll number and class now live on the student's enrollments array,
    // not as top-level fields, so they aren't included by this populate.
    // If the frontend needs them here, look up the matching enrollment
    // (enrollments.find(e => e.institution === req.user.institution))
    // client-side, the same way studentRoutes.shapeStudent does server-side.
    res.json({ registrations, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

// router.post("/migrateRegistrationClassInfo", async (req, res) => {
//   try {
//     const registrations = await Registration.collection.find({}).toArray();
//     const classes = await Class.collection.find({}).toArray();

//     const result = [];
//     let updated = 0;
//     let notFound = 0;

//     for (const registration of registrations) {
//       const className = String(registration.classInfo || "").trim();

//       const matchedClass = classes.find(
//         (cls) => cls.name.trim().toLowerCase() === className.toLowerCase(),
//       );

//       if (!matchedClass) {
//         notFound++;
//         result.push({
//           registrationId: registration._id,
//           student: registration.student,
//           currentClass: registration.classInfo,
//           status: "Class Not Found",
//         });
//         continue;
//       }

//       await Registration.collection.updateOne(
//         { _id: registration._id },
//         { $set: { classInfo: matchedClass._id } },
//       );

//       updated++;
//       result.push({
//         registrationId: registration._id,
//         student: registration.student,
//         oldClassInfo: registration.classInfo,
//         newClassInfo: matchedClass._id,
//         status: "Updated",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Registration class migration completed.",
//       totalRegistrations: registrations.length,
//       updated,
//       notFound,
//       data: result,
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       success: false,
//       message: "Migration failed.",
//       error: error.message,
//     });
//   }
// });

module.exports = router;
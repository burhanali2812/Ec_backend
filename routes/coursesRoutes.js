const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

const normalizeAssignments = (
  payloadAssignments = [],
  fallbackClassTarget = [],
) => {
  const source =
    Array.isArray(payloadAssignments) && payloadAssignments.length
      ? payloadAssignments
      : fallbackClassTarget;

  return (Array.isArray(source) ? source : [])
    .map((item) => {
      const teacher = String(
        item?.teacher?._id || item?.teacher || item?.teacherId || "",
      ).trim();
      const targetClasses = Array.isArray(item?.targetClasses)
        ? item.targetClasses
        : Array.isArray(item?.classes)
          ? item.classes
          : [];

      return {
        teacher,
        targetClasses: [
          ...new Set(
            targetClasses.map((cls) => String(cls).trim()).filter(Boolean),
          ),
        ],
      };
    })
    .filter((item) => item.teacher && item.targetClasses.length);
};

const getAssignmentTeacherIds = (assignments = []) => [
  ...new Set(
    (assignments || []).map((item) => String(item.teacher)).filter(Boolean),
  ),
];

router.post("/addCourse", authMiddleWare, async (req, res) => {
  const {
    title,
    description,
    coursePrice = 0,
    assignments = [],
    classTarget = [],
  } = req.body;

  try {
    const normalizedAssignments = normalizeAssignments(
      assignments,
      classTarget,
    );
    const teacherIds = getAssignmentTeacherIds(normalizedAssignments);

    const newCourse = new Course({
      title,
      description,
      coursePrice: Number(coursePrice) || 0,
      assignments: normalizedAssignments,
    });
    const savedCourse = await newCourse.save();

    if (teacherIds.length) {
      await Teacher.updateMany(
        { _id: { $in: teacherIds } },
        { $addToSet: { courses: savedCourse._id } },
      );
    }

    res.status(201).json({
      message: "Course created and linked to teachers!",
      success: true,
      course: savedCourse,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error linking course", error, success: false });
  }
});

router.get("/myCourses", authMiddleWare, async (req, res) => {
  try {
    const courses = await Course.find({
      "assignments.teacher": req.user.id,
    }).populate("assignments.teacher", "name email");
    res.json({ courses, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/allCourses", authMiddleWare, async (req, res) => {
  try {
    const courses = await Course.find().populate(
      "assignments.teacher",
      "name email",
    );
    res.json({ courses, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/updateCourse/:id", authMiddleWare, async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    coursePrice = 0,
    assignments = [],
    classTarget = [],
  } = req.body;

  try {
    const existingCourse = await Course.findById(id);
    if (!existingCourse) {
      return res
        .status(404)
        .json({ message: "Course not found", success: false });
    }

    const normalizedAssignments = normalizeAssignments(
      assignments,
      classTarget,
    );
    const previousTeacherIds = getAssignmentTeacherIds(
      existingCourse.assignments || [],
    );
    const nextTeacherIds = getAssignmentTeacherIds(normalizedAssignments);

    existingCourse.title = title;
    existingCourse.description = description;
    existingCourse.coursePrice = Number(coursePrice) || 0;
    existingCourse.assignments = normalizedAssignments;
    await existingCourse.save();

    const removedTeacherIds = previousTeacherIds.filter(
      (teacherId) => !nextTeacherIds.includes(teacherId),
    );
    const addedTeacherIds = nextTeacherIds.filter(
      (teacherId) => !previousTeacherIds.includes(teacherId),
    );

    if (removedTeacherIds.length) {
      await Teacher.updateMany(
        { _id: { $in: removedTeacherIds } },
        { $pull: { courses: existingCourse._id } },
      );
    }

    if (addedTeacherIds.length) {
      await Teacher.updateMany(
        { _id: { $in: addedTeacherIds } },
        { $addToSet: { courses: existingCourse._id } },
      );
    }

    return res.json({
      message: "Course updated successfully",
      success: true,
      course: existingCourse,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating course", success: false, error });
  }
});

router.delete("/deleteCourse/:id", authMiddleWare, async (req, res) => {
  const { id } = req.params;

  try {
    const course = await Course.findById(id);
    if (!course) {
      return res
        .status(404)
        .json({ message: "Course not found", success: false });
    }

    const teacherIds = getAssignmentTeacherIds(course.assignments || []);

    if (teacherIds.length) {
      await Teacher.updateMany(
        { _id: { $in: teacherIds } },
        { $pull: { courses: course._id } },
      );
    }

    await Course.findByIdAndDelete(id);

    return res.json({ message: "Course deleted successfully", success: true });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error deleting course", success: false, error });
  }
});
module.exports = router;

const express = require("express");
const Teacher = require("../modals/Teacher");
const Course = require("../modals/Course");
const authMiddleWare = require("../authMiddleWare");
const router = express.Router();

router.post("/addCourse", async (req, res) => {
  const { title, description, teacherIds = [], classTarget = [] } = req.body;

  try {
    // 1. Create the new course
    const newCourse = new Course({
      title,
      description,
      teachers: teacherIds, // Assigning the array of teacher IDs
      classTarget,
    });
    const savedCourse = await newCourse.save();

    // 2. THE LINK: Update all selected teachers to include this course ID
    await Teacher.updateMany(
      { _id: { $in: teacherIds } },
      { $push: { courses: savedCourse._id } },
    );

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
    const courses = await Course.find({ teachers: req.user.id }).populate(
      "teachers",
      "name email",
    );
    res.json({ courses, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.get("/allCourses", authMiddleWare, async (req, res) => {
  try {
    const courses = await Course.find()
      .populate("teachers", "name email")
      .populate("classTarget.teacher", "name email");
    res.json({ courses, success: true });
  } catch (error) {
    res.status(500).json({ message: "Server error", success: false });
  }
});

router.put("/updateCourse/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, teacherIds = [], classTarget = [] } = req.body;

  try {
    const existingCourse = await Course.findById(id);
    if (!existingCourse) {
      return res
        .status(404)
        .json({ message: "Course not found", success: false });
    }

    const previousTeacherIds = (existingCourse.teachers || []).map((t) =>
      String(t),
    );
    const nextTeacherIds = [
      ...new Set((teacherIds || []).map((t) => String(t))),
    ];

    existingCourse.title = title;
    existingCourse.description = description;
    existingCourse.teachers = nextTeacherIds;
    existingCourse.classTarget = classTarget;
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

router.delete("/deleteCourse/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const course = await Course.findById(id);
    if (!course) {
      return res
        .status(404)
        .json({ message: "Course not found", success: false });
    }

    await Teacher.updateMany(
      { _id: { $in: course.teachers || [] } },
      { $pull: { courses: course._id } },
    );

    await Course.findByIdAndDelete(id);

    return res.json({ message: "Course deleted successfully", success: true });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error deleting course", success: false, error });
  }
});
module.exports = router;

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Notification = require("../models/Notification");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const Class = require("../models/Class");

// Your authentication middleware
const authMiddleware = require("../middleware/authMiddleware");

/*
Allowed Audiences
------------------
AllStudents
AllTeachers
SpecificStudents
SpecificTeachers
Class
Course
*/

router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      audience,
      students,
      teachers,
      classInfo,
      course,
      referenceId,
      referenceModel,
      publishAt,
      expiresAt,
    } = req.body;

    // ---------------- Validation ----------------

    if (!title || !message || !audience) {
      return res.status(400).json({
        success: false,
        message: "Title, message and audience are required.",
      });
    }

    // Optional: Only Admin & Teacher can create notifications
    if (!["Admin", "Teacher"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    // ---------------- Audience Validation ----------------

    switch (audience) {
      case "SpecificStudents":
        if (!students || students.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Please provide students.",
          });
        }

        const studentCount = await Student.countDocuments({
          _id: { $in: students },
        });

        if (studentCount !== students.length) {
          return res.status(400).json({
            success: false,
            message: "One or more students do not exist.",
          });
        }

        break;

      case "SpecificTeachers":
        if (!teachers || teachers.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Please provide teachers.",
          });
        }

        const teacherCount = await Teacher.countDocuments({
          _id: { $in: teachers },
        });

        if (teacherCount !== teachers.length) {
          return res.status(400).json({
            success: false,
            message: "One or more teachers do not exist.",
          });
        }

        break;

      case "Class":
        if (!classInfo) {
          return res.status(400).json({
            success: false,
            message: "classInfo is required.",
          });
        }

        const classExists = await Class.findById(classInfo);

        if (!classExists) {
          return res.status(404).json({
            success: false,
            message: "Class not found.",
          });
        }

        break;

      case "Course":
        if (!course) {
          return res.status(400).json({
            success: false,
            message: "course is required.",
          });
        }

        const courseExists = await Course.findById(course);

        if (!courseExists) {
          return res.status(404).json({
            success: false,
            message: "Course not found.",
          });
        }

        break;

      case "AllStudents":
      case "AllTeachers":
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid audience.",
        });
    }

    // ---------------- Create Notification ----------------

    const notification = await Notification.create({
      sender: {
        id: req.user.id,
        role: req.user.role,
      },

      title,
      message,
      type,

      audience,

      students: students || [],
      teachers: teachers || [],

      classInfo: classInfo || null,
      course: course || null,

      referenceId: referenceId || null,
      referenceModel: referenceModel || null,

      publishAt: publishAt || new Date(),
      expiresAt: expiresAt || null,
    });

    return res.status(201).json({
      success: true,
      message: "Notification created successfully.",
      notification,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
});

module.exports = router;
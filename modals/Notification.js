const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Who created the notification
    sender: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "sender.role",
      },
      role: {
        type: String,
        enum: ["Admin", "Teacher"],
        required: true,
      },
    },

    // Notification title
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Notification message
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Notification category
    type: {
      type: String,
      enum: [
        "Announcement",
        "Result",
        "Assignment",
        "Attendance",
        "Fee",
        "General",
      ],
      default: "General",
    },

    // Who should receive it
    audience: {
      type: String,
      enum: [
        "AllStudents",
        "AllTeachers",
        "SpecificStudents",
        "SpecificTeachers",
        "Class",
        "Course",
      ],
      required: true,
    },

    // Target students
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],

    // Target teachers
    teachers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
      },
    ],

    // Target class
    classInfo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      default: null,
    },

    // Target course
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },

    // Related document (marks, assignment etc.)
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    referenceModel: {
      type: String,
      enum: [
        "Result",
        "Assignment",
        "Attendance",
        "Registration",
      ],
      default: null,
    },

    // Schedule notification
    publishAt: {
      type: Date,
      default: Date.now,
    },

    // Expiry
    expiresAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
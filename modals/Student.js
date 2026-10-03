const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },

  // One student = one real person = one record. Unique globally, since
  // there is now only ever one document per person.
  email: { type: String, required: true, unique: true },

  address: { type: String, required: true },
  contact: { type: String, required: true },
  gender: { type: String, enum: ["Female", "Male"], required: true },
  fatherName: { type: String, required: true },
  fatherContact: { type: String },

  password: { type: String, required: true }, // shared login password across every institution
  profileImage: { type: String, default: null },
  fcmTokens: {
    type: [String],
    default: [],
  },
  isPasswordChanged: {
    type: Boolean,
    default: false,
  },
  securityQuestion: {
    type: String,
    default: "",
  },
  securityAnswer: {
    type: String,
    default: "",
  },
  isSecuritySet: {
    type: Boolean,
    default: false,
  },

  // One entry per institution this student is enrolled at (e.g. both
  // School and Academy at once), each with its own class and roll number.
  enrollments: {
    type: [
      {
        institution: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Institution",
          required: true,
        },
        classInfo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Class",
          required: true,
        },
        rollNumber: { type: String, required: true },
        isActive: { type: Boolean, default: true },
      },
    ],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length > 0,
      message: "A student must have at least one enrollment",
    },
  },

  createdAt: { type: Date, default: Date.now },
});

// Roll numbers are unique across every enrollment, for every student.
studentSchema.index({ "enrollments.rollNumber": 1 }, { unique: true });

module.exports = mongoose.model("Student", studentSchema);
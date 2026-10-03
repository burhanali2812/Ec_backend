const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },

  // One teacher = one real person = one record. Email and CNIC are unique
  // globally again, since there is now only ever one document per teacher.
  email: { type: String, required: true, unique: true },
  cnic: { type: String, required: true, unique: true },

  password: { type: String, required: true }, // shared across every institution

  address: { type: String, required: true },

  // Every institution this teacher currently belongs to.
  institutions: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Institution" }],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length > 0,
      message: "A teacher must belong to at least one institution",
    },
  },

  // Salary can differ by institution.
  salaryByInstitution: [
    {
      institution: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Institution",
        required: true,
      },
      salary: { type: Number, required: true },
    },
  ],

  courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
  profileImage: { type: String, default: null },
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
  fcmTokens: {
    type: [String],
    default: [],
  },
  isSecuritySet: {
    type: Boolean,
    default: false,
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Teacher", teacherSchema);
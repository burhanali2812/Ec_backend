const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    aboutCourse: [
      {
        course: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },
        courseActualPrice: { type: Number, required: true },
        courseDiscountedPrice: { type: Number, required: true },
      },
    ],
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    institutionType: {
      type: String,
      enum: ["Academy", "School"],
      required: true,
    },
    classInfo: { type: String, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Registration", registrationSchema);

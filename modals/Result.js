const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    marksObtained: { type: Number, required: true },
    dateOfExam: { type: Date, required: true },
    totalMarks: { type: Number, required: true },
    remarks: { type: String },
  },
  { timestamps: true },
);

resultSchema.index({ student: 1, course: 1, dateOfExam: 1 }, { unique: true });

module.exports = mongoose.model("Result", resultSchema);

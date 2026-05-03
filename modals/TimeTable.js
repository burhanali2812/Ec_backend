const mongoose = require("mongoose");

const timeTableSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    classInfo: { type: String,
      enum: ["Pre-9th", "9th", "10th", "11th", "12th"],
      required: true },
      
    dayOfWeek: {
      type: String,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      required: true,
    },
    startTime: { type: String, required: true }, // Format: "HH:mm"
    endTime: { type: String, required: true }, // Format: "HH:mm"
  },
  { timestamps: true },
);

module.exports = mongoose.model("TimeTable", timeTableSchema);

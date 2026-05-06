const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  registration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Registration",
    required: true,
  },

  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },


  date: {
    type: Date,
    required: true,
  },

  topic: {
    type: String,
    required: true,
  },

  status: {
    type: String,
    enum: ["present", "absent"],
    required: true,
  },

  percentage: {
    type: Number,
    default: 0,
  },
  classInfo: {
    type: String,
    enum: ["9th", "10th", "11th", "12th", "pre-9th"],
    required: true,
  },



  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Teacher",
    required: true,
  },
});


attendanceSchema.index(
  { registration: 1, course: 1, date: 1 },
  { unique: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
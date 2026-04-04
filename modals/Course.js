const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  coursePrice: { type: Number, default: 0, required: true },
  
  assignments: [
    {
      teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true,
      },
      // This tells us which classes THIS teacher handles for THIS course
      targetClasses: [{ type: String, required: true }], // e.g., ["9th", "10th"]
    },
  ],
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Course", courseSchema);
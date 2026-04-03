const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],
  coursePrice: { type: Number, default: 0, required: true },
  classTarget: [
    {
      teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true,
      },
      classes: [{ type: String, required: true }],
    },
  ],
});

module.exports = mongoose.model("Course", courseSchema);

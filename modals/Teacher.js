const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },
  email: { type: String, unique: true },
  cnic: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  address: { type: String, required: true },
  institutionType: { type: String, enum: ["academy", "school"], required: true, default: "academy" },
  courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
  profileImage: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Teacher", teacherSchema);

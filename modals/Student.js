const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true },
  address: { type: String, required: true },
  contact: { type: String, required: true },
  gender: { type: String, enum: ['female', 'male'], required: true },
  profileImage: { type: String, default: null }, 
  rollNumber: { type: String, required: true, unique: true },
  class: { type: String, required: true },
  fatherName: { type: String, required: true },
  fatherContact: { type: String },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Student", studentSchema);

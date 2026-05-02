const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true },
  address: { type: String, required: true },
  contact: { type: String, required: true },
  gender: { type: String, enum: ['Female', 'Male'], required: true },
  institutionType: { type: String, enum: ["Academy", "School"], required: true },
  profileImage: { type: String, default: null }, 
  rollNumber: { type: String, required: true, unique: true },
  classInfo: { type: String, required: true },
  fatherName: { type: String, required: true },
  fatherContact: { type: String },
  password: { type: String, required: true },
  isPasswordChanged: {
  type: Boolean,
  default: false
},
securityQuestion: {
  type: String,
  default: ""
},
securityAnswer: {
  type: String,
  default: ""
},
isSecuritySet: {
  type: Boolean,
  default: false
},
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Student", studentSchema);

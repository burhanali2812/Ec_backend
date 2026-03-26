
const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema({
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    classInfo: { type: String, required: true },
})

module.exports = mongoose.model("Registration", registrationSchema);
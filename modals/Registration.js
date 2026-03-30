
const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema({
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    institutionType: { type: String, enum: ["Academy", "School"], required: true },
    classInfo: { type: String, required: true },
})

module.exports = mongoose.model("Registration", registrationSchema);
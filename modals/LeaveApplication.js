const mongoose = require("mongoose");

const leaveApplicationSchema = new mongoose.Schema({
    applicant : { type: String, enum: ["Student", "Teacher"], required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" }, // Reference to student if applicant is Student
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }, // Reference to teacher if applicant is Teacher
    name: { type: String, required: true },
    email: { type: String, required: true },
    reason: { type: String, required: true },
    rejectedReason: { type: String },
    fromDate: { type: String, required: true }, // e.g., "2024-07-01"
    toDate: { type: String, required: true }, // e.g., "2024-07-05"
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    appliedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("LeaveApplication", leaveApplicationSchema);
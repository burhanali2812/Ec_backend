const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true }, // NEW
    date: { type: Date, required: true },
    status: { type: String, enum: ["present", "absent"], required: true },
    verificationStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
});

attendanceSchema.index({ registration: 1, course: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
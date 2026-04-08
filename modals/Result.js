import mongoose from "mongoose";

const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    marksObtained: { type: Number, required: true },
    dateOfExam: { type: Date, required: true },
    totalMarks: { type: Number, required: true },
    grade: { type: String, required: true },
    remarks: { type: String },
}, { timestamps: true });
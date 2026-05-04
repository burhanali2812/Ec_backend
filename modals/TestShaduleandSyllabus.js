const mongoose = require("mongoose");

const testScheduleAndSyllabusSchema = new mongoose.Schema(
    {
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },
        classInfo: {
            type: String,
            enum: ["Pre-9th", "9th", "10th", "11th", "12th"],
            required: true,
        },
        syllabus: {
            type: String,
        },
        testDay: {
            type: String,
            enum: [
                "Monday",
                "Tuesday",
                "Wednesday",    
                "Thursday",
                "Friday",
                "Saturday",
            ],
            required: true,
        },
        syllabusUpdatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);
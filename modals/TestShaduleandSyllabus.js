const mongoose = require("mongoose");

const testScheduleAndSyllabusSchema = new mongoose.Schema(
    {
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },
        classInfo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            required: true,
        },
        syllabus: {
            type: String,
        },
        title: {
            type: String,
            required: true,
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
        testDate: {
            type: Date,
            required: true,
        },
        syllabusUpdatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);
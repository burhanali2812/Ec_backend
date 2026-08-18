const mongoose = require("mongoose");

const schedules = new mongoose.Schema(
    {
        course: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },
         syllabus: {
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
        

    }
)

const testScheduleAndSyllabusSchema = new mongoose.Schema(
    {
        classInfo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            required: true,
        },
       
        title: {
            type: String,
            required: true,
        },
        schedules: [schedules],
          syllabusUpdatedAt: {
            type: Date,
            default: Date.now,
        },
       
      
    },
    { timestamps: true }
);

const TestShaduleandSyllabus = mongoose.model(
    "TestShaduleandSyllabus",
    testScheduleAndSyllabusSchema
);

module.exports = TestShaduleandSyllabus;
const mongoose = require("mongoose");

const teacherReviewSchema = new mongoose.Schema({

    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true
    },

    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },

    teachingStyleRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    behaviourRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    communicationRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    punctualityRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    knowledgeRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    isSeenByAdmin:{
        type: Boolean,
        default: false
    },

    comment: {
        type: String,
        required: true,
        trim: true
    }

}, { timestamps: true });

module.exports = mongoose.model("TeacherReview", teacherReviewSchema);
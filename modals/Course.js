const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
    title: {type: String, required: true},
    description: {type: String, required: true},
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true }
})

module.exports = mongoose.model("Course", courseSchema)
const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
     institution: {type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true},
     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Class", classSchema);
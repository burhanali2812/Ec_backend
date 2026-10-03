const mongoose = require("mongoose");

const institutionSchema = new mongoose.Schema({
    name: {type: String, required: true},
    address: {type: String, required: true},
    superAdmin: {type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", required: true},
    contactNumber: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    type: {type: String, required: true, enum: ["School", "College", "University", "Academy", "Other"]},
    logoUrl: {type: String, required: false},
    websiteUrl: {type: String, required: false},
    createdAt: {type: Date, default: Date.now},
});

module.exports = mongoose.model("Institution", institutionSchema);
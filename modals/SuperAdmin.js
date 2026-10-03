const mongoose = require("mongoose");

const superAdminSchema = new mongoose.Schema({
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    firstName: {type: String, required: true},
    lastName: {type: String, required: true},
    fcmTokens: {
        type: [String],
        default: [],
    },
});

module.exports = mongoose.model("SuperAdmin", superAdminSchema);
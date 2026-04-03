const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g., "Academy" or "School"
  seq: { type: Number, default: 10000 } // Starting point
});

module.exports = mongoose.model("Counter", counterSchema);
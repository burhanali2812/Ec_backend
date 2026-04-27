const mongoose = require("mongoose");

const studentFeeSchema = new mongoose.Schema(
  {
    registration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Registration",
      required: true,
    },

    month: {
      type: String,
      required: true,
    },

    actualFee: {
      type: Number,
      required: true,
    },

    discount: {
      type: Number,
      default: 0,
    },

    finalFee: {
      type: Number,
      required: true,
    },

    amountPaid: {
      type: Number,
      default: 0,
    },

    remainingFee: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["paid", "partial", "unpaid"],
      default: "unpaid",
    },

    dueDate: {
      type: Date,
      required: true,
    },

    paidAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("StudentFee", studentFeeSchema);

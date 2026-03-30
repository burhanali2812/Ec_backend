const mongoose = require("mongoose");

const studentFeeSchema = new mongoose.Schema({
    registration: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "Registration", 
        required: true 
    },

    month: { 
        type: String, 
        required: true // e.g. "2026-03"
    },

    actualFee: { 
        type: Number, 
        required: true // 2000 or 8000
    },

    discount: { 
        type: Number, 
        default: 0 
    },

    finalFee: { 
        type: Number, 
        required: true // actualFee - discount
    },

    amountPaid: { 
        type: Number, 
        default: 0 
    },

    remainingFee: { 
        type: Number, 
        required: true 
    },

    status: { 
        type: String, 
        enum: ["paid", "partial", "unpaid"], 
        default: "unpaid" 
    },

    paidAt: Date
});

module.exports = mongoose.model("StudentFee", studentFeeSchema);
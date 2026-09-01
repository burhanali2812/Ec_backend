const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema(
  {
    questionType: {
      type: String,
      enum: ["MCQ", "Short", "Long"],
      required: true,
    },
    questionText: { type: String, required: true, trim: true },

    // Only relevant for MCQ
    options: {
      type: [
        {
          text: { type: String, required: true },
          isCorrect: { type: Boolean, default: false },
        },
      ],
      default: undefined,
      validate: {
        validator: function (opts) {
          if (this.questionType !== "MCQ") return true;
          return Array.isArray(opts) && opts.length >= 2;
        },
        message: "MCQ questions need at least 2 options.",
      },
    },

    // Optional model answer for Short/Long (not required, just a teacher note/rubric)
    modelAnswer: { type: String },

    marks: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const TestGeneratorSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    classInfoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassInfo",
      required: true,
      index: true,
    },

    // Reflects your 3-step choice
    paperType: {
      type: String,
      enum: ["MCQ_ONLY", "MCQ_SHORT", "MCQ_SHORT_LONG"],
      required: true,
    },

    // Captured at the "marks distribution" step, BEFORE questions are entered.
    // Lets the UI know how many slots to render and lets you validate totals.
    distribution: {
      mcq: {
        count: { type: Number, default: 0 },
        marksEach: { type: Number, default: 0 },
      },
      short: {
        count: { type: Number, default: 0 },
        marksEach: { type: Number, default: 0 },
      },
      long: {
        count: { type: Number, default: 0 },
        marksEach: { type: Number, default: 0 },
      },
    },

    questions: [QuestionSchema],

    totalMarks: { type: Number, required: true },

    duration: { type: Number, required: true }, // minutes

    status: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Enforce sum(question marks) === totalMarks only when finalizing
TestGeneratorSchema.pre("validate", function (next) {
  if (this.status === "finalized" && this.questions.length > 0) {
    const sum = this.questions.reduce((acc, q) => acc + (q.marks || 0), 0);
    if (sum !== this.totalMarks) {
      return next(
        new Error(
          `Question marks (${sum}) don't match totalMarks (${this.totalMarks}).`
        )
      );
    }
  }
  next();
});

module.exports = mongoose.model("TestGenerator", TestGeneratorSchema);
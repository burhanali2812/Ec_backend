const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const TestGenerator = require("../modals/TestGenerator");
const Course = require("../modals/Course");
const ClassInfo = require("../modals/ClassInfo"); // adjust name/path if it's actually "Class"
const authMiddleWare = require("../authMiddleWare");

/**
 * All routes assume authMiddleWare attaches req.user = { id, role, ... }
 * and that req.user.id is the teacher's User _id.
 * Adjust `createdBy: req.user.id` if your auth payload differs.
 */

// ---------------------------------------------------------------------------
// STEP 0: Get courses belonging to the logged-in teacher (for course dropdown)
// ---------------------------------------------------------------------------
router.get("/test-generator/my-courses", authMiddleWare, async (req, res) => {
  try {
    // Adjust the field name below to match however Course links to a teacher
    // e.g. Course.teacher, Course.createdBy, or via ClassInfo.teacher
    const courses = await Course.find({ teacher: req.user.id }).select(
      "name code _id"
    );
    res.status(200).json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// STEP 1: Start a new paper (choose course + class) -> creates a draft
// ---------------------------------------------------------------------------
router.post("/test-generator/start", authMiddleWare, async (req, res) => {
  try {
    const { courseId, classInfoId } = req.body;

    if (!courseId || !classInfoId) {
      return res
        .status(400)
        .json({ success: false, message: "courseId and classInfoId are required." });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    const classInfo = await ClassInfo.findById(classInfoId);
    if (!classInfo) {
      return res.status(404).json({ success: false, message: "Class not found." });
    }

    const draft = await TestGenerator.create({
      courseId,
      classInfoId,
      createdBy: req.user.id,
      status: "draft",
      // placeholders required by schema, filled in later steps
      paperType: "MCQ_ONLY",
      totalMarks: 0,
      duration: 0,
    });

    res.status(201).json({ success: true, paper: draft });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// STEP 2: Set paper type + total marks + duration
// ---------------------------------------------------------------------------
router.patch("/test-generator/:id/type", authMiddleWare, async (req, res) => {
  try {
    const { paperType, totalMarks, duration } = req.body;

    if (!["MCQ_ONLY", "MCQ_SHORT", "MCQ_SHORT_LONG"].includes(paperType)) {
      return res.status(400).json({ success: false, message: "Invalid paperType." });
    }
    if (!totalMarks || !duration) {
      return res
        .status(400)
        .json({ success: false, message: "totalMarks and duration are required." });
    }

    const paper = await TestGenerator.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id, status: "draft" },
      { paperType, totalMarks, duration },
      { new: true, runValidators: true }
    );

    if (!paper) {
      return res
        .status(404)
        .json({ success: false, message: "Draft not found or not editable." });
    }

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// STEP 3: Set marks distribution -> auto-generates empty question slots
// ---------------------------------------------------------------------------
router.patch("/test-generator/:id/distribution", authMiddleWare, async (req, res) => {
  try {
    const { mcq, short, long } = req.body;
    // Expected shape: { count, marksEach } for each, only send the ones relevant to paperType

    const paper = await TestGenerator.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
      status: "draft",
    });

    if (!paper) {
      return res
        .status(404)
        .json({ success: false, message: "Draft not found or not editable." });
    }

    const distribution = {
      mcq: mcq || { count: 0, marksEach: 0 },
      short: short || { count: 0, marksEach: 0 },
      long: long || { count: 0, marksEach: 0 },
    };

    // Validate distribution sums to totalMarks
    const computedTotal =
      distribution.mcq.count * distribution.mcq.marksEach +
      distribution.short.count * distribution.short.marksEach +
      distribution.long.count * distribution.long.marksEach;

    if (computedTotal !== paper.totalMarks) {
      return res.status(400).json({
        success: false,
        message: `Distribution totals ${computedTotal}, but paper totalMarks is ${paper.totalMarks}.`,
      });
    }

    // Build empty question slots so the frontend just fills them in one by one
    const slots = [];
    for (let i = 0; i < distribution.mcq.count; i++) {
      slots.push({ questionType: "MCQ", questionText: "", marks: distribution.mcq.marksEach, options: [] });
    }
    for (let i = 0; i < distribution.short.count; i++) {
      slots.push({ questionType: "Short", questionText: "", marks: distribution.short.marksEach });
    }
    for (let i = 0; i < distribution.long.count; i++) {
      slots.push({ questionType: "Long", questionText: "", marks: distribution.long.marksEach });
    }

    paper.distribution = distribution;
    paper.questions = slots;
    await paper.save({ validateBeforeSave: false }); // draft, so skip full validation

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// STEP 4a: Fill in ONE question at a time (recommended for wizard UX)
// ---------------------------------------------------------------------------
router.patch(
  "/test-generator/:id/questions/:questionId",
  authMiddleWare,
  async (req, res) => {
    try {
      const { questionText, options, modelAnswer, marks } = req.body;

      const paper = await TestGenerator.findOne({
        _id: req.params.id,
        createdBy: req.user.id,
        status: "draft",
      });

      if (!paper) {
        return res
          .status(404)
          .json({ success: false, message: "Draft not found or not editable." });
      }

      const question = paper.questions.id(req.params.questionId);
      if (!question) {
        return res.status(404).json({ success: false, message: "Question slot not found." });
      }

      if (question.questionType === "MCQ") {
        if (!options || options.length < 2) {
          return res
            .status(400)
            .json({ success: false, message: "MCQ needs at least 2 options." });
        }
        const correctCount = options.filter((o) => o.isCorrect).length;
        if (correctCount !== 1) {
          return res
            .status(400)
            .json({ success: false, message: "Exactly one option must be marked correct." });
        }
        question.options = options;
      } else {
        if (modelAnswer !== undefined) question.modelAnswer = modelAnswer;
      }

      question.questionText = questionText ?? question.questionText;
      if (marks !== undefined) question.marks = marks;

      await paper.save({ validateBeforeSave: false });

      res.status(200).json({ success: true, question });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// STEP 4b: Bulk update all questions at once (alternative to one-by-one)
// ---------------------------------------------------------------------------
router.put("/test-generator/:id/questions", authMiddleWare, async (req, res) => {
  try {
    const { questions } = req.body; // full array, replaces existing

    const paper = await TestGenerator.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id, status: "draft" },
      { questions },
      { new: true, runValidators: false }
    );

    if (!paper) {
      return res
        .status(404)
        .json({ success: false, message: "Draft not found or not editable." });
    }

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// STEP 5: Finalize the paper (locks it, runs full validation)
// ---------------------------------------------------------------------------
router.patch("/test-generator/:id/finalize", authMiddleWare, async (req, res) => {
  try {
    const paper = await TestGenerator.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
      status: "draft",
    });

    if (!paper) {
      return res
        .status(404)
        .json({ success: false, message: "Draft not found or already finalized." });
    }

    const incomplete = paper.questions.some((q) => !q.questionText || q.questionText.trim() === "");
    if (incomplete) {
      return res.status(400).json({
        success: false,
        message: "All question slots must be filled before finalizing.",
      });
    }

    paper.status = "finalized";
    await paper.save(); // full validators run here (marks-sum check included)

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET: single paper (resume draft or view finalized)
// ---------------------------------------------------------------------------
router.get("/test-generator/:id", authMiddleWare, async (req, res) => {
  try {
    const paper = await TestGenerator.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
    })
      .populate("courseId", "name code")
      .populate("classInfoId", "name");

    if (!paper) {
      return res.status(404).json({ success: false, message: "Paper not found." });
    }

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET: list all papers by this teacher (optionally filter by course/status)
// ---------------------------------------------------------------------------
router.get("/test-generator", authMiddleWare, async (req, res) => {
  try {
    const { courseId, status } = req.query;
    const filter = { createdBy: req.user.id };
    if (courseId) filter.courseId = courseId;
    if (status) filter.status = status;

    const papers = await TestGenerator.find(filter)
      .select("-questions") // keep list view light; fetch full paper via GET /:id
      .populate("courseId", "name code")
      .populate("classInfoId", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, papers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE: remove a draft (finalized papers probably shouldn't be deletable)
// ---------------------------------------------------------------------------
router.delete("/test-generator/:id", authMiddleWare, async (req, res) => {
  try {
    const paper = await TestGenerator.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id,
      status: "draft",
    });

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: "Draft not found, or only drafts can be deleted.",
      });
    }

    res.status(200).json({ success: true, message: "Draft deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
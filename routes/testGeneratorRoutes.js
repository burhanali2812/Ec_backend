const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const TestGenerator = require("../modals/TestGenerator");
const Course = require("../modals/Course");
const Class = require("../modals/Class");
const authMiddleWare = require("../authMiddleWare");

// ---------------------------------------------------------------------------
// STEP 1: Start a new paper -> reuses an existing draft for the same
// course+class if one exists, unless ?force=true is passed.
// ---------------------------------------------------------------------------
router.post("/start", authMiddleWare, async (req, res) => {
  try {
    const { courseId, classInfoId } = req.body;
    const force = req.query.force === "true";

    if (!courseId || !classInfoId) {
      return res
        .status(400)
        .json({ success: false, message: "courseId and classInfoId are required." });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    const classInfo = await Class.findById(classInfoId);
    if (!classInfo) {
      return res.status(404).json({ success: false, message: "Class not found." });
    }

    if (!force) {
      const existingDraft = await TestGenerator.findOne({
        courseId,
        classInfoId,
        createdBy: req.user.id,
        status: "draft",
      }).sort({ updatedAt: -1 });

      if (existingDraft) {
        return res.status(200).json({
          success: true,
          resumed: true,
          paper: existingDraft,
        });
      }
    }

    const draft = await TestGenerator.create({
      courseId,
      classInfoId,
      createdBy: req.user.id,
      status: "draft",
      paperType: "MCQ_ONLY",
      totalMarks: 0,
      duration: 0,
    });

    res.status(201).json({ success: true, resumed: false, paper: draft });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// NEW STEP: Save subject / instructor / exam date (previously never saved)
// ---------------------------------------------------------------------------
router.patch("/:id/details", authMiddleWare, async (req, res) => {
  try {
    const { subjectLabel, instructor, examDate } = req.body;

    if (!subjectLabel || !instructor || !examDate) {
      return res.status(400).json({
        success: false,
        message: "subjectLabel, instructor, and examDate are required.",
      });
    }

    const paper = await TestGenerator.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id, status: "draft" },
      { subjectLabel, instructor, examDate },
      { new: true }
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
// STEP: Set paper type + total marks + duration
// ---------------------------------------------------------------------------
router.patch("/:id/type", authMiddleWare, async (req, res) => {
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
// STEP: Marks distribution -> auto-generates empty question slots.
// MCQ slots now seed 4 blank options instead of an empty array.
// ---------------------------------------------------------------------------
router.patch("/:id/distribution", authMiddleWare, async (req, res) => {
  try {
    const { mcq, short, long } = req.body;

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

    const blankOptions = () => [
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ];

    const slots = [];
    for (let i = 0; i < distribution.mcq.count; i++) {
      slots.push({
        questionType: "MCQ",
        questionText: "",
        marks: distribution.mcq.marksEach,
        options: blankOptions(),
      });
    }
    for (let i = 0; i < distribution.short.count; i++) {
      slots.push({ questionType: "Short", questionText: "", marks: distribution.short.marksEach });
    }
    for (let i = 0; i < distribution.long.count; i++) {
      slots.push({ questionType: "Long", questionText: "", marks: distribution.long.marksEach });
    }

    paper.distribution = distribution;
    paper.questions = slots;
    await paper.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// STEP: Fill in ONE question at a time
// ---------------------------------------------------------------------------
router.patch("/:id/questions/:questionId", authMiddleWare, async (req, res) => {
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
      const cleanOptions = (options || []).filter((o) => o.text && o.text.trim());
      if (cleanOptions.length < 2) {
        return res
          .status(400)
          .json({ success: false, message: "MCQ needs at least 2 filled-in options." });
      }
      const correctCount = cleanOptions.filter((o) => o.isCorrect).length;
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
});

// ---------------------------------------------------------------------------
// STEP: Finalize — now also checks MCQ options are actually complete
// ---------------------------------------------------------------------------
router.patch("/:id/finalize", authMiddleWare, async (req, res) => {
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

    for (const q of paper.questions) {
      if (!q.questionText || !q.questionText.trim()) {
        return res.status(400).json({
          success: false,
          message: "All question slots must be filled before finalizing.",
        });
      }
      if (q.questionType === "MCQ") {
        const filled = (q.options || []).filter((o) => o.text && o.text.trim());
        const correctCount = filled.filter((o) => o.isCorrect).length;
        if (filled.length < 2 || correctCount !== 1) {
          return res.status(400).json({
            success: false,
            message: "Every MCQ needs at least 2 options and exactly one marked correct.",
          });
        }
      }
    }

    paper.status = "finalized";
    await paper.save();

    res.status(200).json({ success: true, paper });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET: single paper
// ---------------------------------------------------------------------------
router.get("/:id", authMiddleWare, async (req, res) => {
  try {
    const paper = await TestGenerator.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
    })
      .populate("courseId", "title code")
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
// GET: list papers (status=draft or status=finalized via query)
// ---------------------------------------------------------------------------
router.get("/", authMiddleWare, async (req, res) => {
  try {
    const { courseId, status } = req.query;
    const filter = { createdBy: req.user.id };
    if (courseId) filter.courseId = courseId;
    if (status) filter.status = status;

    const papers = await TestGenerator.find(filter)
      .select("-questions")
      .populate("courseId", "title code")
      .populate("classInfoId", "name")
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, papers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE: remove a draft
// ---------------------------------------------------------------------------
router.delete("/:id", authMiddleWare, async (req, res) => {
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
const express = require('express');
const router = express.Router();
const MoodLog = require('../models/MoodLog');
const authMiddleware = require('../middleware/authMiddleware');

// @route   POST /api/mood
// @desc    Log mood and energy for today
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { energy, mood, stress, notes } = req.body;

    if (!energy || !mood || !stress) {
      return res.status(400).json({ success: false, message: 'Energy, mood and stress are required.' });
    }

    // Check if already logged today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await MoodLog.findOne({
      userId: req.user._id,
      date: { $gte: today, $lt: tomorrow },
    });

    if (existing) {
      // Update today's log
      existing.energy = energy;
      existing.mood = mood;
      existing.stress = stress;
      existing.notes = notes || '';
      await existing.save();
      return res.status(200).json({ success: true, data: existing, updated: true });
    }

    const log = await MoodLog.create({
      userId: req.user._id,
      energy,
      mood,
      stress,
      notes: notes || '',
    });

    res.status(201).json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to log mood: ' + err.message });
  }
});

// @route   GET /api/mood/today
// @desc    Get today's mood log
// @access  Private
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const log = await MoodLog.findOne({
      userId: req.user._id,
      date: { $gte: today, $lt: tomorrow },
    });

    res.status(200).json({ success: true, data: log || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get mood: ' + err.message });
  }
});

// @route   GET /api/mood/history
// @desc    Get last 7 days mood logs
// @access  Private
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const logs = await MoodLog.find({
      userId: req.user._id,
      date: { $gte: sevenDaysAgo },
    }).sort({ date: -1 });

    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get mood history: ' + err.message });
  }
});

module.exports = router;
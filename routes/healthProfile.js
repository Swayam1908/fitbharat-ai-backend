const express = require('express');
const router = express.Router();
const HealthProfile = require('../models/HealthProfile');
const authMiddleware = require('../middleware/authMiddleware');

// @route   GET /api/health-profile
// @desc    Get user's health profile
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const profile = await HealthProfile.findOne({ userId: req.user._id });
    res.status(200).json({ success: true, data: profile || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get health profile: ' + err.message });
  }
});

// @route   POST /api/health-profile
// @desc    Create or update health profile
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      conditions, injuries, dietaryRestrictions,
      medications, activityRestriction, recoveryMode,
      profession, activityLevel, workHoursPerDay,
    } = req.body;

    const profile = await HealthProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        userId: req.user._id,
        conditions: conditions || ['none'],
        injuries: injuries || ['none'],
        dietaryRestrictions: dietaryRestrictions || ['none'],
        medications: medications || '',
        activityRestriction: activityRestriction || 'full',
        recoveryMode: recoveryMode || false,
        profession: profession || 'student',
        activityLevel: activityLevel || 'moderately_active',
        workHoursPerDay: workHoursPerDay || 8,
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save health profile: ' + err.message });
  }
});

module.exports = router;
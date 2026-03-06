const mongoose = require('mongoose');

const HealthProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  conditions: [{
    type: String,
    enum: ['diabetes', 'hypertension', 'thyroid', 'pcod', 'asthma', 'heart_disease', 'none'],
  }],
  injuries: [{
    type: String,
    enum: ['knee', 'back', 'shoulder', 'ankle', 'wrist', 'hip', 'neck', 'none'],
  }],
  dietaryRestrictions: [{
    type: String,
    enum: ['vegetarian', 'vegan', 'gluten_free', 'lactose_intolerant', 'nut_allergy', 'none'],
  }],
  medications: {
    type: String,
    default: '',
  },
  activityRestriction: {
    type: String,
    enum: ['full', 'mild_only', 'no_lower_body', 'no_upper_body', 'cardio_only'],
    default: 'full',
  },
  recoveryMode: {
    type: Boolean,
    default: false,
  },
  profession: {
    type: String,
    enum: ['student', 'desk_job', 'physical_labor', 'athlete', 'homemaker', 'other'],
    default: 'student',
  },
  activityLevel: {
    type: String,
    enum: ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'],
    default: 'moderately_active',
  },
  workHoursPerDay: {
    type: Number,
    default: 8,
  },
}, { timestamps: true });

module.exports = mongoose.model('HealthProfile', HealthProfileSchema);

const mongoose = require('mongoose');

const MoodLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
  energy: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  mood: {
    type: String,
    enum: ['terrible', 'bad', 'okay', 'good', 'great'],
    required: true,
  },
  stress: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
  },
  notes: {
    type: String,
    default: '',
  },
}, { timestamps: true });

module.exports = mongoose.model('MoodLog', MoodLogSchema);
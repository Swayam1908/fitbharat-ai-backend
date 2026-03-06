const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const workoutRoutes = require('./routes/workouts');
const nutritionRoutes = require('./routes/nutrition');
const exerciseRoutes = require('./routes/exercises');
const sleepRoutes = require('./routes/sleep');
const bmiRoutes = require('./routes/bmi');
const dashboardRoutes = require('./routes/dashboard');
const suggestionsRoutes = require('./routes/suggestions');
const adminRoutes = require('./routes/admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/mood',           require('./routes/mood'));
app.use('/api/health-profile', require('./routes/healthProfile'));
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/sleep', sleepRoutes);
app.use('/api/bmi', bmiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ success: true, message: 'FitBharat API is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI, { family: 4 })
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`🚀 FitBharat server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

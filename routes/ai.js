const express = require("express");
const router = express.Router();
const axios = require("axios");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const WorkoutLog = require("../models/WorkoutLog");
const NutritionLog = require("../models/NutritionLog");
const SleepLog = require("../models/SleepLog");
const MoodLog = require("../models/MoodLog");
const HealthProfile = require("../models/HealthProfile");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// UPDATED: Using v1beta which is required for the Gemini 2.x/3.x series models available on your key
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ── Helper: Call Gemini API ──
const callGemini = async (prompt) => {
  try {
    const response = await axios.post(
      GEMINI_URL,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data.candidates && response.data.candidates[0].content) {
      return response.data.candidates[0].content.parts[0].text;
    }
    throw new Error("Invalid response from Gemini");
  } catch (error) {
    console.error(
      "Gemini API Error:",
      error.response ? JSON.stringify(error.response.data) : error.message,
    );
    throw error;
  }
};

// ── Helper: Build full user context ──
const getUserContext = async (userId) => {
  const [
    user,
    healthProfile,
    recentWorkouts,
    todayNutrition,
    recentSleep,
    recentMood,
  ] = await Promise.all([
    User.findById(userId).select("-password"),
    HealthProfile.findOne({ userId }),
    WorkoutLog.find({ userId }).sort({ date: -1 }).limit(7),
    NutritionLog.find({
      userId,
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    SleepLog.find({ userId }).sort({ date: -1 }).limit(7),
    MoodLog.find({ userId }).sort({ date: -1 }).limit(7),
  ]);

  const bmi =
    user.height && user.weight
      ? (user.weight / (user.height / 100) ** 2).toFixed(1)
      : "unknown";

  const todayCalories = todayNutrition.reduce(
    (sum, m) => sum + (m.totalCalories || 0),
    0,
  );
  const avgSleep = recentSleep.length
    ? (
        recentSleep.reduce((s, l) => s + l.durationHours, 0) /
        recentSleep.length
      ).toFixed(1)
    : "no data";
  const avgEnergy = recentMood.length
    ? (
        recentMood.reduce((s, m) => s + m.energy, 0) / recentMood.length
      ).toFixed(1)
    : "no data";

  return {
    user,
    healthProfile,
    recentWorkouts,
    todayNutrition,
    recentSleep,
    recentMood,
    bmi,
    todayCalories,
    avgSleep,
    avgEnergy,
  };
};

// ════════════════════════════════════════
// @route   POST /api/ai/chat
// @desc    AI Chat Assistant with full user context
// @access  Private
// ════════════════════════════════════════
router.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    if (!message)
      return res
        .status(400)
        .json({ success: false, message: "Message is required." });

    const ctx = await getUserContext(req.user._id);

    const systemContext = `You are FitBharat AI, a personal fitness and health assistant for an Indian user. Your tagline is "Your fitness, your way — built for India".

USER PROFILE:
- Name: ${ctx.user.name}
- Age: ${ctx.user.age}, Gender: ${ctx.user.gender}
- Height: ${ctx.user.height}cm, Weight: ${ctx.user.weight}kg, BMI: ${ctx.bmi}
- Goal: ${ctx.user.goal}
- Daily targets: ${ctx.user.dailyCalorieTarget} cal, ${ctx.user.dailyProteinTarget}g protein

HEALTH CONDITIONS: ${ctx.healthProfile ? ctx.healthProfile.conditions.join(", ") : "none specified"}
INJURIES: ${ctx.healthProfile ? ctx.healthProfile.injuries.join(", ") : "none"}
DIETARY RESTRICTIONS: ${ctx.healthProfile ? ctx.healthProfile.dietaryRestrictions.join(", ") : "none"}
RECOVERY MODE: ${ctx.healthProfile ? ctx.healthProfile.recoveryMode : false}
ACTIVITY LEVEL: ${ctx.healthProfile ? ctx.healthProfile.activityLevel : "moderate"}
PROFESSION: ${ctx.healthProfile ? ctx.healthProfile.profession : "unknown"}

TODAY'S CALORIES: ${ctx.todayCalories} / ${ctx.user.dailyCalorieTarget}
RECENT WORKOUTS: ${ctx.recentWorkouts.length} in last 7 days
AVG SLEEP: ${ctx.avgSleep} hours
AVG ENERGY: ${ctx.avgEnergy}/5

CRITICAL GUARDRAILS (MUST FOLLOW):
1. You must ONLY answer questions related to fitness, workouts, nutrition, sleep, health profiles, and the FitBharat app.
2. If a user asks an out-of-context question (e.g., movie suggestions, coding help, politics, general trivia), you MUST politely decline.
3. When declining, respond exactly like this: "I am FitBharat's AI coach. I'm here to help you with your fitness, nutrition, and health goals. I cannot answer questions outside of those topics."

RULES:
- Always give advice specific to this user's conditions and goals
- If user has injuries, NEVER suggest exercises that could worsen them
- If user has diabetes, always mention low-GI food options
- If user has hypertension, avoid very high intensity suggestions
- Give answers in a friendly, motivating tone
- Keep responses concise and actionable
- Use Indian food and exercise context where relevant
- If asked about meal logging, extract food items and provide nutrition estimates`;

    const conversationText = conversationHistory
      .slice(-6)
      .map(
        (m) => `${m.role === "user" ? "User" : "FitBharat AI"}: ${m.content}`,
      )
      .join("\n");

    const fullPrompt = `${systemContext}\n\nCONVERSATION HISTORY:\n${conversationText}\n\nUser: ${message}\n\nFitBharat AI:`;

    const reply = await callGemini(fullPrompt);
    res.status(200).json({ success: true, reply: reply.trim() });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "AI chat failed: " + err.message });
  }
});

// ════════════════════════════════════════
// @route   POST /api/ai/meal-parse
// @desc    Natural language meal logging
// @access  Private
// ════════════════════════════════════════
router.post("/meal-parse", authMiddleware, async (req, res) => {
  try {
    const { text, mealType = "lunch" } = req.body;
    if (!text)
      return res
        .status(400)
        .json({ success: false, message: "Text is required." });

    const prompt = `You are a nutrition expert specializing in Indian food. A user said: "${text}"

Extract all food items mentioned and return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "mealName": "brief meal name",
  "mealType": "${mealType}",
  "ingredients": [
    {
      "name": "food name",
      "quantity": number_in_grams_or_ml,
      "unit": "g",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number
    }
  ],
  "totalCalories": number,
  "totalProtein": number,
  "totalCarbs": number,
  "totalFat": number,
  "totalFiber": number,
  "confidence": "high/medium/low"
}

Use standard Indian food nutrition values per 100g. Assume typical serving sizes if not specified.
Dal = 150g cooked, Rice = 200g cooked, Roti = 30g each, Sabzi = 100g.`;

    const raw = await callGemini(prompt);
    
    if (!raw) {
      return res.status(500).json({ success: false, message: "Received empty response from AI." });
    }

    // Clean out potential markdown backticks and 'json' identifiers
    let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // Find the first '{' and last '}' to strip out conversational text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else {
      return res.status(500).json({ success: false, message: "AI response did not contain valid JSON structure." });
    }
    
    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ success: true, data: parsed });
    } catch (parseError) {
      return res.status(500).json({ success: false, message: "Failed to parse AI response: " + parseError.message });
    }
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Meal parsing failed: " + err.message });
  }
});

// ════════════════════════════════════════
// @route   GET /api/ai/insights
// @desc    Smart health insights from patterns
// @access  Private
// ════════════════════════════════════════
router.get("/insights", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user._id);

    if (ctx.recentMood.length < 3 && ctx.recentWorkouts.length < 3) {
      return res.status(200).json({
        success: true,
        data: {
          insights: [],
          message:
            "Keep logging daily! Insights will appear after 3+ days of data.",
          hasEnoughData: false,
        },
      });
    }

    const moodData = ctx.recentMood
      .map(
        (m) =>
          `${new Date(m.date).toLocaleDateString()}: energy=${m.energy}/5, mood=${m.mood}, stress=${m.stress}`,
      )
      .join("\n");

    const sleepData = ctx.recentSleep
      .map(
        (s) =>
          `${new Date(s.date).toLocaleDateString()}: ${s.durationHours}hrs, quality=${s.quality}`,
      )
      .join("\n");

    const workoutData = ctx.recentWorkouts
      .map(
        (w) =>
          `${new Date(w.date).toLocaleDateString()}: ${w.exercises?.length || 0} exercises, volume=${w.totalVolume || 0}kg`,
      )
      .join("\n");

    const prompt = `Analyze this fitness data for ${ctx.user.name} and find 3 meaningful patterns or insights.

MOOD & ENERGY (last 7 days):
${moodData || "No data"}

SLEEP (last 7 days):
${sleepData || "No data"}

WORKOUTS (last 7 days):
${workoutData || "No data"}

User goal: ${ctx.user.goal}
Average sleep: ${ctx.avgSleep} hours
Average energy: ${ctx.avgEnergy}/5

Return ONLY a valid JSON array (no markdown):
[
  {
    "type": "sleep|workout|nutrition|mood|recovery",
    "title": "short insight title",
    "description": "2 sentence insight with specific data mentioned",
    "actionable": "one specific action they can take",
    "positive": true or false
  }
]

Find real patterns — correlations between sleep and energy, workout consistency, stress patterns etc.`;

    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const insights = JSON.parse(cleaned);

    res
      .status(200)
      .json({ success: true, data: { insights, hasEnoughData: true } });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Insights failed: " + err.message });
  }
});

// ════════════════════════════════════════
// @route   GET /api/ai/antiaging
// @desc    Anti-aging lifestyle suggestions
// @access  Private
// ════════════════════════════════════════
router.get("/antiaging", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user._id);

    const prompt = `You are an anti-aging and longevity expert. Analyze this person's lifestyle and give personalized anti-aging advice.

USER DATA:
- Age: ${ctx.user.age}, BMI: ${ctx.bmi}
- Average sleep: ${ctx.avgSleep} hours/night
- Average energy level: ${ctx.avgEnergy}/5
- Workouts this week: ${ctx.recentWorkouts.length}
- Today's calories: ${ctx.todayCalories} / ${ctx.user.dailyCalorieTarget} target
- Health conditions: ${ctx.healthProfile ? ctx.healthProfile.conditions.join(", ") : "none"}
- Profession: ${ctx.healthProfile ? ctx.healthProfile.profession : "unknown"}

Return ONLY a valid JSON object (no markdown):
{
  "biologicalAgeNote": "one sentence about their lifestyle vs aging",
  "positives": ["what they are doing well for longevity (2-3 items)"],
  "improvements": [
    {
      "category": "sleep|nutrition|exercise|stress|hydration",
      "issue": "what is accelerating aging",
      "suggestion": "specific actionable advice",
      "indianContext": "Indian food or lifestyle specific tip"
    }
  ],
  "topAntiAgingFoods": ["5 Indian foods they should eat more of"],
  "avoidFoods": ["3 things to reduce"],
  "dailyHabit": "one simple daily habit that fights aging most for this person"
}`;

    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleaned);

    res.status(200).json({ success: true, data });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Anti-aging analysis failed: " + err.message,
      });
  }
});

// ════════════════════════════════════════
// @route   GET /api/ai/transformation
// @desc    Body transformation timeline
// @access  Private
// ════════════════════════════════════════
router.get("/transformation", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user._id);
    const { user } = ctx;

    const bmi = parseFloat(ctx.bmi);
    let targetWeight = user.weight;
    let goalDescription = "";

    if (user.goal === "weight_loss") {
      const targetBMI = 22;
      targetWeight = Math.round(targetBMI * (user.height / 100) ** 2);
      goalDescription = `Lose ${Math.max(0, user.weight - targetWeight)}kg to reach healthy BMI`;
    } else if (user.goal === "muscle_gain") {
      targetWeight = user.weight + 5;
      goalDescription = `Gain 5kg of lean muscle mass`;
    } else {
      targetWeight = user.weight;
      goalDescription = `Maintain current weight and improve fitness`;
    }

    const weightDiff = Math.abs(user.weight - targetWeight);
    const weeklyProgress =
      user.goal === "weight_loss"
        ? 0.5
        : user.goal === "muscle_gain"
          ? 0.25
          : 0;
    const weeksNeeded =
      weeklyProgress > 0 ? Math.ceil(weightDiff / weeklyProgress) : 12;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + weeksNeeded * 7);

    // Calculate progress based on workout consistency
    const workoutsThisWeek = ctx.recentWorkouts.filter((w) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(w.date) >= weekAgo;
    }).length;
    const consistencyScore = Math.min(workoutsThisWeek / 5, 1);
    const progressPercent =
      user.goal === "stay_fit"
        ? Math.min(Math.round(consistencyScore * 100), 100)
        : Math.min(
            Math.round(
              (ctx.recentWorkouts.length / Math.max(weeksNeeded, 1)) * 10,
            ),
            95,
          );

    const motivationalMessages = {
      weight_loss: [
        "Every workout counts. You're building a better you.",
        "Consistency beats perfection. Keep going!",
        "Your future self will thank you for today's effort.",
      ],
      muscle_gain: [
        "Muscles are built in the kitchen and gym. You're on track!",
        "Progressive overload is your best friend.",
        "Rest days are growth days. Trust the process.",
      ],
      stay_fit: [
        "Fitness is a lifestyle, not a destination.",
        "You're investing in your health every day.",
        "Consistency is the secret to lasting fitness.",
      ],
    };

    const messages =
      motivationalMessages[user.goal] || motivationalMessages.stay_fit;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    res.status(200).json({
      success: true,
      data: {
        currentWeight: user.weight,
        targetWeight,
        goalDescription,
        progressPercent,
        weeksNeeded,
        estimatedDate: endDate.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
        }),
        workoutsThisWeek,
        motivationalMessage: randomMessage,
        milestones: [
          {
            week: Math.round(weeksNeeded * 0.25),
            label: "25% there",
            achieved: progressPercent >= 25,
          },
          {
            week: Math.round(weeksNeeded * 0.5),
            label: "Halfway!",
            achieved: progressPercent >= 50,
          },
          {
            week: Math.round(weeksNeeded * 0.75),
            label: "75% done",
            achieved: progressPercent >= 75,
          },
          {
            week: weeksNeeded,
            label: "Goal reached!",
            achieved: progressPercent >= 100,
          },
        ],
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Transformation failed: " + err.message,
      });
  }
});

// ════════════════════════════════════════
// @route   GET /api/ai/workout-plan
// @desc    AI Weekly Workout Plan generator
// @access  Private
// ════════════════════════════════════════
router.get("/workout-plan", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user._id);

    const recentMuscleGroups = ctx.recentWorkouts
      .slice(0, 3)
      .flatMap((w) => w.exercises?.map((e) => e.muscleGroup) || []);

    const prompt = `Create a personalized 7-day workout plan for this user.

USER PROFILE:
- Goal: ${ctx.user.goal}
- BMI: ${ctx.bmi}
- Age: ${ctx.user.age}
- Health conditions: ${ctx.healthProfile ? ctx.healthProfile.conditions.join(", ") : "none"}
- Injuries: ${ctx.healthProfile ? ctx.healthProfile.injuries.join(", ") : "none"}
- Activity restriction: ${ctx.healthProfile ? ctx.healthProfile.activityRestriction : "full"}
- Recovery mode: ${ctx.healthProfile ? ctx.healthProfile.recoveryMode : false}
- Recently trained: ${recentMuscleGroups.join(", ") || "nothing recently"}
- Activity level: ${ctx.healthProfile ? ctx.healthProfile.activityLevel : "moderate"}

IMPORTANT RULES:
- NEVER suggest exercises for injured body parts
- If recovery mode is true, only suggest light/moderate exercises
- Respect activity restrictions strictly
- For weight_loss: higher reps (15-20), cardio included
- For muscle_gain: compound movements, progressive overload (8-12 reps)
- For stay_fit: balanced mix, 3-4 active days

Return ONLY a valid JSON object (no markdown):
{
  "planName": "personalized plan name",
  "weeklyGoal": "what this week aims to achieve",
  "days": [
    {
      "day": "Monday",
      "type": "Push/Pull/Legs/Rest/Cardio/Full Body",
      "focus": "muscle groups",
      "isRest": false,
      "exercises": [
        {
          "name": "exercise name",
          "sets": 3,
          "reps": "8-12",
          "rest": "60 sec",
          "notes": "form tip or modification"
        }
      ],
      "estimatedDuration": "45 mins",
      "estimatedCalories": 300
    }
  ],
  "nutritionTip": "one weekly nutrition tip aligned with their goal",
  "recoveryTip": "one recovery tip for the week"
}`;

    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const plan = JSON.parse(cleaned);

    res.status(200).json({ success: true, data: plan });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Workout plan failed: " + err.message });
  }
});

// ════════════════════════════════════════
// @route   GET /api/ai/adaptive-suggestions
// @desc    Medical profile aware suggestions
// @access  Private
// ════════════════════════════════════════
router.get("/adaptive-suggestions", authMiddleware, async (req, res) => {
  try {
    const ctx = await getUserContext(req.user._id);

    if (!ctx.healthProfile) {
      return res.status(200).json({
        success: true,
        data: {
          hasHealthProfile: false,
          message:
            "Complete your health profile to get personalized adaptive suggestions.",
        },
      });
    }

    const prompt = `You are a medical fitness advisor. Give adaptive workout and nutrition suggestions for this user.

HEALTH DATA:
- Conditions: ${ctx.healthProfile.conditions.join(", ")}
- Injuries: ${ctx.healthProfile.injuries.join(", ")}
- Dietary restrictions: ${ctx.healthProfile.dietaryRestrictions.join(", ")}
- Recovery mode: ${ctx.healthProfile.recoveryMode}
- Activity restriction: ${ctx.healthProfile.activityRestriction}
- Goal: ${ctx.user.goal}
- BMI: ${ctx.bmi}
- Age: ${ctx.user.age}

Return ONLY a valid JSON object (no markdown):
{
  "safeExercises": [
    { "name": "exercise", "reason": "why it's safe/beneficial for their conditions", "modification": "any modification needed" }
  ],
  "avoidExercises": [
    { "name": "exercise", "reason": "why to avoid" }
  ],
  "nutritionAdvice": [
    { "tip": "specific nutrition tip", "reason": "medical reason", "indianFoodExample": "Indian food that helps" }
  ],
  "warningSign": "one warning sign they should watch out for during exercise",
  "doctorNote": "whether they should consult a doctor before starting (yes/no and why)"
}

IMPORTANT Instructions: Keep your response concise and strictly under 1500 tokens. Ensure the JSON is complete.`;

    const raw = await callGemini(prompt);
    
    // Log the raw response so we can see what the AI returned before any cleaning
    console.log("----- RAW AI RESPONSE START -----");
    console.log(raw);
    console.log("----- RAW AI RESPONSE END -----");

    if (!raw) {
      return res.status(500).json({ success: false, message: "Received empty response from AI." });
    }

    // Clean out potential markdown backticks and 'json' identifiers
    let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // Bulletproof Extraction: Use a Regex to find the JSON block directly
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    } else {
      console.error("Failed to parse adaptive-suggestions JSON, raw response:", raw);
      return res.status(500).json({ success: false, message: "AI response did not contain valid JSON structure." });
    }
    
    try {
      const suggestions = JSON.parse(cleaned);
      res.status(200).json({
        success: true,
        data: { ...suggestions, hasHealthProfile: true },
      });
    } catch (parseError) {
      // Pre-parse Cleanup: If the model returned incomplete JSON, attempt to close the brackets as a last-resort rescue.
      console.error("Parse error encountered, attempting to rescue JSON structure...");
      try {
        if (!cleaned.endsWith('}')) {
          if (!cleaned.endsWith(']')) {
             cleaned += '"]}';
          } else {
             cleaned += '}';
          }
        }
        const rescued = JSON.parse(cleaned + ']}');
        return res.status(200).json({
          success: true,
          data: { ...rescued, hasHealthProfile: true, _rescued: true },
        });
      } catch (rescueErr) {
        console.error("Rescue failed. Failed to parse adaptive-suggestions JSON, raw response:", raw);
        console.error("Parse error:", parseError);
        return res.status(500).json({ success: false, message: "Failed to parse AI response: " + parseError.message });
      }
    }
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Adaptive suggestions failed: " + err.message,
      });
  }
});

module.exports = router;

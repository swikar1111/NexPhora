const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});
app.use(express.static('public'));

let emergencies = [];

// --- Hospital Database ---
const HOSPITALS = [
  {
    name: "Apollo Hospitals",
    area: "Greams Road",
    specialties: ["trauma", "cardiac", "neuro", "burn", "orthopedic", "general"],
    etaBase: 10,
    contact: "+91-44-2829-3333"
  },
  {
    name: "MIOT International",
    area: "Manapakkam",
    specialties: ["orthopedic", "trauma", "spine", "joint", "fracture"],
    etaBase: 14,
    contact: "+91-44-4200-2288"
  },
  {
    name: "Fortis Malar Hospital",
    area: "Adyar",
    specialties: ["cardiac", "heart", "chest", "stroke", "general"],
    etaBase: 12,
    contact: "+91-44-4289-2288"
  },
  {
    name: "Sri Ramachandra Medical Centre",
    area: "Porur",
    specialties: ["neuro", "brain", "seizure", "stroke", "general", "trauma"],
    etaBase: 16,
    contact: "+91-44-4592-8600"
  },
  {
    name: "Vijaya Hospital",
    area: "Vadapalani",
    specialties: ["general", "fracture", "bleeding", "burn", "unconscious"],
    etaBase: 8,
    contact: "+91-44-2364-4000"
  },
  {
    name: "SIMS Hospital",
    area: "Vadapalani",
    specialties: ["cardiac", "neuro", "trauma", "general"],
    etaBase: 9,
    contact: "+91-44-4396-9999"
  }
];

const CONDITION_KEYWORDS = {
  cardiac:     ["heart", "cardiac", "chest pain", "chest", "heart attack", "palpitation"],
  neuro:       ["brain", "neuro", "seizure", "fit", "convulsion", "stroke", "paralysis", "unconscious", "faint"],
  trauma:      ["accident", "crash", "collision", "trauma", "hit", "fall", "injury"],
  orthopedic:  ["fracture", "bone", "broken", "dislocation", "spine", "joint", "knee", "leg", "arm"],
  bleeding:    ["bleed", "bleeding", "blood", "cut", "wound", "laceration"],
  burn:        ["burn", "fire", "scald", "chemical"],
  general:     []
};

function matchHospital(condition) {
  const lower = condition.toLowerCase();
  let bestScore = -1;
  let bestHospital = HOSPITALS[0];

  for (const hospital of HOSPITALS) {
    let score = 0;
    for (const [category, keywords] of Object.entries(CONDITION_KEYWORDS)) {
      if (hospital.specialties.includes(category)) {
        for (const kw of keywords) {
          if (lower.includes(kw)) score += 2;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestHospital = hospital;
    }
  }

  const etaVariance = Math.floor(Math.random() * 4) - 2;
  const eta = Math.max(5, bestHospital.etaBase + etaVariance);
  return { hospital: bestHospital, eta };
}

// --- Claude AI call ---
async function callClaude(location, patientCondition, hasImage) {
  if (!ANTHROPIC_API_KEY) {
    // Fallback for demo without API key
    return {
      preDiagnosis: "Unable to connect to AI system. Manual assessment required. Please relay condition to attending physician.",
      severity: "Unknown",
      firstAid: [
        "Keep the patient calm and still",
        "Monitor breathing and pulse continuously",
        "Do not give food or water",
        "Apply pressure to any visible wounds",
        "Keep patient warm with a blanket if available"
      ],
      requiredEquipment: ["First aid kit", "Oxygen supply", "Stretcher"]
    };
  }

  const prompt = `You are an AI medical triage assistant integrated into an emergency ambulance dispatch system in Chennai, India. Analyze the following emergency report and provide a structured response.

EMERGENCY REPORT:
- Location: ${location}
- Patient Condition: ${patientCondition}
${hasImage ? "- Visual evidence: Photo of patient has been captured" : ""}

Respond ONLY with a valid JSON object (no markdown, no extra text) in this exact format:
{
  "severity": "Critical" | "Serious" | "Moderate" | "Stable",
  "preDiagnosis": "2-3 sentence preliminary medical assessment for the paramedic",
  "firstAid": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
  "requiredEquipment": ["equipment1", "equipment2", "equipment3"],
  "warnings": "Any critical warnings for paramedics or bystanders (or null)"
}

Be medically accurate, concise, and actionable. Steps should be immediate actions a bystander can take right now.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const raw = data.content[0].text.trim();

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse AI response as JSON");
  }
}

// --- POST /api/emergency ---
app.post('/api/emergency', async (req, res) => {
  const { location, patientCondition, voiceNote, images } = req.body;

  if (!location || !patientCondition) {
    return res.status(400).json({ success: false, message: "Location and patient condition are required." });
  }

  try {
    const conditionFull = [patientCondition, voiceNote].filter(Boolean).join(". ");
    const hasImage = images && images.length > 0;

    const [aiResult, { hospital, eta }] = await Promise.all([
      callClaude(location, conditionFull, hasImage),
      Promise.resolve(matchHospital(conditionFull))
    ]);

    const emergency = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      location,
      patientCondition: conditionFull,
      status: "Ambulance Dispatched",
      severity: aiResult.severity,
      hospital: `${hospital.name}, ${hospital.area}`,
      hospitalContact: hospital.contact,
      eta: `${eta} mins`,
      preDiagnosis: aiResult.preDiagnosis,
      firstAid: aiResult.firstAid,
      requiredEquipment: aiResult.requiredEquipment,
      warnings: aiResult.warnings || null
    };

    emergencies.push(emergency);
    console.log(`🚨 [${emergency.id}] Emergency at ${location} — Severity: ${emergency.severity} → ${hospital.name}`);

    res.json({ success: true, message: "Emergency registered!", data: emergency });

  } catch (err) {
    console.error("❌ Emergency processing error:", err.message);
    res.status(500).json({ success: false, message: "Server error. Please call 108 immediately.", error: err.message });
  }
});

// --- GET /api/emergencies (attendant dashboard) ---
app.get('/api/emergencies', (req, res) => {
  res.json({ success: true, data: emergencies });
});

// --- GET /api/emergency/:id ---
app.get('/api/emergency/:id', (req, res) => {
  const emergency = emergencies.find(e => e.id === parseInt(req.params.id));
  if (!emergency) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: emergency });
});

app.listen(PORT, () => {
  console.log(`🚑 NexPhora running → http://localhost:${PORT}`);
  console.log(ANTHROPIC_API_KEY ? "✅ Claude AI connected" : "⚠️  No ANTHROPIC_API_KEY — running in demo mode");
});

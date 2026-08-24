import OpenAI from "openai";

const client = () => process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export type PreVisit = { urgency: "Low" | "Medium" | "High"; chiefComplaint: string; questions: string[]; rawOutput?: string };

export async function generatePreVisitSummary(symptoms: string): Promise<PreVisit> {
  const fallback: PreVisit = { urgency: "Medium", chiefComplaint: symptoms.slice(0, 160), questions: ["What symptoms are most concerning?", "When did the symptoms begin?", "Are there any triggers or medications that affect them?"] };
  const ai = client(); if (!ai) return fallback;
  try {
    const response = await ai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You assist a clinician. Do not diagnose. Return only JSON with urgency (Low/Medium/High), chiefComplaint, and exactly three suggested questions. Urgency is triage guidance, not a diagnosis." },
        { role: "user", content: `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}` }
      ]
    });
    const raw = response.choices[0]?.message?.content || "";
    const parsed = JSON.parse(raw);
    if (!['Low','Medium','High'].includes(parsed.urgency) || !parsed.chiefComplaint || !Array.isArray(parsed.questions)) return fallback;
    return { urgency: parsed.urgency, chiefComplaint: String(parsed.chiefComplaint), questions: parsed.questions.slice(0,3).map(String), rawOutput: raw };
  } catch { return fallback; }
}

export type PostVisit = { summary: string; medicationSchedule: string[]; followUpSteps: string[]; rawOutput?: string };
export async function generatePostVisitSummary(notes: string, prescription = ""): Promise<PostVisit> {
  const fallback: PostVisit = { summary: "Your doctor has recorded the visit notes. Please follow the prescribed medicines and contact the clinic if symptoms worsen or new concerns appear.", medicationSchedule: prescription ? [prescription] : [], followUpSteps: ["Follow the doctor's instructions.", "Attend the recommended follow-up appointment."] };
  const ai = client(); if (!ai) return fallback;
  try {
    const response = await ai.chat.completions.create({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", response_format: { type: "json_object" }, messages: [
      { role: "system", content: "Rewrite clinical notes for a patient in plain, reassuring language. Do not add diagnoses or invent facts. Return JSON with summary, medicationSchedule array, followUpSteps array." },
      { role: "user", content: `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}\nPrescription: ${prescription}` }
    ]});
    const raw = response.choices[0]?.message?.content || ""; const parsed = JSON.parse(raw);
    if (!parsed.summary) return fallback;
    return { summary: String(parsed.summary), medicationSchedule: Array.isArray(parsed.medicationSchedule) ? parsed.medicationSchedule.map(String) : [], followUpSteps: Array.isArray(parsed.followUpSteps) ? parsed.followUpSteps.map(String) : [], rawOutput: raw };
  } catch { return fallback; }
}

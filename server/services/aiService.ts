import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface ComplaintClassification {
  type: 'reclamo' | 'queja';
  confidence: number;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel: 'low' | 'medium' | 'high';
  suggestedResponse?: string;
  keywords: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

class AIService {
  async classifyComplaint(complaintText: string): Promise<ComplaintClassification> {
    try {
      const prompt = `
Analiza la siguiente reclamación y clasifícala según la normativa peruana (DS 011-2011-PCM).

Texto de la reclamación: "${complaintText}"

Proporciona un análisis en formato JSON con:
- type: "reclamo" (disconformidad con producto/servicio) o "queja" (disconformidad con atención)
- confidence: nivel de confianza (0-1)
- category: categoría específica (producto, servicio, atención, entrega, calidad, precio, etc.)
- priority: prioridad (low, normal, high, urgent)
- riskLevel: nivel de riesgo legal/reputacional (low, medium, high)
- keywords: palabras clave identificadas
- sentiment: sentimiento general (positive, neutral, negative)

Considera la gravedad, urgencia legal y potencial impacto en la reputación del negocio.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "Eres un experto en derecho del consumidor peruano y análisis de reclamaciones. Analiza reclamaciones según DS 011-2011-PCM y DS 101-2022-PCM."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        type: analysis.type || 'reclamo',
        confidence: analysis.confidence || 0.8,
        category: analysis.category || 'general',
        priority: analysis.priority || 'normal',
        riskLevel: analysis.riskLevel || 'medium',
        keywords: analysis.keywords || [],
        sentiment: analysis.sentiment || 'neutral',
      };
    } catch (error) {
      console.error('Error in AI classification:', error);
      // Return default classification if AI fails
      return {
        type: 'reclamo',
        confidence: 0.5,
        category: 'general',
        priority: 'normal',
        riskLevel: 'medium',
        keywords: [],
        sentiment: 'neutral',
      };
    }
  }

  async suggestResponse(complaintText: string, complaintType: 'reclamo' | 'queja'): Promise<string> {
    try {
      const prompt = `
Como experto en atención al cliente y derecho del consumidor peruano, redacta una respuesta profesional para esta ${complaintType}.

Texto del ${complaintType}: "${complaintText}"

La respuesta debe:
1. Ser empática y profesional
2. Cumplir con DS 011-2011-PCM y DS 101-2022-PCM
3. No admitir responsabilidad automáticamente
4. Ofrecer soluciones concretas cuando sea apropiado
5. Mencionar pasos a seguir
6. Incluir información de contacto para seguimiento
7. Ser clara y en español formal peruano

Máximo 300 palabras.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "Eres un especialista en atención al cliente y cumplimiento legal en Perú. Redactas respuestas que cumplen con la normativa de protección al consumidor."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 500,
      });

      return response.choices[0].message.content || 'No se pudo generar una respuesta. Por favor, redacte manualmente.';
    } catch (error) {
      console.error('Error generating AI response:', error);
      return 'No se pudo generar una respuesta automática. Por favor, redacte manualmente la respuesta considerando la normativa vigente.';
    }
  }

  async analyzeComplaintTrends(complaints: string[]): Promise<any> {
    try {
      const prompt = `
Analiza las siguientes reclamaciones para identificar patrones y tendencias:

${complaints.map((complaint, index) => `${index + 1}. ${complaint}`).join('\n')}

Proporciona un análisis en formato JSON con:
- commonIssues: problemas más frecuentes
- categories: categorías de problemas identificadas
- severity: evaluación de severidad general
- recommendations: recomendaciones para el negocio
- riskAreas: áreas de riesgo identificadas
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "Eres un analista de datos especializado en atención al cliente y mejora de procesos comerciales en Perú."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('Error analyzing complaint trends:', error);
      return {
        commonIssues: [],
        categories: [],
        severity: 'medium',
        recommendations: [],
        riskAreas: [],
      };
    }
  }
}

export const aiService = new AIService();

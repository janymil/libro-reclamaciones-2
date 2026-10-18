import type { Express } from "express";
import { z } from "zod";

import { buildConsumerDraftContext } from "@shared/consumer-draft-context";
import type { Complaint } from "@shared/schema";
import { PERU_TIME_ZONE, startOfPeruMonth } from "@shared/peru-time";
import { aiService, getAIHealth } from "../services/aiService";
import { toPublicAIStatus } from "../services/statusService";
import type { ResponseLength, ResponseTone } from "../services/aiService";
import { renderComplaintAIContext } from "../services/complaintAIContext";
import { rankSlaRisk } from "../services/slaPredictionService";
import { hasFeature } from "../services/subscriptionService";
import { requireAuth } from "../middleware/requireAuth";
import { aiLimiter, publicAiLimiter } from "../middleware/rateLimits";
import { consumeCaptchaToken, verifyCaptcha } from "../services/captchaService";
import { emailService } from "../services/emailService";
import { pdfService } from "../services/pdfService";
import { storage } from "../storage";

const TONES = new Set<ResponseTone>(['empatico', 'formal', 'firme']);
const LENGTHS = new Set<ResponseLength>(['breve', 'estandar', 'detallada']);

/**
 * Reusable 402 for the AI features that only Pro and up include
 * (`aiDrafting` in shared/plans.ts: drafting, SLA prediction, trends, similar
 * cases, case summary and abusive-clause review).
 */
const AI_DRAFTING_REQUIRED = {
  message:
    "Esta función de IA está disponible desde el plan Pro. Mejore su plan en \"Plan y Cuotas\".",
  code: "plan_upgrade_required",
};

/**
 * Loads the complaint referenced by `complaintId` from the DATABASE, scoped to
 * the caller's business, instead of trusting complaint fields sent by the
 * browser. Returns:
 *   - null      -> the request carried no `complaintId` (manual text mode)
 *   - undefined -> the id does not exist or belongs to another tenant
 */
async function loadComplaintForAI(req: any): Promise<Complaint | null | undefined> {
  const id = typeof req.body?.complaintId === "string" ? req.body.complaintId.trim() : "";
  if (!id) {
    return null;
  }

  const complaint = await storage.getComplaint(id);
  if (!complaint || complaint.businessId !== req.user.businessId) {
    return undefined;
  }

  return complaint;
}

/**
 * AI assisted complaint classification, response drafting and trend analysis.
 * Every response includes a `source` field ("ai" | "fallback") so the client
 * can tell the user when local heuristics were used instead of a real model.
 */
export function registerAiRoutes(app: Express): void {
  // Provider configuration + a real (cached) connectivity probe.
  app.get('/api/ai/status', requireAuth, async (_req, res) => {
    const health = await getAIHealth();
    // Public shape only: provider, model and fallback are internal details.
    res.json(toPublicAIStatus(health));
  });

  app.post('/api/ai/classify', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const complaint = await loadComplaintForAI(req);
      if (complaint === undefined) {
        return res.status(404).json({ message: "Reclamación no encontrada" });
      }

      const typedText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      // The record metadata comes from the database, never from the browser.
      const input = complaint
        ? `${renderComplaintAIContext(complaint)}\n\n[Texto a analizar]\n${typedText || complaint.complaintDetail}`
        : typedText;

      if (!input) {
        return res.status(400).json({ message: "Text is required" });
      }

      const classification = await aiService.classifyComplaint(input, {
        businessId: req.user.businessId,
        userId: req.user.id,
        feature: 'classification',
      });
      res.json(classification);
    } catch (error) {
      console.error('Error classifying complaint:', error);
      res.status(500).json({ message: "Failed to classify complaint" });
    }
  });

  app.post('/api/ai/suggest-response', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'aiDrafting'))) {
        return res.status(402).json(AI_DRAFTING_REQUIRED);
      }

      const complaint = await loadComplaintForAI(req);
      if (complaint === undefined) {
        return res.status(404).json({ message: "Reclamación no encontrada" });
      }

      const { complaintText, complaintType } = req.body;
      // The stored record wins over the browser's copy of the type.
      const type = complaint
        ? (complaint.complaintType === 'queja' ? 'queja' : 'reclamo')
        : complaintType;
      const input = complaint
        ? `${renderComplaintAIContext(complaint)}\n\n[Detalle de la reclamación]\n${
            (typeof complaintText === 'string' && complaintText.trim()) || complaint.complaintDetail
          }`
        : complaintText;

      if (!input || !type) {
        return res.status(400).json({ message: "Complaint text and type are required" });
      }

      const tone = TONES.has(req.body.tone) ? (req.body.tone as ResponseTone) : undefined;
      const length = LENGTHS.has(req.body.length) ? (req.body.length as ResponseLength) : undefined;

      // Brand voice (Phase 3.10): drafts follow the business's own tone and
      // policies configured in Personalización.
      const config = await storage.getLibroConfiguration(req.user.businessId);
      const brandContext = config
        ? { brandTone: config.brandTone, brandPolicies: config.brandPolicies }
        : undefined;

      const { suggestion, source } = await aiService.suggestResponse(
        input,
        type,
        brandContext,
        { tone, length },
        { businessId: req.user.businessId, userId: req.user.id, feature: 'draft' },
      );
      res.json({ suggestion, source, tone: tone ?? null, length: length ?? null });
    } catch (error) {
      console.error('Error generating response suggestion:', error);
      res.status(500).json({ message: "Failed to generate response suggestion" });
    }
  });

  // Abusive-clause detection (Phase 3.11): paste contract terms or conditions
  // and get them reviewed against arts. 49 y 50 of the Consumer Protection Code.
  app.post('/api/ai/abusive-clauses', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'aiDrafting'))) {
        return res.status(402).json(AI_DRAFTING_REQUIRED);
      }

      const { text } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length < 20) {
        return res.status(400).json({ message: "Se requiere el texto del contrato (mínimo 20 caracteres)" });
      }

      const analysis = await aiService.detectAbusiveClauses(text, {
        businessId: req.user.businessId,
        userId: req.user.id,
        feature: 'abusive_clauses',
      });
      res.json(analysis);
    } catch (error) {
      console.error('Error detecting abusive clauses:', error);
      res.status(500).json({ message: "Failed to analyze clauses" });
    }
  });

  // Executive case summary (Phase 3.11): the 30-second brief for managers.
  app.post('/api/ai/case-summary', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'aiDrafting'))) {
        return res.status(402).json(AI_DRAFTING_REQUIRED);
      }

      const { complaintId } = req.body;

      const complaint = await storage.getComplaint(complaintId);
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      const caseText = [
        `Correlativo: ${complaint.correlativeNumber}`,
        `Tipo: ${complaint.complaintType} (prioridad ${complaint.priority})`,
        `Estado: ${complaint.status}`,
        `Producto/Servicio: ${complaint.productServiceName}`,
        // No consumer name/document: the model does not need it, and the
        // provider should not receive PII it cannot use.
        `Detalle: ${complaint.complaintDetail}`,
        `Pedido del consumidor: ${complaint.consumerRequest ?? 'No especificado'}`,
        `Respuesta enviada: ${complaint.providerResponse ?? 'Aún sin respuesta'}`,
      ].join('\n');

      const summary = await aiService.generateCaseSummary(caseText, {
        businessId: req.user.businessId,
        userId: req.user.id,
        feature: 'case_summary',
      });
      res.json(summary);
    } catch (error) {
      console.error('Error generating case summary:', error);
      res.status(500).json({ message: "Failed to generate case summary" });
    }
  });

  // Trend analysis over the business's open complaints (was previously dead
  // code in aiService with no route or UI).
  app.post('/api/ai/trends', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      if (!(await hasFeature(req.user.businessId, 'aiDrafting'))) {
        return res.status(402).json(AI_DRAFTING_REQUIRED);
      }

      const complaints = await storage.getComplaintsByBusiness(req.user.businessId);
      const openComplaints = complaints
        .filter((complaint) => complaint.status === 'new' || complaint.status === 'in_progress')
        .slice(0, 50)
        .map((complaint) => complaint.complaintDetail);

      const trends = await aiService.analyzeComplaintTrends(openComplaints, {
        businessId: req.user.businessId,
        userId: req.user.id,
        feature: 'trends',
      });
      res.json({ ...trends, analyzedCount: openComplaints.length });
    } catch (error) {
      console.error('Error analyzing complaint trends:', error);
      res.status(500).json({ message: "Failed to analyze complaint trends" });
    }
  });

  // SLA-breach prediction: ranks open complaints by risk of missing the
  // 15-business-day legal deadline (DS 101-2022-PCM). Deterministic scoring -
  // no upstream AI call, so it is free and instant.
  app.get('/api/ai/sla-prediction', requireAuth, async (req: any, res) => {
    try {
      // Plans list SLA prediction under aiDrafting (Pro and up), so the route
      // must enforce the same boundary as the UI.
      if (!(await hasFeature(req.user.businessId, 'aiDrafting'))) {
        return res.status(402).json(AI_DRAFTING_REQUIRED);
      }

      const complaints = await storage.getComplaintsByBusiness(req.user.businessId);
      const open = complaints.filter(
        (complaint) => complaint.status === 'new' || complaint.status === 'in_progress'
      );
      const assessments = rankSlaRisk(open);

      res.json({
        assessments,
        summary: {
          total: open.length,
          highRisk: assessments.filter((assessment) => assessment.riskLevel === 'high').length,
          mediumRisk: assessments.filter((assessment) => assessment.riskLevel === 'medium').length,
        },
      });
    } catch (error) {
      console.error('Error predicting SLA risk:', error);
      res.status(500).json({ message: "Failed to predict SLA risk" });
    }
  });

  // Consumer-side form assistant: public (no auth) but strictly rate-limited,
  // and gated by the proof-of-work CAPTCHA. Every accepted call spends money on
  // an upstream model, so this is the public endpoint where a challenge pays for
  // itself: without one, a script can drain the AI budget from a single IP.
  //
  // The challenge is solved on demand (the button fetches and solves it), so it
  // always opts out of the dwell-time rule: a deployment-wide
  // CAPTCHA_MIN_DWELL_MS would otherwise break this endpoint, whose visitors
  // legitimately solve and submit in the same interaction.
  app.post('/api/ai/public/assist', publicAiLimiter, async (req: any, res) => {
    try {
      const { text } = req.body;

      const captcha = verifyCaptcha(req.body.captchaToken, req.body.captchaAnswer, { minDwellMs: 0 });
      if (!captcha.ok) {
        return res.status(400).json({ message: captcha.reason, code: "captcha_invalid" });
      }

      if (!text || typeof text !== 'string' || text.trim().length < 10) {
        return res.status(400).json({
          message: "Se requiere el texto del borrador (mínimo 10 caracteres)",
        });
      }

      // Single-use, and burned only now that the request is going to cost
      // something: a rejected draft must not force the visitor to re-solve.
      consumeCaptchaToken(req.body.captchaToken);

      // The visitor normally filled in the product, the amount, the purchase date
      // and the receipt number in the fields above the textarea. The assistant
      // used to see the textarea alone, so it reported as "missing" what the form
      // already held. The snapshot is sanitized here against the shared whitelist,
      // which is what keeps the visitor's personal data (name, document, address,
      // phone, e-mail) out of the prompt no matter what the caller sends.
      const context = buildConsumerDraftContext(req.body.context);

      const assistance = await aiService.assistConsumerDraft(text, context, {
        businessId: null,
        feature: 'public_assist',
      });
      res.json(assistance);
    } catch (error) {
      console.error('Error assisting consumer draft:', error);
      res.status(500).json({ message: "Failed to assist draft" });
    }
  });

  // Public-form autofill: same CAPTCHA gate and rate limit as the draft review.
  app.post('/api/ai/public/extract', publicAiLimiter, async (req: any, res) => {
    try {
      const { text } = req.body;

      const captcha = verifyCaptcha(req.body.captchaToken, req.body.captchaAnswer, { minDwellMs: 0 });
      if (!captcha.ok) {
        return res.status(400).json({ message: captcha.reason, code: "captcha_invalid" });
      }

      if (!text || typeof text !== 'string' || text.trim().length < 20) {
        return res.status(400).json({
          message: "Se requiere el texto del reclamo (mínimo 20 caracteres)",
        });
      }

      consumeCaptchaToken(req.body.captchaToken);

      const fields = await aiService.extractComplaintFields(text, {
        businessId: null,
        feature: 'public_extract',
      });
      res.json(fields);
    } catch (error) {
      console.error('Error extracting complaint fields:', error);
      res.status(500).json({ message: "Failed to extract fields" });
    }
  });

  // Onboarding assistant: describe the business -> brand voice + templates.
  // Available to an authenticated account even before the tenant exists (the
  // wizard calls it), so it has no plan gate; only aiLimiter applies.
  app.post('/api/ai/onboarding', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const schema = z.object({
        description: z.string().trim().min(20).max(2000),
        businessName: z.string().trim().max(200).optional(),
        businessType: z.string().trim().max(50).optional(),
      });
      const body = schema.parse(req.body);

      const kit = await aiService.generateOnboardingKit(body, {
        businessId: req.user.businessId ?? null,
        userId: req.user.id,
        feature: 'onboarding',
      });
      res.json(kit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Describa su negocio (mínimo 20 caracteres)." });
      }
      console.error('Error generating onboarding kit:', error);
      res.status(500).json({ message: "No se pudo generar la propuesta con IA" });
    }
  });

  // Monthly executive report (Pro): aggregates + redacted narratives -> AI brief
  // -> PDF, optionally e-mailed to the requesting user.
  app.post('/api/ai/executive-report', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      for (const feature of ['aiDrafting', 'reports'] as const) {
        if (!(await hasFeature(req.user.businessId, feature))) {
          return res.status(402).json(AI_DRAFTING_REQUIRED);
        }
      }

      const body = z
        .object({
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          sendEmail: z.boolean().optional(),
        })
        .parse(req.body ?? {});

      const selected = body.month ? new Date(`${body.month}-01T12:00:00-05:00`) : new Date();
      if (Number.isNaN(selected.getTime())) {
        return res.status(400).json({ message: "Mes inválido" });
      }

      const start = startOfPeruMonth(selected);
      const end = startOfPeruMonth(start, 1);
      const periodLabel = new Intl.DateTimeFormat('es-PE', {
        month: 'long',
        year: 'numeric',
        timeZone: PERU_TIME_ZONE,
      }).format(start);

      const [business, complaints, monthly] = await Promise.all([
        storage.getBusiness(req.user.businessId),
        storage.getComplaintsByBusiness(req.user.businessId),
        storage.getMonthlyReports(req.user.businessId),
      ]);

      const inPeriod = complaints.filter(
        (complaint) =>
          new Date(complaint.submissionDate) >= start && new Date(complaint.submissionDate) < end,
      );
      const answered = inPeriod.filter((complaint) => Boolean(complaint.providerResponse));
      const onTime = answered.filter(
        (complaint) =>
          complaint.responseDate &&
          new Date(complaint.responseDate).getTime() <= new Date(complaint.dueDate).getTime(),
      );
      const responseDays = answered
        .filter((complaint) => complaint.responseDate)
        .map(
          (complaint) =>
            (new Date(complaint.responseDate as Date).getTime() -
              new Date(complaint.submissionDate).getTime()) /
            86_400_000,
        );

      const productMap = new Map<string, { name: string; total: number; overdue: number }>();
      for (const complaint of inPeriod) {
        const name = complaint.productServiceName?.trim() || 'Sin producto/servicio';
        const entry = productMap.get(name) ?? { name, total: 0, overdue: 0 };
        entry.total += 1;
        if (complaint.isOverdue) entry.overdue += 1;
        productMap.set(name, entry);
      }
      const topProducts = [...productMap.values()]
        .sort((a, b) => b.total - a.total || b.overdue - a.overdue)
        .slice(0, 8);

      const report = await aiService.generateExecutiveReport(
        {
          periodLabel,
          stats: {
            total: inPeriod.length,
            open: inPeriod.filter(
              (complaint) => complaint.status === 'new' || complaint.status === 'in_progress',
            ).length,
            overdue: inPeriod.filter((complaint) => complaint.isOverdue).length,
            resolved: inPeriod.filter((complaint) => complaint.status === 'resolved').length,
            answered: answered.length,
            slaOnTimeRate:
              answered.length > 0 ? Math.round((onTime.length / answered.length) * 100) : null,
            averageResponseDays:
              responseDays.length > 0
                ? Math.round((responseDays.reduce((sum, days) => sum + days, 0) / responseDays.length) * 10) / 10
                : 0,
          },
          previousMonth: monthly.length > 1 ? monthly[1] : null,
          topProducts,
          complaints: inPeriod.map(
            (complaint) =>
              `${complaint.correlativeNumber}: ${complaint.complaintDetail} | Pedido: ${complaint.consumerRequest ?? 'no especificado'}`,
          ),
        },
        { businessId: req.user.businessId, userId: req.user.id, feature: 'executive_report' },
      );

      const pdf = business
        ? await pdfService.generateExecutiveReportPdf(report, business, periodLabel, start, end)
        : null;

      let emailedTo: string | null = null;
      if (body.sendEmail && pdf && business) {
        const config = await storage.getLibroConfiguration(req.user.businessId);
        const recipient = req.user.email || config?.notificationEmail;
        if (recipient) {
          try {
            await emailService.sendExecutiveReport(recipient, business.businessName, periodLabel, pdf, report);
            emailedTo = recipient;
          } catch (emailError) {
            // The report itself is valid: return it with `emailedTo: null`
            // instead of losing it because SMTP is down.
            console.error('Could not e-mail the executive report:', emailError);
          }
        }
      }

      res.json({
        report,
        periodLabel,
        pdfBase64: pdf ? pdf.toString('base64') : null,
        emailedTo,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Mes inválido" });
      }
      console.error('Error generating executive report:', error);
      res.status(500).json({ message: "No se pudo generar el reporte ejecutivo" });
    }
  });

  // Per-tenant AI usage meter + feedback summary (last `days`).
  app.get('/api/ai/usage', requireAuth, async (req: any, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86_400_000);
      const [usage, feedback] = await Promise.all([
        storage.getAIUsageSummary(req.user.businessId, since),
        storage.getAIFeedbackSummary(req.user.businessId, since),
      ]);
      res.json({ days, since, usage, feedback });
    } catch (error) {
      console.error('Error reading AI usage:', error);
      res.status(500).json({ message: "No se pudo leer el consumo de IA" });
    }
  });

  // Draft feedback loop: thumbs up/down and one-click acceptance.
  app.post('/api/ai/feedback', requireAuth, async (req: any, res) => {
    try {
      const body = z
        .object({
          feature: z.string().trim().min(2).max(50),
          rating: z.union([z.literal(1), z.literal(-1)]),
          comment: z.string().trim().max(500).optional(),
          complaintId: z.string().uuid().optional(),
        })
        .parse(req.body);
      if (!req.user.businessId) {
        return res.status(400).json({ message: "Su usuario no está asociado a una empresa." });
      }

      await storage.createAIFeedback({
        businessId: req.user.businessId,
        userId: req.user.id,
        feature: body.feature,
        rating: body.rating,
        comment: body.comment ?? null,
        complaintId: body.complaintId ?? null,
      });
      res.status(201).json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Valoración inválida" });
      }
      console.error('Error recording AI feedback:', error);
      res.status(500).json({ message: "No se pudo registrar la valoración" });
    }
  });
}


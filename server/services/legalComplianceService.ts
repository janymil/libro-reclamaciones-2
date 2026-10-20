import { storage } from "../storage";
import type { ComplianceReport, ComplianceStandard } from "../storage/types";
import { businessDayCalculator } from "./businessDayCalculator";
import { shiftPeruCalendarDate } from "@shared/peru-time";
import { RNPD_PROCEDURE_URL, rnpdCodeFromNotes } from "@shared/rnpd";

interface ComplianceCheck {
  type: string;
  status: 'compliant' | 'pending' | 'overdue' | 'not_applicable';
  description: string;
  dueDate?: Date;
  actions: string[];
}

class LegalComplianceService {
  async checkDs011Compliance(businessId: string): Promise<ComplianceCheck> {
    // DS 011-2011-PCM - Reglamento del Libro de Reclamaciones.
    // Evidence: every active establishment must be able to exhibit its own
    // register, and `books` is created together with the establishment.
    const [establishments, books] = await Promise.all([
      storage.getEstablishmentsByBusiness(businessId),
      storage.getBooks(businessId),
    ]);

    const establishmentsWithBook = new Set(books.map((book) => book.establishmentId));
    const missingBooks = establishments.filter(
      (establishment) => !establishmentsWithBook.has(establishment.id),
    );
    const compliant = establishments.length > 0 && missingBooks.length === 0;

    return {
      type: 'ds_011_2011_pcm',
      status: compliant ? 'compliant' : 'pending',
      description: 'Reglamento del Libro de Reclamaciones - DS 011-2011-PCM',
      actions: compliant ? [
        'Mantener el Libro disponible en todos los establecimientos',
        'Exhibir el Aviso Oficial (Anexo II) y contar con hojas físicas de respaldo ante cortes de luz o internet (Art. 4-A)',
        'Conservar hojas de reclamación por 2 años',
        'Actualizar avisos si hay cambios normativos',
      ] : establishments.length === 0 ? [
        'Registrar al menos un establecimiento',
        'Configurar el Libro de Reclamaciones',
        'Instalar aviso visible y hojas físicas de respaldo en establecimiento',
      ] : [
        `Crear el Libro de Reclamaciones de ${missingBooks.length} local(es)`,
        'Exportar el registro de cada local para una inspección',
        'Verificar que cada local figure como activo',
      ],
    };
  }

  async checkDs101Compliance(businessId: string): Promise<ComplianceCheck> {
    // Plazo de 15 días hábiles: art. 152 del Código, modificado por la Ley
    // N.° 31435 (vigente desde el 21/05/2022). El DS 101-2022-PCM solo adecúa el
    // Reglamento; el tipo se conserva por compatibilidad con la API y la BD.
    const complaints = await storage.getComplaintsByBusiness(businessId);
    const overdueComplaints = complaints.filter(c =>
      businessDayCalculator.isComplaintOverdue(c.submissionDate, c.responseDate ?? undefined)
    );

    // No complaints = nothing to be on time for. Reporting this as "compliant"
    // rewarded a business for having no data.
    if (complaints.length === 0) {
      return {
        type: 'ds_101_2022_pcm',
        status: 'not_applicable',
        description: 'Respuesta en 15 días hábiles improrrogables (art. 152 del Código, Ley N.° 31435)',
        actions: ['Sin acción por ahora: el plazo se evaluará cuando reciba su primer reclamo'],
      };
    }

    return {
      type: 'ds_101_2022_pcm',
      status: overdueComplaints.length === 0 ? 'compliant' : 'overdue',
      description: 'Respuesta en 15 días hábiles improrrogables (art. 152 del Código, Ley N.° 31435)',
      actions: overdueComplaints.length > 0 ? [
        `Responder ${overdueComplaints.length} reclamaciones vencidas`,
        'Implementar sistema de alertas automáticas',
        'Capacitar personal en plazos legales'
      ] : [
        'Mantener respuestas dentro del plazo de 15 días hábiles',
        'Monitorear alertas de vencimiento',
        'Documentar todas las respuestas'
      ]
    };
  }

  async checkLey29733Compliance(businessId: string): Promise<ComplianceCheck> {
    // Ley 29733 + DS 016-2024-JUS - Protección de Datos Personales.
    //
    // Two duties, both required: the internal register of processing activities
    // (`data_processing_activities`, written by the UI) and the inscription of
    // the data bank in the RNPD (`compliance_tracking.rnpd_registration`, which
    // the business files itself at the SIPDP). Treating either one as the whole
    // obligation is what made the assistant look like a State registration, so
    // this check is compliant only when BOTH are done.
    const [complianceTracking, activities] = await Promise.all([
      storage.getComplianceTracking(businessId),
      storage.getDataProcessingActivities(businessId),
    ]);
    const rnpdRegistration = complianceTracking.find(c => c.complianceType === 'rnpd_registration');

    // DS 016-2024-JUS entered into force on 30/03/2025, so the obligation applies.
    const enforcementDate = new Date('2025-03-30');

    const registered = activities.length > 0;
    const inscribed = rnpdRegistration?.status === 'compliant';

    const description =
      'Ley de Protección de Datos Personales - Ley 29733 + DS 016-2024-JUS: registro de actividades ' +
      'de tratamiento e inscripción del banco de datos en el RNPD (SIPDP)';

    if (registered && inscribed) {
      return {
        type: 'ley_29733',
        status: 'compliant',
        description,
        dueDate: enforcementDate,
        actions: [
          'Mantener actualizado el registro de actividades de tratamiento',
          'Actualizar la inscripción si cambia el banco de datos o el encargado',
          'Revisar la Política de Privacidad al cambiar los tratamientos',
          'Atender los derechos ARCO dentro del plazo legal',
        ],
      };
    }

    return {
      type: 'ley_29733',
      status: 'pending',
      description,
      dueDate: enforcementDate,
      actions: [
        ...(registered ? [] : ['Confirmar el registro de actividades de tratamiento (un clic en Cumplimiento)']),
        ...(inscribed ? [] : ['Inscribir el banco de datos en el RNPD por el SIPDP: gratuito, lo presenta la empresa']),
        'Actualizar la Política de Privacidad según el DS 016-2024-JUS',
        'Implementar procedimientos para derechos ARCO',
        'Capacitar al personal en protección de datos',
        'Designar Oficial de Protección de Datos si aplica',
        'Implementar la notificación de incidentes de seguridad a la ANPD y a los titulares',
      ],
    };
  }

  async checkAnexo1Compliance(businessId: string): Promise<ComplianceCheck> {
    // Anexo 1 - Campos obligatorios en hoja de reclamación
    const complaints = await storage.getComplaintsByBusiness(businessId);
    const incompleteComplaints = complaints.filter(c => 
      !c.consumerFullName || 
      !c.consumerDocumentNumber || 
      !c.consumerAddress || 
      !c.consumerPhone || 
      !c.consumerEmail ||
      !c.productServiceName ||
      !c.complaintDetail
    );
    
    return {
      type: 'anexo_1_campos',
      status: incompleteComplaints.length === 0 ? 'compliant' : 'pending',
      description: 'Campos obligatorios según Anexo 1 - DS 011-2011-PCM',
      actions: incompleteComplaints.length > 0 ? [
        `Completar información faltante en ${incompleteComplaints.length} reclamaciones`,
        'Validar formulario web para campos obligatorios',
        'Capacitar personal en recolección de datos'
      ] : [
        'Mantener validación de campos obligatorios',
        'Verificar integridad de datos periódicamente',
        'Actualizar formularios si hay cambios normativos'
      ]
    };
  }

  async checkRetentionCompliance(businessId: string): Promise<ComplianceCheck> {
    // Retención de 2 años según DS 011-2011-PCM
    const twoYearsAgo = shiftPeruCalendarDate(new Date(), { years: -2 });
    
    const complaints = await storage.getComplaintsByBusiness(businessId);
    const oldComplaints = complaints.filter(c => c.submissionDate < twoYearsAgo);
    
    return {
      type: 'retention_policy',
      status: 'compliant', // Assuming proper retention is in place
      description: 'Conservación de hojas por 2 años - DS 011-2011-PCM',
      actions: [
        'Mantener sistema de retención automática',
        'Archivar reclamaciones antigas de forma segura',
        'Implementar borrado seguro después de 2 años',
        oldComplaints.length > 0 ? `Revisar ${oldComplaints.length} reclamaciones que han cumplido 2 años` : 'Continuar con política de retención'
      ]
    };
  }

  async performFullComplianceCheck(businessId: string): Promise<ComplianceCheck[]> {
    const checks = await Promise.all([
      this.checkDs011Compliance(businessId),
      this.checkDs101Compliance(businessId),
      this.checkLey29733Compliance(businessId),
      this.checkAnexo1Compliance(businessId),
      this.checkRetentionCompliance(businessId),
    ]);
    
    return checks;
  }

  async generateComplianceReport(businessId: string) {
    const checks = await this.performFullComplianceCheck(businessId);
    const business = await storage.getBusiness(businessId);
    
    return {
      businessId,
      businessName: business?.businessName,
      reportDate: new Date(),
      complianceChecks: checks,
      overallStatus: this.calculateOverallStatus(checks),
      criticalIssues: checks.filter(c => c.status === 'overdue').length,
      pendingActions: checks.reduce((acc, check) => acc + check.actions.length, 0),
      recommendations: this.generateRecommendations(checks),
    };
  }

  /**
   * Compliance statuses derived from the tenant's REAL data. This is what the
   * dashboard card, the reports page and the compliance PDF show.
   *
   * Why not the `compliance_tracking` checklist: nothing in the app ever writes
   * to it, so reading it always produced three `false` values and a 0%
   * "riesgo de incumplimiento" for every business, including one with zero
   * complaints.
   *
   * A standard with no data is `not_applicable`, never `compliant`: a business
   * with zero complaints cannot claim it "meets the 15-day deadline", and
   * counting it inflated a brand-new tenant to 67%.
   */
  async buildComplianceReport(businessId: string): Promise<ComplianceReport> {
    const [establishments, books, complaints, activities, tracking] = await Promise.all([
      storage.getEstablishmentsByBusiness(businessId),
      storage.getBooks(businessId),
      storage.getComplaintsByBusiness(businessId),
      storage.getDataProcessingActivities(businessId),
      storage.getComplianceTracking(businessId),
    ]);

    const overdueComplaints = complaints.filter((complaint) =>
      businessDayCalculator.isComplaintOverdue(
        complaint.submissionDate,
        complaint.responseDate ?? undefined,
      ),
    );

    const establishmentsWithBook = new Set(books.map((book) => book.establishmentId));
    const missingBooks = establishments.filter(
      (establishment) => !establishmentsWithBook.has(establishment.id),
    );

    const standards: ComplianceStandard[] = [];

    // DS 011-2011-PCM: every active establishment must exhibit its own register.
    if (establishments.length === 0) {
      standards.push({
        id: 'ds_011',
        label: 'DS 011-2011-PCM · Libro de Reclamaciones',
        status: 'pending',
        detail: 'No tienes locales activos, así que el Libro no está publicado.',
        action: 'Registra tu primer local para habilitar el Libro de Reclamaciones.',
        href: '/sucursales',
      });
    } else if (missingBooks.length > 0) {
      standards.push({
        id: 'ds_011',
        label: 'DS 011-2011-PCM · Libro de Reclamaciones',
        status: 'pending',
        detail: `${missingBooks.length} de ${establishments.length} local(es) no tienen su propio Libro.`,
        action: `Crea el Libro de Reclamaciones de ${missingBooks.length} local(es).`,
        href: '/libros',
      });
    } else {
      standards.push({
        id: 'ds_011',
        label: 'DS 011-2011-PCM · Libro de Reclamaciones',
        status: 'compliant',
        detail: `Libro publicado en ${establishments.length} local(es).`,
        action: null,
        href: null,
      });
    }

    // Ley N.° 29571 art. 152 (Ley N.° 31435): 15 business days to answer.
    if (complaints.length === 0) {
      standards.push({
        id: 'ds_101',
        label: 'Plazo legal de 15 días hábiles',
        status: 'not_applicable',
        detail: 'Aún no hay reclamos: el plazo se evaluará cuando reciba el primero.',
        action: null,
        href: null,
      });
    } else if (overdueComplaints.length > 0) {
      standards.push({
        id: 'ds_101',
        label: 'Plazo legal de 15 días hábiles',
        status: 'overdue',
        detail: `${overdueComplaints.length} de ${complaints.length} reclamo(s) pasaron el plazo legal.`,
        action: `Responde los ${overdueComplaints.length} reclamo(s) vencido(s).`,
        href: '/reclamos',
      });
    } else {
      standards.push({
        id: 'ds_101',
        label: 'Plazo legal de 15 días hábiles',
        status: 'compliant',
        detail: `${complaints.length} reclamo(s) recibidos, ninguno fuera de plazo.`,
        action: null,
        href: null,
      });
    }

    // Ley 29733 + DS 016-2024-JUS: TWO duties that used to be scored as one.
    // Merging them made a single click on the internal register look like the
    // RNPD inscription was done, which is exactly the misleading state a client
    // would quote back at us. They are now separate rows:
    //   ley_29733 -> internal register of processing activities (derived from
    //                the app, confirmed with one click);
    //   rnpd      -> the inscription the business files itself at the SIPDP.
    const rnpdRow = tracking.find((item) => item.complianceType === 'rnpd_registration');
    const rnpdRegistered = rnpdRow?.status === 'compliant';
    const rnpdCode = rnpdCodeFromNotes(rnpdRow?.notes);

    if (activities.length > 0) {
      standards.push({
        id: 'ley_29733',
        label: 'Ley 29733 · Registro de actividades de tratamiento',
        status: 'compliant',
        detail: `Registro interno confirmado: ${activities.length} actividad(es) derivadas del Libro de Reclamaciones.`,
        action: null,
        href: null,
      });
    } else {
      standards.push({
        id: 'ley_29733',
        label: 'Ley 29733 · Registro de actividades de tratamiento',
        status: 'pending',
        detail:
          'Falta tu registro interno: qué datos personales tratas, para qué, por cuánto tiempo y con qué medidas de seguridad.',
        action:
          'Confírmalo en un clic: la plataforma ya conoce los datos que recoge tu Libro, no tienes que escribirlos.',
        href: '/cumplimiento',
        actionTarget: 'rnpd-assistant',
      });
    }

    if (rnpdRegistered) {
      standards.push({
        id: 'rnpd',
        label: 'Inscripción del banco de datos en el RNPD (SIPDP)',
        status: 'compliant',
        detail: rnpdCode
          ? `Tu empresa declaró la inscripción. Código del banco de datos: ${rnpdCode}.`
          : 'Tu empresa declaró haber inscrito el banco de datos en el SIPDP.',
        action: null,
        href: null,
      });
    } else {
      standards.push({
        id: 'rnpd',
        label: 'Inscripción del banco de datos en el RNPD (SIPDP)',
        status: 'pending',
        detail: rnpdRow
          ? 'Tu empresa indicó que todavía no inscribe el banco de datos ante la ANPD.'
          : 'Aún no nos has dicho si tu empresa inscribió el banco de datos del Libro.',
        action:
          'La inscripción la presenta tu empresa en el SIPDP: es gratuita y de aprobación automática. Al terminar obtienes la constancia y el código del banco de datos.',
        href: null,
        external: {
          href: RNPD_PROCEDURE_URL,
          label: 'Ver el trámite en gob.pe',
        },
      });
    }

    const applicableStandards = standards.filter(
      (standard) => standard.status !== 'not_applicable',
    ).length;
    const compliantStandards = standards.filter(
      (standard) => standard.status === 'compliant',
    ).length;
    const nextActions = standards
      .map((standard) => standard.action)
      .filter((action): action is string => Boolean(action));

    const overdueItems = tracking.filter(
      (item) =>
        item.status !== 'compliant' &&
        item.dueDate &&
        new Date(item.dueDate) < new Date(),
    );

    return {
      standards,
      applicableStandards,
      compliantStandards,
      checklistItems: tracking.length,
      nextActions,
      overdueItems,
      rnpd: {
        registered: rnpdRegistered,
        answered: Boolean(rnpdRow),
        code: rnpdCode,
        completedDate: rnpdRow?.completedDate
          ? new Date(rnpdRow.completedDate).toISOString()
          : null,
      },
    };
  }

  private calculateOverallStatus(checks: ComplianceCheck[]): 'compliant' | 'partial' | 'non_compliant' {
    const overdueCount = checks.filter(c => c.status === 'overdue').length;
    const pendingCount = checks.filter(c => c.status === 'pending').length;
    
    if (overdueCount > 0) return 'non_compliant';
    if (pendingCount > 0) return 'partial';
    return 'compliant';
  }

  private generateRecommendations(checks: ComplianceCheck[]): string[] {
    const recommendations: string[] = [];
    
    // Priority recommendations based on legal risks
    const overdueChecks = checks.filter(c => c.status === 'overdue');
    if (overdueChecks.length > 0) {
      recommendations.push('URGENTE: Resolver inmediatamente los incumplimientos vencidos para evitar sanciones de INDECOPI');
    }
    
    const ley29733Check = checks.find(c => c.type === 'ley_29733');
    if (ley29733Check?.status === 'pending') {
      recommendations.push(
        'Confirmar el registro de actividades de tratamiento e inscribir el banco de datos en el RNPD (SIPDP)',
      );
    }
    if (ley29733Check?.status === 'overdue') {
      recommendations.push('Regularizar el registro de actividades de tratamiento ante la autoridad de protección de datos');
    }
    
    const ds101Check = checks.find(c => c.type === 'ds_101_2022_pcm');
    if (ds101Check?.status !== 'compliant') {
      recommendations.push('Implementar sistema de alertas automáticas para el plazo de 15 días hábiles');
    }
    
    recommendations.push('Realizar auditorías mensuales de cumplimiento legal');
    recommendations.push('Capacitar regularmente al personal en normativa de protección al consumidor');
    
    return recommendations;
  }

  // Monitor deadlines and create alerts
  async monitorDeadlines(businessId: string): Promise<void> {
    const complaints = await storage.getComplaintsByBusiness(businessId);
    const currentDate = new Date();
    
    for (const complaint of complaints) {
      if (complaint.status === 'new' || complaint.status === 'in_progress') {
        const remainingDays = businessDayCalculator.getRemainingBusinessDays(complaint.dueDate, currentDate);
        
        // Create alerts based on remaining time
        if (remainingDays <= 1 && remainingDays > 0) {
          await storage.createNotification({
            businessId,
            type: 'deadline_urgent',
            title: 'Reclamación vence mañana',
            message: `La reclamación ${complaint.correlativeNumber} vence en ${remainingDays} día hábil`,
            relatedEntityType: 'complaint',
            relatedEntityId: complaint.id,
          });
        } else if (remainingDays <= 3 && remainingDays > 1) {
          await storage.createNotification({
            businessId,
            type: 'deadline_warning',
            title: 'Reclamación próxima a vencer',
            message: `La reclamación ${complaint.correlativeNumber} vence en ${remainingDays} días hábiles`,
            relatedEntityType: 'complaint',
            relatedEntityId: complaint.id,
          });
        } else if (remainingDays <= 0) {
          // Mark as overdue
          await storage.updateComplaint(complaint.id, { isOverdue: true });
          
          await storage.createNotification({
            businessId,
            type: 'deadline_overdue',
            title: 'Reclamación vencida',
            message: `La reclamación ${complaint.correlativeNumber} está vencida`,
            relatedEntityType: 'complaint',
            relatedEntityId: complaint.id,
          });
        }
      }
    }
  }
}

export const legalComplianceService = new LegalComplianceService();

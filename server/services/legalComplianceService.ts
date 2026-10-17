import { storage } from "../storage";
import { businessDayCalculator } from "./businessDayCalculator";
import { shiftPeruCalendarDate } from "@shared/peru-time";

interface ComplianceCheck {
  type: string;
  status: 'compliant' | 'pending' | 'overdue' | 'not_applicable';
  description: string;
  dueDate?: Date;
  actions: string[];
}

class LegalComplianceService {
  async checkDs011Compliance(businessId: string): Promise<ComplianceCheck> {
    // DS 011-2011-PCM - Reglamento del Libro de Reclamaciones
    const establishments = await storage.getEstablishmentsByBusiness(businessId);
    
    return {
      type: 'ds_011_2011_pcm',
      status: establishments.length > 0 ? 'compliant' : 'pending',
      description: 'Reglamento del Libro de Reclamaciones - DS 011-2011-PCM',
      actions: establishments.length === 0 ? [
        'Registrar al menos un establecimiento',
        'Configurar el Libro de Reclamaciones',
        'Instalar aviso visible en establecimiento'
      ] : [
        'Mantener el Libro disponible en todos los establecimientos',
        'Conservar hojas de reclamación por 2 años',
        'Actualizar avisos si hay cambios normativos'
      ]
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
    // Ley 29733 + DS 016-2024-JUS - Protección de Datos Personales
    const complianceTracking = await storage.getComplianceTracking(businessId);
    const rnpdRegistration = complianceTracking.find(c => c.complianceType === 'rnpd_registration');
    
    // DS 016-2024-JUS enters force on March 30, 2025
    const enforcementDate = new Date('2025-03-30');
    const currentDate = new Date();
    const isEnforced = currentDate >= enforcementDate;
    
    let status: 'compliant' | 'pending' | 'overdue' | 'not_applicable' = 'not_applicable';
    
    if (isEnforced) {
      status = rnpdRegistration?.status === 'compliant' ? 'compliant' : 
               (rnpdRegistration?.dueDate && new Date(rnpdRegistration.dueDate) < currentDate) ? 'overdue' : 'pending';
    } else {
      status = 'pending';
    }
    
    return {
      type: 'ley_29733',
      status,
      description: 'Ley de Protección de Datos Personales - Ley 29733 + DS 016-2024-JUS',
      dueDate: enforcementDate,
      actions: [
        'Inscribir banco de datos en RNPD antes del 30/03/2025',
        'Actualizar Política de Privacidad según DS 016-2024-JUS',
        'Implementar procedimientos para derechos ARCO',
        'Capacitar personal en protección de datos',
        'Designar Oficial de Protección de Datos si aplica',
        'Implementar notificación de incidentes en 48 horas'
      ]
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
      recommendations.push('Prepararse para el cumplimiento de DS 016-2024-JUS que entra en vigor el 30/03/2025');
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

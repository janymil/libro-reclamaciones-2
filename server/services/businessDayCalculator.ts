// Business day calculator for Peru
// Excludes weekends and Peruvian national holidays

interface Holiday {
  date: string; // YYYY-MM-DD format
  name: string;
}

class BusinessDayCalculator {
  // 2024-2025 Peruvian national holidays
  private holidays: Holiday[] = [
    // 2024
    { date: '2024-01-01', name: 'Año Nuevo' },
    { date: '2024-03-28', name: 'Jueves Santo' },
    { date: '2024-03-29', name: 'Viernes Santo' },
    { date: '2024-05-01', name: 'Día del Trabajador' },
    { date: '2024-06-29', name: 'San Pedro y San Pablo' },
    { date: '2024-07-23', name: 'Día del Trabajador' },
    { date: '2024-07-28', name: 'Independencia del Perú' },
    { date: '2024-07-29', name: 'Independencia del Perú' },
    { date: '2024-08-30', name: 'Santa Rosa de Lima' },
    { date: '2024-10-08', name: 'Combate de Angamos' },
    { date: '2024-11-01', name: 'Todos los Santos' },
    { date: '2024-12-08', name: 'Inmaculada Concepción' },
    { date: '2024-12-25', name: 'Navidad' },
    
    // 2025
    { date: '2025-01-01', name: 'Año Nuevo' },
    { date: '2025-04-17', name: 'Jueves Santo' },
    { date: '2025-04-18', name: 'Viernes Santo' },
    { date: '2025-05-01', name: 'Día del Trabajador' },
    { date: '2025-06-29', name: 'San Pedro y San Pablo' },
    { date: '2025-07-23', name: 'Día del Trabajador' },
    { date: '2025-07-28', name: 'Independencia del Perú' },
    { date: '2025-07-29', name: 'Independencia del Perú' },
    { date: '2025-08-30', name: 'Santa Rosa de Lima' },
    { date: '2025-10-08', name: 'Combate de Angamos' },
    { date: '2025-11-01', name: 'Todos los Santos' },
    { date: '2025-12-08', name: 'Inmaculada Concepción' },
    { date: '2025-12-25', name: 'Navidad' },
  ];

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  private isHoliday(date: Date): boolean {
    const dateStr = this.formatDate(date);
    return this.holidays.some(holiday => holiday.date === dateStr);
  }

  isBusinessDay(date: Date): boolean {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  addBusinessDays(startDate: Date, businessDays: number): Date {
    let currentDate = new Date(startDate);
    let daysAdded = 0;

    while (daysAdded < businessDays) {
      currentDate.setDate(currentDate.getDate() + 1);
      
      if (this.isBusinessDay(currentDate)) {
        daysAdded++;
      }
    }

    return currentDate;
  }

  subtractBusinessDays(startDate: Date, businessDays: number): Date {
    let currentDate = new Date(startDate);
    let daysSubtracted = 0;

    while (daysSubtracted < businessDays) {
      currentDate.setDate(currentDate.getDate() - 1);
      
      if (this.isBusinessDay(currentDate)) {
        daysSubtracted++;
      }
    }

    return currentDate;
  }

  getBusinessDaysBetween(startDate: Date, endDate: Date): number {
    let currentDate = new Date(startDate);
    let businessDays = 0;

    while (currentDate < endDate) {
      if (this.isBusinessDay(currentDate)) {
        businessDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return businessDays;
  }

  getRemainingBusinessDays(dueDate: Date, currentDate: Date = new Date()): number {
    if (dueDate <= currentDate) {
      return 0;
    }
    
    return this.getBusinessDaysBetween(currentDate, dueDate);
  }

  // Check if a complaint is overdue according to DS 101-2022-PCM (15 business days)
  isComplaintOverdue(submissionDate: Date, responseDate?: Date, currentDate: Date = new Date()): boolean {
    const dueDate = this.addBusinessDays(submissionDate, 15);
    
    if (responseDate) {
      return responseDate > dueDate;
    }
    
    return currentDate > dueDate;
  }

  // Get the deadline for a complaint response (15 business days from submission)
  getComplaintDeadline(submissionDate: Date): Date {
    return this.addBusinessDays(submissionDate, 15);
  }

  // Get warning dates for complaint deadlines
  getComplaintWarningDates(submissionDate: Date): {
    warningDate: Date; // 10 business days (5 days before due)
    urgentDate: Date;  // 14 business days (1 day before due)
    dueDate: Date;     // 15 business days
  } {
    return {
      warningDate: this.addBusinessDays(submissionDate, 10),
      urgentDate: this.addBusinessDays(submissionDate, 14),
      dueDate: this.addBusinessDays(submissionDate, 15),
    };
  }

  // Get all holidays for a given year
  getHolidaysForYear(year: number): Holiday[] {
    return this.holidays.filter(holiday => holiday.date.startsWith(year.toString()));
  }

  // Calculate ARCO request deadline (typically 10-15 business days for different request types)
  getArcoRequestDeadline(submissionDate: Date, requestType: string): Date {
    // Different deadlines for different ARCO request types according to Ley 29733
    const businessDays = {
      'access': 10,        // Access to personal data
      'rectification': 10, // Correction of data
      'cancellation': 15,  // Deletion of data
      'opposition': 10,    // Opposition to processing
    }[requestType] || 15;

    return this.addBusinessDays(submissionDate, businessDays);
  }
}

export const businessDayCalculator = new BusinessDayCalculator();

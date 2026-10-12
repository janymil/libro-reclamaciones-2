// Business day calculator for Peru
// Excludes weekends and Peruvian national holidays.
//
// The holiday data itself lives in `@shared/peru-holidays`, which is also used by
// the client (public complaint form, deadline badges). Keeping a single copy means
// the deadline shown to a consumer can never disagree with the deadline the
// backend enforces.

import {
  addPeruBusinessDays,
  countPeruBusinessDaysBetween,
  countPeruBusinessDaysRemaining,
  getPeruHolidaysForYear,
  isPeruBusinessDay,
  type PeruHoliday,
} from "@shared/peru-holidays";

class BusinessDayCalculator {
  isBusinessDay(date: Date): boolean {
    return isPeruBusinessDay(date);
  }

  addBusinessDays(startDate: Date, businessDays: number): Date {
    return addPeruBusinessDays(startDate, businessDays);
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
    return countPeruBusinessDaysBetween(startDate, endDate);
  }

  getRemainingBusinessDays(dueDate: Date, currentDate: Date = new Date()): number {
    return countPeruBusinessDaysRemaining(dueDate, currentDate);
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
  getHolidaysForYear(year: number): PeruHoliday[] {
    return getPeruHolidaysForYear(year);
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

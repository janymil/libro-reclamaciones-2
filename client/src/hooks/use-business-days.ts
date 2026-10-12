import {
  addPeruBusinessDays,
  countPeruBusinessDaysRemaining,
  isPeruBusinessDay,
} from "@shared/peru-holidays";

export function useBusinessDays() {
  const isBusinessDay = (date: Date): boolean => isPeruBusinessDay(date);

  const addBusinessDays = (startDate: Date, businessDays: number): Date =>
    addPeruBusinessDays(startDate, businessDays);

  const getBusinessDaysRemaining = (dueDate: Date, currentDate: Date = new Date()): number =>
    countPeruBusinessDaysRemaining(dueDate, currentDate);

  const isOverdue = (dueDate: Date, currentDate: Date = new Date()): boolean => {
    return currentDate > dueDate;
  };

  const getDaysUntilDue = (dueDate: Date, currentDate: Date = new Date()): number => {
    const diffTime = dueDate.getTime() - currentDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getUrgencyLevel = (dueDate: Date, currentDate: Date = new Date()): 'overdue' | 'urgent' | 'warning' | 'normal' => {
    const businessDaysRemaining = getBusinessDaysRemaining(dueDate, currentDate);
    
    if (businessDaysRemaining <= 0) return 'overdue';
    if (businessDaysRemaining <= 1) return 'urgent';
    if (businessDaysRemaining <= 3) return 'warning';
    return 'normal';
  };

  return {
    isBusinessDay,
    addBusinessDays,
    getBusinessDaysRemaining,
    isOverdue,
    getDaysUntilDue,
    getUrgencyLevel,
  };
}

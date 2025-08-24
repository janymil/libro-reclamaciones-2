import { useMemo } from "react";
import { PERUVIAN_HOLIDAYS_2024_2025 } from "@/lib/constants";

export function useBusinessDays() {
  const holidays = useMemo(() => new Set(PERUVIAN_HOLIDAYS_2024_2025), []);

  const isBusinessDay = (date: Date): boolean => {
    const day = date.getDay();
    if (day === 0 || day === 6) return false; // Weekend
    
    const dateStr = date.toISOString().split('T')[0];
    return !holidays.has(dateStr);
  };

  const addBusinessDays = (startDate: Date, businessDays: number): Date => {
    let currentDate = new Date(startDate);
    let daysAdded = 0;

    while (daysAdded < businessDays) {
      currentDate.setDate(currentDate.getDate() + 1);
      
      if (isBusinessDay(currentDate)) {
        daysAdded++;
      }
    }

    return currentDate;
  };

  const getBusinessDaysRemaining = (dueDate: Date, currentDate: Date = new Date()): number => {
    if (dueDate <= currentDate) {
      return 0;
    }
    
    let count = 0;
    let date = new Date(currentDate);
    
    while (date < dueDate) {
      if (isBusinessDay(date)) {
        count++;
      }
      date.setDate(date.getDate() + 1);
    }
    
    return count;
  };

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

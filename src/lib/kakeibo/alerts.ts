export type AlertInput = {
  budget: number;
  spent: number;
  isCurrentMonth: boolean;
  dayIndex: number;
  monthDays: number;
};

export type AlertState = {
  remainingAlert: boolean;
  paceAlert: boolean;
  red: boolean;
};

/**
 * Chapter 8. Remaining: spent/budget >= 0.80, or budget 0 with spent > 0.
 * Pace: current month only, skip day 1 and budget 0.
 * pace_exceeded = spent/budget > (dayIndex/monthDays) + 0.10
 */
export function categoryAlert(input: AlertInput): AlertState {
  const { budget, spent, isCurrentMonth, dayIndex, monthDays } = input;
  let remainingAlert = false;
  if (budget > 0) {
    remainingAlert = spent / budget >= 0.8;
  } else if (spent > 0) {
    remainingAlert = true;
  }

  let paceAlert = false;
  if (isCurrentMonth && budget > 0 && dayIndex > 1 && monthDays > 0) {
    paceAlert = spent / budget > dayIndex / monthDays + 0.1;
  }

  return {
    remainingAlert,
    paceAlert,
    red: remainingAlert || paceAlert,
  };
}

export function monthSurplus(input: {
  netIncome: number;
  spentNonSavings: number;
  spentSavingsUser: number;
}): number {
  return input.netIncome - input.spentNonSavings - input.spentSavingsUser;
}

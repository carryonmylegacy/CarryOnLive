/**
 * MessagesPage — module-level constants.
 *
 * Extracted from MessagesPage.js during Monolith Reduction 5/6 (Feb 2026).
 * Pure data — no React, no state. Centralized so the icons + event
 * options can be reused if the milestone trigger UI is ever refactored
 * into a sub-component without re-defining them.
 */
import { Send, Calendar, Star, CalendarDays, Gift, GraduationCap, Heart } from 'lucide-react';

export const triggerIcons = {
  immediate: Send,
  age_milestone: Calendar,
  event: Star,
  specific_date: CalendarDays,
};

export const eventTypes = [
  { value: 'birthday', label: 'Birthday', icon: Gift },
  { value: 'graduation', label: 'Graduation', icon: GraduationCap },
  { value: 'marriage', label: 'Marriage', icon: Heart },
  { value: 'custom', label: 'Custom Event', icon: Star },
];

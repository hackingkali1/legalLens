import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle } from 'lucide-react';
import { AttentionLevel } from '@/types/clause';

interface AttentionBadgeProps {
  level: AttentionLevel;
  className?: string;
  showIcon?: boolean;
}

export function AttentionBadge({ level, className = '', showIcon = true }: AttentionBadgeProps) {
  const configs = {
    high: {
      label: 'High attention',
      bg: 'bg-rose-50 border-rose-300 text-rose-800',
      icon: <AlertOctagon className="w-4 h-4 text-rose-700 shrink-0" aria-hidden="true" />,
      ariaLabel: 'High attention required clause',
    },
    medium: {
      label: 'Medium attention',
      bg: 'bg-amber-50 border-amber-300 text-amber-800',
      icon: <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />,
      ariaLabel: 'Medium attention recommended clause',
    },
    low: {
      label: 'Low attention',
      bg: 'bg-emerald-50 border-emerald-300 text-emerald-800',
      icon: <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />,
      ariaLabel: 'Low attention standard clause',
    },
  };

  const config = configs[level] || configs.low;

  return (
    <span
      role="status"
      aria-label={config.ariaLabel}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${className}`}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
    </span>
  );
}

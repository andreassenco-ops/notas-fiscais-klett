import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: number;
    label: string;
  };
  variant?: "default" | "success" | "warning" | "destructive" | "whatsapp";
}

const variantStyles = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  whatsapp: "text-whatsapp",
};

const iconBgStyles = {
  default: "bg-primary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  destructive: "bg-destructive/10",
  whatsapp: "bg-whatsapp/10",
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  variant = "default",
}: StatsCardProps) {
  return (
    <div className="stats-card card-hover">
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn("text-3xl font-bold mt-1 tabular-nums", variantStyles[variant])}>
              {value}
            </p>
          </div>
          <div className={cn("p-2.5 rounded-lg", iconBgStyles[variant])}>
            <Icon className={cn("h-5 w-5", variantStyles[variant])} />
          </div>
        </div>
        
        {description && (
          <p className="text-sm text-muted-foreground mt-2">{description}</p>
        )}
        
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <span
              className={cn(
                "text-sm font-medium",
                trend.value >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
            <span className="text-sm text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

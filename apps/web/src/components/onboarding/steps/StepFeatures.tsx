import { SelectableCard } from '../shared/SelectableCard'
import { StepLayout } from '../shared/StepLayout'
import {
  CheckSquare, MessageCircle, FileText, Bot,
  Calendar, BarChart3, ExternalLink, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FeatureOption {
  key: string
  label: string
  description: string
  icon: LucideIcon
}

const FEATURES: FeatureOption[] = [
  {
    key: 'task_management',
    label: 'Task & Project Management',
    description: 'Assign tasks, track progress, set deadlines',
    icon: CheckSquare,
  },
  {
    key: 'team_messaging',
    label: 'Team Messaging',
    description: 'Real-time chat by channel or department',
    icon: MessageCircle,
  },
  {
    key: 'document_collaboration',
    label: 'Document Collaboration',
    description: 'Shared docs, wikis, and file storage',
    icon: FileText,
  },
  {
    key: 'meeting_ai_bot',
    label: 'Meeting AI Bot',
    description: 'Joins meetings, syncs notes to your calendar automatically',
    icon: Bot,
  },
  {
    key: 'calendar_scheduling',
    label: 'Calendar & Scheduling',
    description: 'Sync with Outlook or Google Calendar',
    icon: Calendar,
  },
  {
    key: 'analytics_reporting',
    label: 'Analytics & Reporting',
    description: 'Dashboards and performance insights',
    icon: BarChart3,
  },
  {
    key: 'client_portal',
    label: 'Client Portal',
    description: 'Share updates and files with external clients',
    icon: ExternalLink,
  },
  {
    key: 'automations_workflows',
    label: 'Automations & Workflows',
    description: 'Automate repetitive tasks and approvals',
    icon: Zap,
  },
]

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepFeatures({ value, onChange, onBack, onContinue, onSkip }: Props) {
  const toggle = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter((v) => v !== key))
    } else {
      onChange([...value, key])
    }
  }

  return (
    <StepLayout
      step={5}
      totalSteps={8}
      heading="What features interest you most?"
      subheading="We'll prioritize these in your setup."
      canContinue={true}
      onBack={onBack}
      onContinue={onContinue}
      isOptional
      onSkip={onSkip}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
        {FEATURES.map((feat) => (
          <SelectableCard
            key={feat.key}
            icon={feat.icon}
            label={feat.label}
            description={feat.description}
            selected={value.includes(feat.key)}
            onClick={() => toggle(feat.key)}
          />
        ))}
      </div>
    </StepLayout>
  )
}

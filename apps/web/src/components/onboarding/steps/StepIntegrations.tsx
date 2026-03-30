import { SelectableCard } from '../shared/SelectableCard'
import { StepLayout } from '../shared/StepLayout'
import {
  Mail, MessageSquare, Globe, Hash, Video,
  ListTodo, FileText, Users, BarChart3, DollarSign,
  ShoppingBag, XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface IntegrationOption {
  name: string
  icon: LucideIcon
}

const INTEGRATIONS: IntegrationOption[] = [
  { name: 'Microsoft Outlook', icon: Mail },
  { name: 'Microsoft Teams', icon: MessageSquare },
  { name: 'Google Workspace', icon: Globe },
  { name: 'Slack', icon: Hash },
  { name: 'Zoom', icon: Video },
  { name: 'Asana', icon: ListTodo },
  { name: 'Notion', icon: FileText },
  { name: 'HubSpot', icon: Users },
  { name: 'Salesforce', icon: BarChart3 },
  { name: 'QuickBooks', icon: DollarSign },
  { name: 'Shopify', icon: ShoppingBag },
]

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export function StepIntegrations({ value, onChange, onBack, onContinue, onSkip }: Props) {
  const noneSelected = value.includes('None of the above')

  const toggleIntegration = (name: string) => {
    if (name === 'None of the above') {
      onChange(noneSelected ? [] : ['None of the above'])
      return
    }

    // Remove "None of the above" if selecting an integration
    const filtered = value.filter((v) => v !== 'None of the above')

    if (filtered.includes(name)) {
      onChange(filtered.filter((v) => v !== name))
    } else {
      onChange([...filtered, name])
    }
  }

  return (
    <StepLayout
      step={4}
      totalSteps={8}
      heading="Do you use any of these tools?"
      subheading="Connect your existing tools to Nexus Collab."
      canContinue={true}
      onBack={onBack}
      onContinue={onContinue}
      isOptional
      onSkip={onSkip}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
        {INTEGRATIONS.map((int) => (
          <SelectableCard
            key={int.name}
            icon={int.icon}
            label={int.name}
            selected={!noneSelected && value.includes(int.name)}
            onClick={() => toggleIntegration(int.name)}
          />
        ))}

        {/* None option */}
        <SelectableCard
          icon={XCircle}
          label="None of the above"
          selected={noneSelected}
          onClick={() => toggleIntegration('None of the above')}
        />
      </div>
    </StepLayout>
  )
}

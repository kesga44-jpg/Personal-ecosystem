import '@ecosystem/sidequest/theme.css';
import SidequestApp from '@ecosystem/sidequest/App';
import type { ModuleLink } from '@ecosystem/ui';

export default function QuestModule({ links }: { links: ModuleLink[] }) {
  return <SidequestApp basename="/quest" moduleLinks={links} />;
}

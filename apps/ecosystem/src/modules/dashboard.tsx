import HubApp from '@ecosystem/hub/App';
import type { ModuleLink } from '@ecosystem/ui';
import { moduleUrl } from '../modules';

export default function DashboardModule({ links }: { links: ModuleLink[] }) {
  const origin = window.location.origin;
  return <HubApp basename="/" moduleLinks={links} moduleUrls={{ sport: moduleUrl('sport', origin), sidequest: moduleUrl('quest', origin) }} />;
}

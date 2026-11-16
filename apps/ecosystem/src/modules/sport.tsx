import '@ecosystem/sportapp/theme.css';
import SportApp from '@ecosystem/sportapp/App';
import type { ModuleLink } from '@ecosystem/ui';

export default function SportModule({ links }: { links: ModuleLink[] }) {
  return <SportApp basename="/sport" moduleLinks={links} />;
}

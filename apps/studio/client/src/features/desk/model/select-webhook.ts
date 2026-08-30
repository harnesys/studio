import { useStudioNavigation } from '@/shared/config/navigation';

export function useSelectWebhook() {
  const { openWebhook } = useStudioNavigation();
  return openWebhook;
}

import { useStudioNavigation } from '@/shared/config/navigation';

export function useSelectSchedule() {
  const { openSchedule } = useStudioNavigation();
  return openSchedule;
}

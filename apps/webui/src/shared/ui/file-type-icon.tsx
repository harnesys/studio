import { Icon } from '@iconify/react';
import { getFileIcon } from '@/shared/lib/file-icon';
import { cn } from '@/shared/lib/utils';
export function FileTypeIcon({
  name,
  mediaType,
  className,
  monochrome = false,
}: {
  name: string;
  mediaType?: string | null;
  className?: string;
  monochrome?: boolean;
}) {
  const { icon, className: color } = getFileIcon(name, mediaType);
  return (
    <Icon
      icon={icon}
      className={cn(monochrome ? 'text-muted-foreground' : color, className)}
      aria-hidden
    />
  );
}

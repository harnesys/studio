import { cn } from '@/shared/lib/utils';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

import { useOverlayStore } from './store';

export function OverlayProvider() {
  return (
    <>
      <DialogHost />
      <AlertHost />
    </>
  );
}

function DialogHost() {
  const { kind, component: Component, options, resolver, close } = useOverlayStore();

  function handleOpenChange(isOpen: boolean) {
    if (isOpen || !options) {
      return;
    }
    if (options.cancellable === false) {
      return;
    }
    if (resolver) {
      resolver();
    } else {
      close();
    }
  }

  if (kind !== 'dialog' || !Component || !options) {
    return null;
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid={options.testId}
        className={cn('flex max-h-[90vh] min-h-0 flex-col', options.className ?? 'sm:max-w-md')}
      >
        {(options.title || options.description) && (
          <DialogHeader>
            {options.title ? <DialogTitle>{options.title}</DialogTitle> : null}
            {options.description ? (
              <DialogDescription>{options.description}</DialogDescription>
            ) : null}
          </DialogHeader>
        )}
        <Component onResolve={resolver ?? undefined} data={options.data} />
      </DialogContent>
    </Dialog>
  );
}

function AlertHost() {
  const { kind, component: Component, options, resolver, close } = useOverlayStore();

  function handleOpenChange(isOpen: boolean) {
    if (isOpen || !options) {
      return;
    }
    if (options.cancellable === false) {
      return;
    }
    if (resolver) {
      resolver();
    } else {
      close();
    }
  }

  if (kind !== 'alert' || !Component || !options) {
    return null;
  }

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent
        size={options.size}
        className={cn(options.className)}
        data-testid={options.testId}
      >
        <AlertDialogHeader>
          {options.title ? <AlertDialogTitle>{options.title}</AlertDialogTitle> : null}
          {options.description ? (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <Component onResolve={resolver ?? undefined} data={options.data} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

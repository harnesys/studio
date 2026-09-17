import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Providers } from '@/app/providers/providers';
import { Root } from '@/app/ui/root';
import '@/app/styles/index.css';
import '@/shared/lib/chat-preferences';

// Monaco workers load with the file editor, not on every desk paint.

const root = document.getElementById('root');
if (!root) {
  throw new Error('root element is missing');
}

createRoot(root).render(
  <StrictMode>
    <Providers>
      <Root />
    </Providers>
  </StrictMode>,
);

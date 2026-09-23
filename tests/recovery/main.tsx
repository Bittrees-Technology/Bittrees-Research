import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatRecoveryExport } from '../../src/components/ChatRecoveryExport';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<main style={{ padding: 16, maxWidth: 650, margin: 'auto' }}><ChatRecoveryExport /></main>);

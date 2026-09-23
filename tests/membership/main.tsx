import '../../src/index.css';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Routes, Route} from 'react-router';
import Layout from '../../src/components/layout/Layout';
createRoot(document.getElementById('root')!).render(<MemoryRouter><Routes><Route element={<Layout/>}><Route index element={<h1>Synthetic member content</h1>}/></Route></Routes></MemoryRouter>);

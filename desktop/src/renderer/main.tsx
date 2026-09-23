import {createRoot} from 'react-dom/client';
import {App} from './App.tsx';
import {installTheme} from './theme.ts';
import './app.css';

installTheme();
createRoot(document.getElementById('root')!).render(<App />);

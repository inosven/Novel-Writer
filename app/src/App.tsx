import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Planning from './pages/Planning';
import Writing from './pages/Writing';
import Characters from './pages/Characters';
import Outline from './pages/Outline';
import { useProjectStore } from './stores/projectStore';
import { useConfigStore } from './stores/configStore';

function App() {
  const { loadConfig } = useConfigStore();
  const { projectPath } = useProjectStore();

  // Load config on startup
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Setup before quit handler
  useEffect(() => {
    if (!window.electronAPI?.app?.onBeforeQuit) {
      console.warn('electronAPI not available, skipping beforeQuit handler');
      return;
    }

    const cleanup = window.electronAPI.app.onBeforeQuit(() => {
      // Save any pending state
      console.log('App is closing, saving state...');
    });

    return cleanup;
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="planning"
          element={projectPath ? <Planning /> : <Navigate to="/" replace />}
        />
        <Route
          path="writing"
          element={projectPath ? <Writing /> : <Navigate to="/" replace />}
        />
        <Route
          path="characters"
          element={projectPath ? <Characters /> : <Navigate to="/" replace />}
        />
        <Route
          path="outline"
          element={projectPath ? <Outline /> : <Navigate to="/" replace />}
        />
      </Route>
    </Routes>
  );
}

export default App;

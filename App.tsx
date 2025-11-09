import React, { useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import ToolGrid from './components/ToolGrid';
import Footer from './components/Footer';
import ToolPage from './components/ToolPage';
import type { Tool } from './constants/tools';

const App: React.FC = () => {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const handleSelectTool = (tool: Tool) => {
    setSelectedTool(tool);
  };

  const handleGoHome = () => {
    setSelectedTool(null);
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col font-sans">
      <Header />
      <main className="flex-grow">
        {selectedTool ? (
          <ToolPage tool={selectedTool} onBack={handleGoHome} />
        ) : (
          <>
            <Hero />
            <ToolGrid onSelectTool={handleSelectTool} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default App;
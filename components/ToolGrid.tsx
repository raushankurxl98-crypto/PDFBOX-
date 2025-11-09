import React from 'react';
import ToolCard from './ToolCard';
import { PDF_TOOLS } from '../constants/tools';
import type { Tool } from '../constants/tools';

interface ToolGridProps {
  onSelectTool: (tool: Tool) => void;
}

const ToolGrid: React.FC<ToolGridProps> = ({ onSelectTool }) => {
  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {PDF_TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onSelect={() => onSelectTool(tool)} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default ToolGrid;
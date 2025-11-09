import React from 'react';
import type { Tool } from '../constants/tools';

interface ToolCardProps {
  tool: Tool;
  onSelect: () => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ tool, onSelect }) => {
  return (
    <button onClick={onSelect} className="group flex flex-col p-6 bg-white rounded-xl shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-in-out border border-transparent hover:border-red-200 text-left w-full">
      <div className={`mb-4 ${tool.color}`}>
        {tool.icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-800 group-hover:text-red-600 transition-colors duration-300">
        {tool.title}
      </h3>
      <p className="mt-2 text-sm text-gray-500 flex-grow">
        {tool.description}
      </p>
    </button>
  );
};

export default ToolCard;
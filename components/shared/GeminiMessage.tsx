
import React from 'react';
import LoadingSpinner from './LoadingSpinner';

interface GeminiMessageProps {
  title?: string;
  message: string | null;
  isLoading: boolean;
  error?: string | null;
}

const GeminiMessage: React.FC<GeminiMessageProps> = ({ title = "Gemini 的建議", message, isLoading, error }) => {
  if (!message && !isLoading && !error) return null; // Don't render if nothing to show

  return (
    <div className="mt-6 p-4 bg-gray-700 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-purple-400 mb-2">{title}</h3>
      {isLoading && <LoadingSpinner size="sm" />}
      {error && !isLoading && <p className="text-red-400 italic">{error}</p>}
      {message && !isLoading && !error && <p className="text-gray-300 whitespace-pre-wrap">{message}</p>}
    </div>
  );
};

export default GeminiMessage;

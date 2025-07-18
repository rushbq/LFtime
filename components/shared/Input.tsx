
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  wrapperClassName?: string;
}

const Input: React.FC<InputProps> = ({ label, id, wrapperClassName = '', className = '', ...props }) => {
  const baseClasses = "w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors duration-150 ease-in-out text-gray-100 placeholder-gray-400";
  return (
    <div className={`mb-4 ${wrapperClassName}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input id={id} className={`${baseClasses} ${className}`} {...props} />
    </div>
  );
};

export default Input;

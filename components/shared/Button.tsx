
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ children, className = '', variant = 'primary', isLoading = false, ...props }) => {
  const baseClasses = "px-6 py-2 font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2";
  
  let variantClasses = '';
  if (variant === 'primary') {
    variantClasses = 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white shadow-md';
  } else if (variant === 'secondary') {
    variantClasses = 'bg-gray-600 hover:bg-gray-500 focus:ring-gray-400 text-gray-200';
  }

  return (
    <button className={`${baseClasses} ${variantClasses} ${className}`} disabled={isLoading || props.disabled} {...props}>
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;

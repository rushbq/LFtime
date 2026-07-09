import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  wrapperClassName?: string;
}

const Input: React.FC<InputProps> = ({ label, id, wrapperClassName = '', className = '', ...props }) => {
  return (
    <div className={`field ${wrapperClassName}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className={className} {...props} />
    </div>
  );
};

export default Input;

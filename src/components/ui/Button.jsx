import React from 'react';

export default function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
  return <button type={type} className={`pos-button pos-button-${variant} pos-button-${size} ${className}`} {...props} />;
}

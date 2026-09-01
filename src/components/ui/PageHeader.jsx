import React from 'react';

export default function PageHeader({ title, description, eyebrow, actions }) {
  return <header className="pos-page-header"><div>{eyebrow && <p className="pos-eyebrow">{eyebrow}</p>}<h1 className="pos-page-title">{title}</h1>{description && <p className="pos-page-description">{description}</p>}</div>{actions && <div className="pos-page-actions">{actions}</div>}</header>;
}

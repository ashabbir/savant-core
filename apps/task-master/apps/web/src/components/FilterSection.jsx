import React, { useState } from 'react';

function FilterSection({ title, actions, children, initialOpen = false }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  return (
    <div className="filtersSection">
      <div className="filtersHeader" onClick={() => setIsOpen(!isOpen)}>
        <div className="filtersTitle">{title}</div>
        <div className="filtersActions">
          {actions}
          <button className="tiny">{isOpen ? '−' : '+'}</button>
        </div>
      </div>
      {isOpen && children}
    </div>
  );
}

export default FilterSection;

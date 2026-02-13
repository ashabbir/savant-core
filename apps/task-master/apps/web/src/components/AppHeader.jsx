import React from 'react';

function AppHeader({ leftCollapsed, onToggleLeft, rightCollapsed, onToggleRight, selectedProjectId }) {
  return (
    <header className="topHeader">
      <button
        className="tiny secondary headerHamburger"
        onClick={onToggleLeft}
        title={leftCollapsed ? 'Expand filters' : 'Collapse filters'}
        aria-label="Toggle filters"
      >
        ☰
      </button>
      <div className="topHeaderTitle">Task Master</div>
      <button
        className="tiny secondary rightToggle"
        onClick={onToggleRight}
        title={rightCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        aria-label="Toggle activity sidebar"
      >
        ☰
      </button>
    </header>
  );
}

export default AppHeader;

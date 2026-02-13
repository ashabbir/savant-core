import React from 'react';

function BoardHeader({ title, color, onBack, backLabel, backColor, rightActions }) {
  return (
    <header className="header">
      <div className="headerLeft">
        {onBack ? (
          <button
            className="tiny secondary"
            onClick={onBack}
            style={backColor ? { color: backColor, borderColor: backColor } : undefined}
          >
            ← {backLabel}
          </button>
        ) : null}
        <h1 style={{ color: color || 'inherit', display: 'flex', gap: '8px', alignItems: 'center' }}>{title}</h1>
      </div>
      <div className="row">
        {rightActions}
      </div>
    </header>
  );
}

export default BoardHeader;

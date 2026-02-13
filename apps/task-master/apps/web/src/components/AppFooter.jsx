import React from 'react';

function AppFooter({ children = null }) {
  return (
    <footer className="appFooter">
      <div className="appFooterMeta">
        <span className="mono" style={{ opacity: 0.8 }}>Project X</span>
        <span style={{ opacity: 0.8 }}>·</span>
        <a href="http://localhost:3333/api/activity" target="_blank" rel="noreferrer">Activity</a>
        <span style={{ opacity: 0.8 }}>·</span>
        <span style={{ opacity: 0.8 }}>v1</span>
      </div>
      <div className="appFooterActions">
        {children}
      </div>
    </footer>
  );
}

export default AppFooter;

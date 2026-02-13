import React from 'react';

function ControlNav({ currentView, onNavigate, onToggleTheme, theme, isAdmin }) {
  return (
    <nav className="mainNav">
      <div className="navTop">
        <div className="navBrand faded">Project X</div>
        <div className="navLinks">
          <button
            className={currentView === 'board' ? 'text-btn active' : 'text-btn'}
            onClick={() => onNavigate('board')}
            title="Board"
          >
            B
          </button>
          <button
            className={currentView === 'epics' ? 'text-btn active' : 'text-btn'}
            onClick={() => onNavigate('epics')}
            title="Epics"
          >
            E
          </button>
        </div>
      </div>

      <div className="navBottom">
        <button onClick={onToggleTheme} className="text-btn" title="Toggle Theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        {isAdmin ? (
          <>
            <button
              className={currentView === 'agents' ? 'text-btn active' : 'text-btn'}
              onClick={() => onNavigate('agents')}
              title="Subagents"
            >
              S
            </button>
            <button
              className={currentView === 'providers' ? 'text-btn active' : 'text-btn'}
              onClick={() => onNavigate('providers')}
              title="LLM Providers"
            >
              L
            </button>
            <button
              className={currentView === 'adminUsers' ? 'text-btn active' : 'text-btn'}
              onClick={() => onNavigate('adminUsers')}
              title="Users"
            >
              U
            </button>
          </>
        ) : null}
        <button
          className={currentView === 'profile' ? 'text-btn active' : 'text-btn'}
          onClick={() => onNavigate('profile')}
          title="Profile"
        >
          P
        </button>
        <button className="text-btn" onClick={() => onNavigate('logout')} title="Logout">⎋</button>
      </div>
    </nav>
  );
}

export default ControlNav;
